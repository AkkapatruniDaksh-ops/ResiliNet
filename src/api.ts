import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings, AlertRow, DispatchRow, ModelRow, NowcastRow, SensorRow, VillageRow, Channel, Severity, Risk, Mode } from './types'
import { CHANNELS, SEVERITIES, RISKS } from './types'
import { tick, getState, setMode, audit, forecastCurve, synthObservation, fuse } from './engine'

const api = new Hono<{ Bindings: Bindings }>()
api.use('*', cors())

// Every API request opportunistically advances the engine (lazy cron).
api.use('*', async (c, next) => {
  if (c.req.method === 'GET' && c.env?.DB) {
    try { await tick(c.env.DB) } catch (e) { console.error('tick failed', e) }
  }
  await next()
})

const actorOf = (c: any) => (c.req.header('x-operator') || 'OPS-01').slice(0, 32)
const bad = (c: any, msg: string, code = 400) => c.json({ ok: false, error: msg }, code)

// ---------- health ----------
api.get('/health', async (c) => {
  const ok = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>()
  return c.json({ ok: !!ok, service: 'resilinet-ai', time: new Date().toISOString() })
})

// ---------- state / mode ----------
api.get('/state', async (c) => {
  const db = c.env.DB
  const state = await getState(db)
  const mode: Mode = state.mode === 'clear' ? 'clear' : 'severe'
  const latest = await db.prepare('SELECT * FROM nowcast_runs ORDER BY id DESC LIMIT 1').first<NowcastRow>()
  const [sensorsTotal, sensorsLive, activeAlerts, alertsLastHour, dispatchesLastHour] = await Promise.all([
    db.prepare('SELECT COALESCE(SUM(unit_count),0) AS n FROM sensors').first<{ n: number }>(),
    db.prepare("SELECT COALESCE(SUM(unit_count),0) AS n FROM sensors WHERE status != 'OFFLINE'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE status = 'active'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE created_at > datetime('now','-60 minutes') AND severity != 'INFO'").first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM dispatches WHERE created_at > datetime('now','-60 minutes')").first<{ n: number }>(),
  ])
  const total = sensorsTotal?.n ?? 0
  const live = sensorsLive?.n ?? 0
  // Severe mode knocks a few gauges offline in the field
  const activeSensors = mode === 'severe' ? Math.max(0, live - 3) : live
  const obs = synthObservation(mode, Date.now() / 60_000)
  const haz = fuse(obs)
  return c.json({
    ok: true,
    mode,
    event_started_at: state.event_started_at ?? null,
    radar_site: state.radar_site ?? 'KTM-01',
    horizon_min: Number(state.horizon_min ?? 45),
    kpis: {
      active_sensors: activeSensors, total_sensors: total,
      model_confidence: latest?.ensemble_confidence ?? 0,
      nowcast_horizon: Number(state.horizon_min ?? 45),
      population_at_risk: latest?.population_at_risk ?? 0,
      alerts_last_hour: alertsLastHour?.n ?? 0,
      active_alerts: activeAlerts?.n ?? 0,
      dispatches_last_hour: dispatchesLastHour?.n ?? 0,
      system_latency_s: mode === 'severe' ? 1.8 : 1.4,
      fusion_latency_s: mode === 'severe' ? 1.8 : 1.2,
      model_sync_pct: mode === 'severe' ? 99.4 : 99.8,
    },
    observation: obs,
    hazards: haz,
    latest_run: latest,
    server_time: new Date().toISOString(),
  })
})

api.post('/state/mode', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { mode?: string }
  if (body.mode !== 'severe' && body.mode !== 'clear') return bad(c, "mode must be 'severe' or 'clear'")
  await setMode(c.env.DB, body.mode, actorOf(c))
  await tick(c.env.DB, true)
  return c.json({ ok: true, mode: body.mode })
})

api.post('/state/tick', async (c) => {
  const r = await tick(c.env.DB, true)
  return c.json({ ok: true, ...r })
})

// ---------- sensors ----------
api.get('/sensors', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM sensors ORDER BY sort_order, id').all<SensorRow>()
  return c.json({ ok: true, sensors: results })
})

