// ResiliNet nowcast engine.
// Runs lazily on incoming requests (Cloudflare Pages has no cron in hosted deploy):
// each tick synthesises sensor observations for the current sim mode, fuses them into
// hazard probabilities, updates ensemble confidences + village risk, raises alerts when
// thresholds are crossed, and persists everything to D1.

import type { Mode, Risk, Severity, VillageRow, ModelRow, SensorRow } from './types'

const TICK_INTERVAL_MS = 20_000
const READING_RETENTION_MIN = 6 * 60
const RUN_RETENTION_MIN = 24 * 60

// ---------- deterministic noise ----------
function hash(n: number) {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
// smooth-ish noise in [0,1) by lerping between minute buckets
function noise(seed: number, tMinutes: number) {
  const a = Math.floor(tMinutes), f = tMinutes - a
  const s = f * f * (3 - 2 * f)
  return hash(seed * 7919 + a) * (1 - s) + hash(seed * 7919 + a + 1) * s
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d

// ---------- observations ----------
export interface Observation {
  rain_rate: number; stream_level: number; strikes: number; wind_gust: number
  max_dbz: number; humidity: number; cell_speed_kmh: number
}

export function synthObservation(mode: Mode, tMin: number, tOffset = 0): Observation {
  // tOffset lets the forecast endpoint project the same generator forward/backward
  const t = tMin + tOffset
  const n = (seed: number) => noise(seed, t / 3)
  if (mode === 'severe') {
    // intensify slightly toward +30m, decay after
    const env = 1 - clamp(Math.abs(tOffset) / 200, 0, 0.3) // peak now, taper at ±60m
    return {
      rain_rate: round(lerp(64, 98, n(1)) * env),
      stream_level: round(lerp(3.6, 4.6, n(2)) * lerp(0.9, 1.04, env), 2),
      strikes: Math.round(lerp(11, 26, n(3)) * env),
      wind_gust: round(lerp(52, 74, n(4)) * env),
      max_dbz: round(lerp(61, 72, n(5)) * env),
      humidity: round(lerp(91, 98, n(6))),
      cell_speed_kmh: round(lerp(36, 48, n(7))),
    }
  }
  return {
    rain_rate: round(lerp(0, 4.5, n(1)) * lerp(0.7, 1.2, n(8))),
    stream_level: round(lerp(1.0, 1.45, n(2)), 2),
    strikes: n(3) > 0.85 ? 1 : 0,
    wind_gust: round(lerp(7, 19, n(4))),
    max_dbz: round(lerp(16, 34, n(5))),
    humidity: round(lerp(54, 76, n(6))),
    cell_speed_kmh: round(lerp(8, 16, n(7))),
  }
}

// ---------- fusion ----------
export interface Hazards {
  flood_prob: number; lightning_prob: number; wind_prob: number; convection_prob: number
  verdict: 'SEVERE CONVECTION' | 'ELEVATED' | 'STABLE'
}

export function fuse(o: Observation): Hazards {
  const rainTerm = clamp((o.rain_rate - 15) / 65)
  const streamTerm = clamp((o.stream_level - 1.5) / 2.6)
  const flood_prob = clamp(0.55 * streamTerm + 0.45 * rainTerm)
  const lightning_prob = clamp(o.strikes / 20)
  const wind_prob = clamp((o.wind_gust - 25) / 50)
  const convection_prob = clamp((o.max_dbz - 30) / 40)
  const peak = Math.max(flood_prob, lightning_prob, wind_prob, convection_prob)
  const verdict = peak >= 0.7 ? 'SEVERE CONVECTION' : peak >= 0.4 ? 'ELEVATED' : 'STABLE'
  return {
    flood_prob: round(flood_prob, 3), lightning_prob: round(lightning_prob, 3),
    wind_prob: round(wind_prob, 3), convection_prob: round(convection_prob, 3), verdict,
  }
}

// per-village vulnerability weights (flood, lightning, wind)
const VULN: Record<string, [number, number, number]> = {
  syabrubesi: [1.0, 0.8, 0.5],
  dhunche: [0.85, 0.6, 0.9],
  kalikasthan: [0.7, 0.5, 0.4],
  langtang: [0.6, 0.7, 0.6],
  trishuli: [0.75, 0.3, 0.3],
}

export function villageRisk(slug: string, h: Hazards): Risk {
  const [wf, wl, ww] = VULN[slug] ?? [0.7, 0.5, 0.5]
  const score = Math.max(h.flood_prob * wf, h.lightning_prob * wl, h.wind_prob * ww, h.convection_prob * 0.6)
  if (score >= 0.72) return 'RED'
  if (score >= 0.5) return 'AMBER'
  if (score >= 0.28) return 'YELLOW'
  return 'GREEN'
}

export function modelConfidence(code: string, mode: Mode, tMin: number) {
  const base: Record<string, [number, number, number]> = {
    DIFF: [88, 92, 71], GNN: [84, 89, 63], LSTM: [87, 94, 82], HYDR: [79, 86, 44],
  }
  const [clear, severe, load] = base[code] ?? [85, 90, 50]
  const seed = code.charCodeAt(0) * 31 + code.charCodeAt(1)
  const jitter = (noise(seed, tMin / 2) - 0.5) * 3
  const loadJitter = (noise(seed + 99, tMin / 1.5) - 0.5) * 12 + (mode === 'severe' ? 8 : 0)
  return {
    confidence: round(clamp((mode === 'severe' ? severe : clear) + jitter, 60, 99)),
    gpu_load: Math.round(clamp(load + loadJitter, 10, 99)),
  }
}

// ---------- alert rules ----------
interface Rule {
  hazard: string; severity: Severity; test: (o: Observation, h: Hazards) => boolean
  title: (o: Observation, h: Hazards) => string; body: (o: Observation, h: Hazards) => string
  villageSlug: string; eta: number | null; cooldownMin: number
}
const RULES: Rule[] = [
  {
    hazard: 'CONVECTION', severity: 'CRITICAL', villageSlug: 'syabrubesi', eta: 25, cooldownMin: 30,
    test: (o) => o.max_dbz >= 60,
    title: (o) => `Convective cell ${Math.round(o.max_dbz)} dBZ · SW quadrant`,
    body: (o) => `ConvLSTM detects intensifying cell moving NE at ${Math.round(o.cell_speed_kmh)} km/h.`,
  },
  {
    hazard: 'FLOOD', severity: 'CRITICAL', villageSlug: 'dhunche', eta: 40, cooldownMin: 30,
    test: (_o, h) => h.flood_prob >= 0.8,
    title: (_o, h) => `Flash flood probability ${Math.round(h.flood_prob * 100)}% · Trishuli basin`,
    body: (o) => `Hydro runoff model: stream level ${o.stream_level.toFixed(2)} m at HYD-07 and rising.`,
  },
  {
    hazard: 'LIGHTNING', severity: 'HIGH', villageSlug: 'syabrubesi', eta: 10, cooldownMin: 20,
    test: (o) => o.strikes >= 10,
    title: (o) => `Lightning cluster · ${o.strikes} CG strikes / 5 min`,
    body: () => 'Cloud-to-ground cluster within 3 km of Syabrubesi bazaar.',
  },
  {
    hazard: 'RAIN', severity: 'HIGH', villageSlug: 'kalikasthan', eta: null, cooldownMin: 25,
    test: (o) => o.rain_rate >= 60,
    title: (o) => `Rainfall rate ${Math.round(o.rain_rate)} mm/hr · exceeding threshold`,
    body: () => 'Multiple IoT gauges above the 60 mm/hr warning level.',
  },
  {
    hazard: 'WIND', severity: 'MEDIUM', villageSlug: 'dhunche', eta: null, cooldownMin: 25,
    test: (o) => o.wind_gust >= 55,
    title: (o) => `Wind gusts ${Math.round(o.wind_gust)} km/h · Dhunche ridge`,
    body: () => 'Downdraft signature on radial velocity product.',
  },
  {
    hazard: 'GENERAL', severity: 'LOW', villageSlug: '', eta: null, cooldownMin: 45,
    test: (o) => o.humidity >= 95,
    title: () => 'Elevated humidity anomaly detected',
    body: (o) => `Basin-wide relative humidity ${Math.round(o.humidity)}% · dew-point spread collapsed.`,
  },
]

// ---------- persistence helpers ----------
export async function getState(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare('SELECT key, value FROM system_state').all<{ key: string; value: string }>()
  const out: Record<string, string> = {}
  for (const r of results) out[r.key] = r.value
  return out
}

export async function setState(db: D1Database, key: string, value: string) {
  await db.prepare(
    'INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP',
  ).bind(key, value).run()
}

export async function audit(db: D1Database, actor: string, action: string, target: string | null, details: unknown = null) {
  await db.prepare('INSERT INTO audit_log (actor, action, target, details) VALUES (?, ?, ?, ?)')
    .bind(actor, action, target, details == null ? null : JSON.stringify(details)).run()
}

// ---------- the tick ----------
export interface TickResult {
  ticked: boolean; mode: Mode; observation: Observation; hazards: Hazards; runId?: number
}

export async function tick(db: D1Database, force = false): Promise<TickResult> {
  const state = await getState(db)
  const mode: Mode = state.mode === 'clear' ? 'clear' : 'severe'
  const now = Date.now()
  const last = Number(state.last_tick || 0)
  const tMin = now / 60_000
  const observation = synthObservation(mode, tMin)
  const hazards = fuse(observation)

  if (!force && now - last < TICK_INTERVAL_MS) {
    return { ticked: false, mode, observation, hazards }
  }

  const sensors = (await db.prepare('SELECT * FROM sensors').all<SensorRow>()).results
  const byKind = (k: string) => sensors.find(s => s.kind === k)
  const stmts: D1PreparedStatement[] = []

  // 1. readings
  const readingMap: Array<[string, string, number, string]> = [
    ['gauge', 'rain_rate', observation.rain_rate, 'mm/hr'],
    ['stream', 'stream_level', observation.stream_level, 'm'],
    ['lightning', 'strikes', observation.strikes, '/5min'],
    ['radar', 'max_dbz', observation.max_dbz, 'dBZ'],
    ['radar', 'wind_gust', observation.wind_gust, 'km/h'],
    ['satellite', 'humidity', observation.humidity, '%'],
  ]
  for (const [kind, metric, value, unit] of readingMap) {
    const s = byKind(kind)
    if (s) stmts.push(db.prepare('INSERT INTO sensor_readings (sensor_id, metric, value, unit) VALUES (?, ?, ?, ?)').bind(s.id, metric, value, unit))
  }

  // 2. sensor statuses
  const statusFor = (s: SensorRow) => {
    if (s.kind === 'cctv') return mode === 'severe' ? 'ELEVATED' : 'LIVE'
    if (s.kind === 'stream') return observation.stream_level >= 3.4 ? 'ALERT' : 'LIVE'
    if (s.kind === 'lightning') return observation.strikes >= 10 ? 'ALERT' : 'LIVE'
    if (s.kind === 'gauge') return observation.rain_rate >= 60 ? 'ELEVATED' : 'LIVE'
    return 'LIVE'
  }
  for (const s of sensors) {
    stmts.push(db.prepare('UPDATE sensors SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?').bind(statusFor(s), s.id))
  }

  // 3. models
  const models = (await db.prepare('SELECT * FROM models').all<ModelRow>()).results
  let confSum = 0
  for (const m of models) {
    const { confidence, gpu_load } = modelConfidence(m.code, mode, tMin)
    confSum += confidence
    stmts.push(db.prepare('UPDATE models SET confidence = ?, gpu_load = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(confidence, gpu_load, m.id))
  }
  const ensembleConf = models.length ? round(confSum / models.length) : 0

  // 4. villages
  const villages = (await db.prepare('SELECT * FROM villages').all<VillageRow>()).results
  let popAtRisk = 0
  for (const v of villages) {
    const risk = v.risk_override ?? villageRisk(v.slug, hazards)
    if (risk === 'RED' || risk === 'AMBER') popAtRisk += v.population
    stmts.push(db.prepare('UPDATE villages SET risk = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(risk, v.id))
  }

  // 5. alerts (engine-raised, with cooldown per hazard)
  const recent = (await db.prepare(
    "SELECT hazard, MAX(created_at) AS last FROM alerts WHERE source = 'engine' AND created_at > datetime('now', '-60 minutes') GROUP BY hazard",
  ).all<{ hazard: string; last: string }>()).results
  const lastByHazard = new Map(recent.map(r => [r.hazard, new Date(r.last.replace(' ', 'T') + 'Z').getTime()]))
  for (const rule of RULES) {
    if (!rule.test(observation, hazards)) continue
    const lastAt = lastByHazard.get(rule.hazard) ?? 0
    if (now - lastAt < rule.cooldownMin * 60_000) continue
    const village = villages.find(v => v.slug === rule.villageSlug)
    stmts.push(db.prepare(
      'INSERT INTO alerts (severity, hazard, title, body, village_id, source, status, eta_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(rule.severity, rule.hazard, rule.title(observation, hazards), rule.body(observation, hazards), village?.id ?? null, 'engine', 'active', rule.eta))
  }

  // 6. nowcast run + housekeeping
  const horizon = Number(state.horizon_min || 45)
  stmts.push(db.prepare(
    `INSERT INTO nowcast_runs (mode, horizon_min, rain_rate, stream_level, strikes, wind_gust, max_dbz, flood_prob, lightning_prob, wind_prob, ensemble_confidence, verdict, population_at_risk)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(mode, horizon, observation.rain_rate, observation.stream_level, observation.strikes, observation.wind_gust, observation.max_dbz,
    hazards.flood_prob, hazards.lightning_prob, hazards.wind_prob, ensembleConf, hazards.verdict, mode === 'severe' ? popAtRisk : 0))
  stmts.push(db.prepare(`DELETE FROM sensor_readings WHERE ts < datetime('now', '-${READING_RETENTION_MIN} minutes')`))
  stmts.push(db.prepare(`DELETE FROM nowcast_runs WHERE created_at < datetime('now', '-${RUN_RETENTION_MIN} minutes')`))
  stmts.push(db.prepare(
    'INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP',
  ).bind('last_tick', String(now)))

  await db.batch(stmts)
  return { ticked: true, mode, observation, hazards }
}

// Forecast curve for the timeline scrubber: -30 .. +60 minutes in 5-minute steps.
export function forecastCurve(mode: Mode, nowMs: number) {
  const tMin = nowMs / 60_000
  const points = []
  for (let off = -30; off <= 60; off += 5) {
    const o = synthObservation(mode, tMin, off)
    const h = fuse(o)
    points.push({
      offset_min: off,
      rain_rate: o.rain_rate, stream_level: o.stream_level, strikes: o.strikes,
      wind_gust: o.wind_gust, max_dbz: o.max_dbz,
      flood_prob: h.flood_prob, lightning_prob: h.lightning_prob, wind_prob: h.wind_prob,
      convection_prob: h.convection_prob, verdict: h.verdict,
      kind: off < 0 ? 'observed' : off === 0 ? 'now' : 'forecast',
    })
  }
  return points
}

// Switch simulation mode: resolve engine alerts on "clear", seed the event marker on "severe".
export async function setMode(db: D1Database, mode: Mode, actor: string) {
  const prev = (await getState(db)).mode
  await setState(db, 'mode', mode)
  await setState(db, 'last_tick', '0') // force recompute on next request
  if (mode === 'clear') {
    await db.prepare(
      "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE status != 'resolved' AND source = 'engine' AND hazard != 'SYSTEM'",
    ).run()
    await db.prepare('UPDATE villages SET risk_override = NULL').run()
    await db.prepare("INSERT INTO alerts (severity, hazard, title, body, source, status) VALUES ('INFO', 'SYSTEM', 'All clear issued · basin nominal', 'Operator ended the severe event. Engine alerts auto-resolved.', 'operator', 'active')").run()
  } else {
    await setState(db, 'event_started_at', new Date().toISOString())
  }
  await audit(db, actor, 'mode.change', 'system', { from: prev, to: mode })
}
