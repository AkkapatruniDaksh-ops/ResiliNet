// Public, location-aware API — the part every citizen uses.
// /api/places/*  search & reverse geocode
// /api/live      real weather assessment for any lat/lon (cached 10 min in D1)
// /api/reports   community ground-truth reports
// /api/popular   most-checked places

import { Hono } from 'hono'
import type { Bindings } from './types'
import { assess, geocode, reverseGeocode, type Assessment, type Place } from './weather'

const pub = new Hono<{ Bindings: Bindings }>()
const CACHE_MS = 10 * 60_000
const bad = (c: any, msg: string, code = 400) => c.json({ ok: false, error: msg }, code)

const num = (v: string | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : NaN }
const keyOf = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`

// ---------- places ----------
pub.get('/places/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (q.length < 2) return c.json({ ok: true, results: [] })
  // allow "lat, lon" input
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (m) {
    const lat = Number(m[1]), lon = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      const p = await reverseGeocode(lat, lon)
      return c.json({ ok: true, results: [p] })
    }
  }
  try {
    const results = await geocode(q, 8)
    return c.json({ ok: true, results })
  } catch (e: any) { return bad(c, e.message ?? 'search failed', 502) }
})

pub.get('/places/reverse', async (c) => {
  const lat = num(c.req.query('lat')), lon = num(c.req.query('lon'))
  if (Number.isNaN(lat) || Number.isNaN(lon)) return bad(c, 'lat and lon are required')
  const p = await reverseGeocode(lat, lon)
  return c.json({ ok: true, place: p })
})

pub.get('/popular', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT name, region, country, country_code, lat, lon, last_risk, lookups, last_checked FROM locations ORDER BY lookups DESC, last_checked DESC LIMIT 12',
  ).all()
  return c.json({ ok: true, places: results })
})

// ---------- live assessment ----------
pub.get('/live', async (c) => {
  const lat = num(c.req.query('lat')), lon = num(c.req.query('lon'))
  if (Number.isNaN(lat) || Number.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad(c, 'valid lat and lon are required')
  const nameHint = c.req.query('name')
  const db = c.env.DB
  const key = keyOf(lat, lon)
  const force = c.req.query('refresh') === '1'

  // cache
  if (!force) {
    const row = await db.prepare('SELECT payload, fetched_at FROM weather_cache WHERE key = ?').bind(key).first<{ payload: string; fetched_at: number }>()
    if (row && Date.now() - row.fetched_at < CACHE_MS) {
      const a = JSON.parse(row.payload) as Assessment
      if (nameHint && a.place.name !== nameHint) a.place.name = nameHint
      return c.json({ ok: true, cached: true, assessment: a, reports: await nearbyReports(db, lat, lon) })
    }
  }

  let place: Place
  if (nameHint) {
    place = { name: nameHint, lat, lon, region: c.req.query('region') ?? undefined, country: c.req.query('country') ?? undefined, country_code: c.req.query('cc') ?? undefined }
  } else {
    place = await reverseGeocode(lat, lon)
  }

  let a: Assessment
  try { a = await assess(place) }
  catch (e: any) { return bad(c, `Live weather is temporarily unavailable (${e.message}). Please try again in a minute.`, 502) }

  const stmts = [
    db.prepare('INSERT INTO weather_cache (key, payload, fetched_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at')
      .bind(key, JSON.stringify(a), Date.now()),
    db.prepare(`INSERT INTO locations (name, region, country, country_code, lat, lon, timezone, elevation_m, last_risk, lookups)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(lat, lon) DO UPDATE SET lookups = lookups + 1, last_risk = excluded.last_risk, last_checked = CURRENT_TIMESTAMP, name = excluded.name`)
      .bind(a.place.name, a.place.region ?? null, a.place.country ?? null, a.place.country_code ?? null,
        Number(lat.toFixed(2)), Number(lon.toFixed(2)), a.place.timezone ?? null, a.place.elevation_m ?? null, a.risk),
    db.prepare("DELETE FROM weather_cache WHERE fetched_at < ?").bind(Date.now() - 6 * 60 * 60_000),
  ]
  // record a location alert when risk is AMBER/RED (dedupe within 60 min)
  if (a.risk === 'RED' || a.risk === 'AMBER') {
    const recent = await db.prepare("SELECT id FROM location_alerts WHERE location_key = ? AND created_at > datetime('now','-60 minutes') LIMIT 1").bind(key).first()
    if (!recent) {
      const dominant = (Object.entries(a.hazards) as any[]).sort((x, y) => y[1].prob - x[1].prob)[0][0]
      stmts.push(db.prepare('INSERT INTO location_alerts (location_key, place, hazard, severity, title) VALUES (?, ?, ?, ?, ?)')
        .bind(key, a.place.name, dominant.toUpperCase(), a.risk === 'RED' ? 'CRITICAL' : 'HIGH', a.headline))
    }
  }
  await db.batch(stmts)
  return c.json({ ok: true, cached: false, assessment: a, reports: await nearbyReports(db, lat, lon) })
})

pub.get('/live/alerts', async (c) => {
  const limit = Math.min(100, Number(c.req.query('limit') ?? 30))
  const { results } = await c.env.DB.prepare('SELECT * FROM location_alerts ORDER BY id DESC LIMIT ?').bind(limit).all()
  return c.json({ ok: true, alerts: results })
})

// ---------- community reports ----------
const REPORT_KINDS = ['flood', 'heavy_rain', 'lightning', 'wind', 'hail', 'landslide', 'all_clear', 'other']

async function nearbyReports(db: D1Database, lat: number, lon: number, radiusDeg = 0.5) {
  const { results } = await db.prepare(
    "SELECT * FROM reports WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? AND created_at > datetime('now','-12 hours') ORDER BY created_at DESC LIMIT 20",
  ).bind(lat - radiusDeg, lat + radiusDeg, lon - radiusDeg, lon + radiusDeg).all()
  return results
}

pub.get('/reports', async (c) => {
  const lat = num(c.req.query('lat')), lon = num(c.req.query('lon'))
  if (!Number.isNaN(lat) && !Number.isNaN(lon)) return c.json({ ok: true, reports: await nearbyReports(c.env.DB, lat, lon) })
  const { results } = await c.env.DB.prepare("SELECT * FROM reports WHERE created_at > datetime('now','-24 hours') ORDER BY created_at DESC LIMIT 50").all()
  return c.json({ ok: true, reports: results })
})

pub.post('/reports', async (c) => {
  const b = await c.req.json().catch(() => ({})) as any
  const lat = Number(b.lat), lon = Number(b.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(c, 'lat and lon are required')
  if (!REPORT_KINDS.includes(b.kind)) return bad(c, 'kind must be one of ' + REPORT_KINDS.join(', '))
  const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(b.severity) ? b.severity : 'MEDIUM'
  const r = await c.env.DB.prepare('INSERT INTO reports (lat, lon, place, kind, severity, note, reporter) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(lat, lon, String(b.place ?? '').slice(0, 120) || null, b.kind, severity, String(b.note ?? '').slice(0, 400) || null, String(b.reporter ?? 'anonymous').slice(0, 40)).run()
  const report = await c.env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(r.meta.last_row_id).first()
  return c.json({ ok: true, report }, 201)
})

export default pub