api.get('/sensors/:code/readings', async (c) => {
  const code = c.req.param('code')
  const limit = Math.min(500, Number(c.req.query('limit') ?? 120))
  const sensor = await c.env.DB.prepare('SELECT * FROM sensors WHERE code = ?').bind(code).first<SensorRow>()
  if (!sensor) return bad(c, 'sensor not found', 404)
  const { results } = await c.env.DB.prepare(
    'SELECT metric, value, unit, ts FROM sensor_readings WHERE sensor_id = ? ORDER BY ts DESC LIMIT ?',
  ).bind(sensor.id, limit).all()
  return c.json({ ok: true, sensor, readings: results.reverse() })
})

api.get('/readings', async (c) => {
  const metric = c.req.query('metric')
  const limit = Math.min(500, Number(c.req.query('limit') ?? 90))
  const q = metric
    ? c.env.DB.prepare('SELECT r.metric, r.value, r.unit, r.ts, s.code AS sensor FROM sensor_readings r JOIN sensors s ON s.id = r.sensor_id WHERE r.metric = ? ORDER BY r.ts DESC LIMIT ?').bind(metric, limit)
    : c.env.DB.prepare('SELECT r.metric, r.value, r.unit, r.ts, s.code AS sensor FROM sensor_readings r JOIN sensors s ON s.id = r.sensor_id ORDER BY r.ts DESC LIMIT ?').bind(limit)
  const { results } = await q.all()
  return c.json({ ok: true, readings: results.reverse() })
})

// ---------- models ----------
api.get('/models', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM models ORDER BY sort_order, id').all<ModelRow>()
  const latest = await c.env.DB.prepare('SELECT * FROM nowcast_runs ORDER BY id DESC LIMIT 1').first<NowcastRow>()
  return c.json({ ok: true, models: results, ensemble: latest })
})

// ---------- villages ----------
api.get('/villages', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT v.*, (SELECT COUNT(*) FROM alerts a WHERE a.village_id = v.id AND a.status = 'active') AS active_alerts
     FROM villages v ORDER BY CASE v.risk WHEN 'RED' THEN 0 WHEN 'AMBER' THEN 1 WHEN 'YELLOW' THEN 2 ELSE 3 END, v.population DESC`,
  ).all<VillageRow & { active_alerts: number }>()
  return c.json({ ok: true, villages: results })
})

api.get('/villages/:slug', async (c) => {
  const v = await c.env.DB.prepare('SELECT * FROM villages WHERE slug = ?').bind(c.req.param('slug')).first<VillageRow>()
  if (!v) return bad(c, 'village not found', 404)
  const { results: alerts } = await c.env.DB.prepare(
    "SELECT * FROM alerts WHERE village_id = ? AND status != 'resolved' ORDER BY created_at DESC LIMIT 10",
  ).bind(v.id).all<AlertRow>()
  return c.json({ ok: true, village: v, alerts })
})

api.patch('/villages/:slug', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { risk_override?: string | null }
  if (body.risk_override !== null && body.risk_override !== undefined && !RISKS.includes(body.risk_override as Risk)) {
    return bad(c, 'risk_override must be one of ' + RISKS.join('|') + ' or null')
  }
  const v = await c.env.DB.prepare('SELECT * FROM villages WHERE slug = ?').bind(c.req.param('slug')).first<VillageRow>()
  if (!v) return bad(c, 'village not found', 404)
  const ro = body.risk_override ?? null
  await c.env.DB.prepare('UPDATE villages SET risk_override = ?, risk = COALESCE(?, risk), updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(ro, ro, v.id).run()
  await audit(c.env.DB, actorOf(c), 'village.override', `village:${v.slug}`, { risk_override: ro })
  await tick(c.env.DB, true)
  const updated = await c.env.DB.prepare('SELECT * FROM villages WHERE id = ?').bind(v.id).first<VillageRow>()
  return c.json({ ok: true, village: updated })
})

// ---------- alerts ----------
api.get('/alerts', async (c) => {
  const status = c.req.query('status') ?? 'open' // open | active | acknowledged | resolved | all
  const limit = Math.min(200, Number(c.req.query('limit') ?? 50))
  let where = "a.status != 'resolved'"
  if (status === 'all') where = '1=1'
  else if (status === 'active' || status === 'acknowledged' || status === 'resolved') where = `a.status = '${status}'`
  const { results } = await c.env.DB.prepare(
    `SELECT a.*, v.name AS village_name, v.slug AS village_slug FROM alerts a LEFT JOIN villages v ON v.id = a.village_id
     WHERE ${where}
     ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END, a.created_at DESC
     LIMIT ?`,
  ).bind(limit).all<AlertRow>()
  return c.json({ ok: true, alerts: results, server_time: new Date().toISOString() })
})

api.post('/alerts', async (c) => {
  const body = await c.req.json().catch(() => ({})) as Partial<AlertRow> & { village_slug?: string }
  if (!body.title || typeof body.title !== 'string') return bad(c, 'title is required')
  const severity = (body.severity ?? 'MEDIUM').toUpperCase() as Severity
  if (!SEVERITIES.includes(severity)) return bad(c, 'severity must be one of ' + SEVERITIES.join('|'))
  let villageId: number | null = null
  if (body.village_slug) {
    const v = await c.env.DB.prepare('SELECT id FROM villages WHERE slug = ?').bind(body.village_slug).first<{ id: number }>()
    villageId = v?.id ?? null
  }
  const hazard = (body.hazard ?? 'GENERAL').toUpperCase()
  const eta = body.eta_minutes != null && Number.isFinite(Number(body.eta_minutes)) ? Number(body.eta_minutes) : null
  const r = await c.env.DB.prepare(
    "INSERT INTO alerts (severity, hazard, title, body, village_id, source, status, eta_minutes) VALUES (?, ?, ?, ?, ?, 'operator', 'active', ?)",
  ).bind(severity, hazard, body.title.slice(0, 160), (body.body ?? '').toString().slice(0, 600) || null, villageId, eta).run()
  const id = r.meta.last_row_id
  await audit(c.env.DB, actorOf(c), 'alert.create', `alert:${id}`, { severity, hazard, title: body.title })
  const alert = await c.env.DB.prepare('SELECT a.*, v.name AS village_name FROM alerts a LEFT JOIN villages v ON v.id = a.village_id WHERE a.id = ?').bind(id).first<AlertRow>()
  return c.json({ ok: true, alert }, 201)
})

api.post('/alerts/:id/ack', async (c) => {
  const id = Number(c.req.param('id'))
  const actor = actorOf(c)
  const r = await c.env.DB.prepare(
    "UPDATE alerts SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = ? WHERE id = ? AND status = 'active'",
  ).bind(actor, id).run()
  if (!r.meta.changes) return bad(c, 'alert not found or not active', 404)
  await audit(c.env.DB, actor, 'alert.ack', `alert:${id}`)
  return c.json({ ok: true, id, status: 'acknowledged' })
})

api.post('/alerts/:id/resolve', async (c) => {
  const id = Number(c.req.param('id'))
  const r = await c.env.DB.prepare(
    "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'resolved'",
  ).bind(id).run()
  if (!r.meta.changes) return bad(c, 'alert not found or already resolved', 404)
  await audit(c.env.DB, actorOf(c), 'alert.resolve', `alert:${id}`)
  return c.json({ ok: true, id, status: 'resolved' })
})

// ---------- dispatch ----------
api.get('/dispatch/channels', async (c) => {
  const state = await getState(c.env.DB)
  const mode = state.mode === 'clear' ? 'clear' : 'severe'
  const { results } = await c.env.DB.prepare(
    "SELECT channel, COUNT(*) AS n, MAX(created_at) AS last_sent, SUM(reach) AS reach FROM dispatches WHERE created_at > datetime('now','-60 minutes') GROUP BY channel",
  ).all<{ channel: Channel; n: number; last_sent: string; reach: number }>()
  const stats = new Map(results.map(r => [r.channel, r]))
  const channels = (Object.keys(CHANNELS) as Channel[]).map(id => ({
    id, ...CHANNELS[id],
    reach: CHANNELS[id].baseReach,
    armed: mode === 'severe',
    sent_last_hour: stats.get(id)?.n ?? 0,
    last_sent: stats.get(id)?.last_sent ?? null,
    reached_last_hour: stats.get(id)?.reach ?? 0,
  }))
  return c.json({ ok: true, mode, channels })
})

api.get('/dispatch', async (c) => {
  const limit = Math.min(200, Number(c.req.query('limit') ?? 30))
  const { results } = await c.env.DB.prepare(
    'SELECT d.*, a.title AS alert_title, a.severity AS alert_severity FROM dispatches d LEFT JOIN alerts a ON a.id = d.alert_id ORDER BY d.created_at DESC, d.id DESC LIMIT ?',
  ).bind(limit).all<DispatchRow>()
  return c.json({ ok: true, dispatches: results })
})

api.post('/dispatch', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { channel?: string; alert_id?: number; message?: string; live?: boolean }
  const channel = body.channel as Channel
  if (!channel || !CHANNELS[channel]) return bad(c, 'channel must be one of ' + Object.keys(CHANNELS).join('|'))
  const state = await getState(c.env.DB)
  // live-mode dispatches carry their own message and are allowed regardless of the training scenario state
  if (!body.live && state.mode !== 'severe') return bad(c, 'dispatch channels are in STANDBY — no severe event active', 409)

  let alert: AlertRow | null = null
  if (body.live) { /* no scenario alert attached */ }
  else if (body.alert_id) {
    alert = await c.env.DB.prepare('SELECT a.*, v.name AS village_name FROM alerts a LEFT JOIN villages v ON v.id = a.village_id WHERE a.id = ?').bind(body.alert_id).first<AlertRow>()
  } else {
    alert = await c.env.DB.prepare("SELECT a.*, v.name AS village_name FROM alerts a LEFT JOIN villages v ON v.id = a.village_id WHERE a.status = 'active' ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, a.created_at DESC LIMIT 1").first<AlertRow>()
  }
  const message = (body.message?.trim() || (alert
    ? `⚠ ${alert.severity}: ${alert.title}${alert.village_name ? ` — ${alert.village_name}` : ''}. Move to higher ground. Avoid river corridors.`
    : '⚠ ResiliNet severe weather warning. Move to higher ground. Avoid river corridors.')).slice(0, 320)

  // reach = channel base ± small jitter, scaled by population currently at risk
  const latest = await c.env.DB.prepare('SELECT population_at_risk FROM nowcast_runs ORDER BY id DESC LIMIT 1').first<{ population_at_risk: number }>()
  const scale = Math.min(1, Math.max(0.35, (latest?.population_at_risk ?? 124500) / 124500))
  const reach = Math.round(CHANNELS[channel].baseReach * scale * (0.96 + Math.random() * 0.06))

  const r = await c.env.DB.prepare(
    "INSERT INTO dispatches (alert_id, channel, message, reach, status, operator) VALUES (?, ?, ?, ?, 'sent', ?)",
  ).bind(alert?.id ?? null, channel, message, reach, actorOf(c)).run()
  await audit(c.env.DB, actorOf(c), 'dispatch.send', `dispatch:${r.meta.last_row_id}`, { channel, alert_id: alert?.id ?? null, reach })
  const dispatch = await c.env.DB.prepare('SELECT * FROM dispatches WHERE id = ?').bind(r.meta.last_row_id).first<DispatchRow>()
  return c.json({ ok: true, dispatch }, 201)
})

// ---------- nowcast ----------
api.get('/nowcast', async (c) => {
  const state = await getState(c.env.DB)
  const mode: Mode = state.mode === 'clear' ? 'clear' : 'severe'
  const latest = await c.env.DB.prepare('SELECT * FROM nowcast_runs ORDER BY id DESC LIMIT 1').first<NowcastRow>()
  return c.json({ ok: true, mode, latest, timeline: forecastCurve(mode, Date.now()) })
})

api.get('/nowcast/history', async (c) => {
  const limit = Math.min(500, Number(c.req.query('limit') ?? 60))
  const { results } = await c.env.DB.prepare('SELECT * FROM nowcast_runs ORDER BY id DESC LIMIT ?').bind(limit).all<NowcastRow>()
  return c.json({ ok: true, runs: results.reverse() })
})

// ---------- citizen ----------
api.get('/citizen/:slug', async (c) => {
  const db = c.env.DB
  const v = await db.prepare('SELECT * FROM villages WHERE slug = ?').bind(c.req.param('slug')).first<VillageRow>()
  if (!v) return bad(c, 'village not found', 404)
  const state = await getState(db)
  const mode: Mode = state.mode === 'clear' ? 'clear' : 'severe'
  const { results: alerts } = await db.prepare(
    "SELECT * FROM alerts WHERE status != 'resolved' AND (village_id = ? OR (village_id IS NULL AND severity IN ('CRITICAL','HIGH'))) ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, created_at DESC LIMIT 5",
  ).bind(v.id).all<AlertRow>()
  const primary = alerts[0] ?? null
  const obs = synthObservation(mode, Date.now() / 60_000)
  const lastDispatch = await db.prepare('SELECT * FROM dispatches ORDER BY id DESC LIMIT 1').first<DispatchRow>()

  // impact ETA: from the primary alert's created_at + eta_minutes
  let impact_at: string | null = null
  const etaAlert = alerts.find(a => a.eta_minutes != null && a.status === 'active') ?? alerts.find(a => a.eta_minutes != null)
  if (etaAlert) {
    const created = new Date(etaAlert.created_at.replace(' ', 'T') + 'Z').getTime()
    const at = created + etaAlert.eta_minutes! * 60_000
    if (at > Date.now()) impact_at = new Date(at).toISOString()
  }
  const danger = v.risk === 'RED' || v.risk === 'AMBER'
  const actions = danger ? [
    { icon: '▲', title: 'Evacuate to Higher Ground', sub: `Nearest safe zone: ${v.safe_zone}` },
    { icon: '⚠', title: 'Avoid River Corridors', sub: v.river },
    { icon: '📻', title: 'Tune to Emergency Broadcast', sub: v.fm_channel },
  ] : [
    { icon: '☁', title: 'No action needed', sub: 'Keep notifications enabled' },
    { icon: '📻', title: 'Emergency channel', sub: v.fm_channel },
  ]
  return c.json({
    ok: true, mode, village: v, status: danger ? 'DANGER' : v.risk === 'YELLOW' ? 'WATCH' : 'SAFE',
    primary_alert: primary, alerts, impact_at, actions,
    conditions: {
      rain_rate: obs.rain_rate, wind_gust: obs.wind_gust, stream_level: obs.stream_level,
      strikes: obs.strikes, updated_at: new Date().toISOString(),
    },
    sensors: [
      { code: 'RDR-01', text: 'RDR-01 online' },
      { code: 'IoT-42', text: `IoT-42 · ${obs.rain_rate.toFixed(1)} mm/hr` },
      { code: 'HYD-07', text: `HYD-07 · stream ${obs.stream_level.toFixed(2)} m` },
      { code: 'CAM-14', text: `CAM-14 · visibility ${danger ? 'poor' : 'OK'}` },
    ],
    last_dispatch: lastDispatch,
    server_time: new Date().toISOString(),
  })
})

// ---------- audit + export ----------
api.get('/audit', async (c) => {
  const limit = Math.min(200, Number(c.req.query('limit') ?? 40))
  const { results } = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').bind(limit).all()
  return c.json({ ok: true, entries: results })
})

api.get('/export/incident', async (c) => {
  const db = c.env.DB
  const state = await getState(db)
  const [alerts, dispatches, villages, runs, auditRows] = await Promise.all([
    db.prepare('SELECT a.*, v.name AS village_name FROM alerts a LEFT JOIN villages v ON v.id = a.village_id ORDER BY a.created_at DESC LIMIT 200').all(),
    db.prepare('SELECT * FROM dispatches ORDER BY created_at DESC LIMIT 200').all(),
    db.prepare('SELECT * FROM villages ORDER BY name').all(),
    db.prepare('SELECT * FROM nowcast_runs ORDER BY id DESC LIMIT 100').all(),
    db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200').all(),
  ])
  const report = {
    generated_at: new Date().toISOString(),
    system: 'ResiliNet', problem_statement: 'SIH26077', team: 'Hack Wizards',
    state, alerts: alerts.results, dispatches: dispatches.results, villages: villages.results,
    nowcast_runs: runs.results, audit: auditRows.results,
  }
  c.header('Content-Disposition', `attachment; filename="resilinet-incident-${Date.now()}.json"`)
  return c.json(report)
})

export default api
