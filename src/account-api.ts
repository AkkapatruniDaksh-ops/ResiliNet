// Accounts, alert subscriptions and the notification checker.
import { Hono } from 'hono'
import google from './google-auth'
import { hashPassword, verifyPassword, createSession, setSessionCookie, currentUser, destroySession, normalisePhone, validEmail, type User } from './auth'
import { assess, type Assessment } from './weather'
import { sendSMS, placeCall, smsText, callText, allClearText, loadGateway, gatewayReady, gatewaySummary, invalidateGateway, type NotifyEnv } from './notify'

export type AcctBindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
} & NotifyEnv & {
  APP_URL?: string
  ADMIN_KEY?: string
}
const smsLive = async (env: AcctBindings) => gatewayReady(await loadGateway(env))
const acct = new Hono<{ Bindings: AcctBindings }>()
acct.route('/auth', google)
const bad = (c: any, msg: string, code = 400) => c.json({ ok: false, error: msg }, code)
const RANK: Record<string, number> = { GREEN: 0, YELLOW: 1, AMBER: 2, RED: 3 }
const LEVELS = ['YELLOW', 'AMBER', 'RED']
const CHECK_INTERVAL_MIN = 10       // how often each subscription is re-evaluated
const RENOTIFY_MIN = 90             // re-send the same level after this long
const MAX_CHECKS_PER_REQUEST = 2    // stay within Workers CPU budget

const publicUser = (u: User) => ({ id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, phone: u.phone, phone_verified: !!u.phone_verified, provider: u.provider, created_at: u.created_at, last_login: u.last_login })
const appUrl = (c: any) => c.env.APP_URL || new URL(c.req.url).origin

// Opportunistic checker: any GET to the account API may process a few due subscriptions
acct.use('*', async (c, next) => {
  if (c.req.method === 'GET' && c.env?.DB) {
    try { await runChecker(c.env, appUrl(c)) } catch (e) { console.error('checker', e) }
  }
  await next()
})

// ---------- auth ----------
acct.post('/auth/register', async (c) => {
  const b = await c.req.json().catch(() => ({})) as any
  const email = String(b.email || '').trim().toLowerCase()
  const first = String(b.first_name || '').trim(), last = String(b.last_name || '').trim()
  const password = String(b.password || '')
  if (!first) return bad(c, 'Please enter your first name')
  if (!validEmail(email)) return bad(c, 'Please enter a valid email address')
  if (password.length < 8) return bad(c, 'Password must be at least 8 characters')
  if (!b.accept_terms) return bad(c, 'Please accept the Terms & Conditions')
  const phone = b.phone ? normalisePhone(String(b.phone), b.default_country || '+91') : null
  if (b.phone && !phone) return bad(c, 'Please enter a valid mobile number with country code, e.g. +91 98765 43210')
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
  if (exists) return bad(c, 'An account with this email already exists — please log in', 409)
  const hash = await hashPassword(password)
  const r = await c.env.DB.prepare('INSERT INTO users (email, first_name, last_name, phone, password_hash) VALUES (?, ?, ?, ?, ?)').bind(email, first.slice(0, 60), last.slice(0, 60) || null, phone, hash).run()
  const userId = r.meta.last_row_id as number
  const s = await createSession(c.env.DB, userId, c.req.header('user-agent'))
  setSessionCookie(c, s.id)
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<User>()
  return c.json({ ok: true, user: publicUser(user!) }, 201)
})

acct.post('/auth/login', async (c) => {
  const b = await c.req.json().catch(() => ({})) as any
  const email = String(b.email || '').trim().toLowerCase()
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User & { password_hash: string }>()
  if (!user || !(await verifyPassword(String(b.password || ''), user.password_hash))) return bad(c, 'Email or password is incorrect', 401)
  const s = await createSession(c.env.DB, user.id, c.req.header('user-agent'))
  setSessionCookie(c, s.id)
  return c.json({ ok: true, user: publicUser(user) })
})

acct.post('/auth/logout', async (c) => { await destroySession(c); return c.json({ ok: true }) })

acct.get('/auth/me', async (c) => {
  const u = await currentUser(c)
  if (!u) return c.json({ ok: true, user: null, sms_live: await smsLive(c.env) })
  const subs = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ? AND active = 1').bind(u.id).first<{ n: number }>()
  return c.json({ ok: true, user: publicUser(u), subscriptions: subs?.n ?? 0, sms_live: await smsLive(c.env) })
})

acct.patch('/auth/me', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const b = await c.req.json().catch(() => ({})) as any
  const first = b.first_name != null ? String(b.first_name).trim().slice(0, 60) : u.first_name
  const last = b.last_name != null ? String(b.last_name).trim().slice(0, 60) : u.last_name
  let phone = u.phone
  if (b.phone !== undefined) {
    phone = b.phone ? normalisePhone(String(b.phone), b.default_country || '+91') : null
    if (b.phone && !phone) return bad(c, 'Please enter a valid mobile number with country code')
  }
  if (b.new_password) {
    if (String(b.new_password).length < 8) return bad(c, 'New password must be at least 8 characters')
    const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(u.id).first<{ password_hash: string }>()
    if (!(await verifyPassword(String(b.current_password || ''), row!.password_hash))) return bad(c, 'Current password is incorrect', 401)
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(String(b.new_password)), u.id).run()
  }
  const phoneChanged = phone !== u.phone
  await c.env.DB.prepare('UPDATE users SET first_name = ?, last_name = ?, phone = ?, phone_verified = ? WHERE id = ?').bind(first || u.first_name, last || null, phone, phoneChanged ? 0 : u.phone_verified, u.id).run()
  const fresh = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first<User>()
  return c.json({ ok: true, user: publicUser(fresh!) })
})

// ---------- subscriptions ----------
acct.get('/subscriptions', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const { results } = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').bind(u.id).all()
  return c.json({ ok: true, subscriptions: results })
})

acct.post('/subscriptions', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const b = await c.req.json().catch(() => ({})) as any
  const lat = Number(b.lat), lon = Number(b.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad(c, 'Please choose a place from the search results')
  if (!b.place_name) return bad(c, 'Place name is required')
  const minLevel = LEVELS.includes(b.min_level) ? b.min_level : 'AMBER'
  const callMin = LEVELS.includes(b.call_min_level) ? b.call_min_level : 'RED'
  if ((b.via_sms !== false || b.via_call) && !u.phone) return bad(c, 'Add your mobile number in Profile to receive SMS or calls')
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?').bind(u.id).first<{ n: number }>()
  if ((count?.n ?? 0) >= 10) return bad(c, 'You can watch up to 10 places')
  const r = await c.env.DB.prepare(
    `INSERT INTO subscriptions (user_id, label, place_name, region, country, lat, lon, min_level, via_sms, via_call, call_min_level, quiet_start, quiet_end)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(u.id, String(b.label || b.place_name).slice(0, 40), String(b.place_name).slice(0, 80), b.region ?? null, b.country ?? null, lat, lon, minLevel,
    b.via_sms === false ? 0 : 1, b.via_call ? 1 : 0, callMin, b.quiet_start ?? null, b.quiet_end ?? null).run()
  const sub = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(r.meta.last_row_id).first<any>()
  let check: any = null
  try { check = await checkSubscription(c.env, sub, u, appUrl(c)) } catch (e) { console.error(e) }
  const fresh = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(r.meta.last_row_id).first()
  return c.json({ ok: true, subscription: fresh, check }, 201)
})

acct.patch('/subscriptions/:id', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const id = Number(c.req.param('id'))
  const sub = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').bind(id, u.id).first<any>()
  if (!sub) return bad(c, 'Not found', 404)
  const b = await c.req.json().catch(() => ({})) as any
  const fields: Record<string, any> = {}
  if (b.label != null) fields.label = String(b.label).slice(0, 40)
  if (LEVELS.includes(b.min_level)) fields.min_level = b.min_level
  if (LEVELS.includes(b.call_min_level)) fields.call_min_level = b.call_min_level
  if (b.via_sms != null) fields.via_sms = b.via_sms ? 1 : 0
  if (b.via_call != null) fields.via_call = b.via_call ? 1 : 0
  if (b.active != null) fields.active = b.active ? 1 : 0
  if ('quiet_start' in b) fields.quiet_start = b.quiet_start == null || b.quiet_start === '' ? null : Number(b.quiet_start)
  if ('quiet_end' in b) fields.quiet_end = b.quiet_end == null || b.quiet_end === '' ? null : Number(b.quiet_end)
  if (!Object.keys(fields).length) return bad(c, 'Nothing to update')
  const set = Object.keys(fields).map(k => `${k} = ?`).join(', ')
  await c.env.DB.prepare(`UPDATE subscriptions SET ${set} WHERE id = ?`).bind(...Object.values(fields), id).run()
  const fresh = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(id).first()
  return c.json({ ok: true, subscription: fresh })
})

acct.delete('/subscriptions/:id', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const r = await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), u.id).run()
  if (!r.meta.changes) return bad(c, 'Not found', 404)
  return c.json({ ok: true })
})

// Force a re-check of one subscription right now
acct.post('/subscriptions/:id/check', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const sub = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), u.id).first<any>()
  if (!sub) return bad(c, 'Not found', 404)
  const result = await checkSubscription(c.env, sub, u, appUrl(c))
  const fresh = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ?').bind(sub.id).first()
  return c.json({ ok: true, subscription: fresh, ...result })
})

// ---------- notifications ----------
acct.get('/notifications', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const { results } = await c.env.DB.prepare('SELECT n.*, s.label FROM notifications n LEFT JOIN subscriptions s ON s.id = n.subscription_id WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50').bind(u.id).all()
  return c.json({ ok: true, notifications: results, sms_live: await smsLive(c.env) })
})

// Send a test SMS or call to the user's own number
acct.post('/notifications/test', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  if (!u.phone) return bad(c, 'Add your mobile number in Profile first')
  const b = await c.req.json().catch(() => ({})) as { channel?: string }
  const channel = b.channel === 'call' ? 'call' : 'sms'
  const msg = channel === 'sms'
    ? `ResiliNet test: hello ${u.first_name}, your weather alerts are set up correctly. You will receive a message like this when severe weather is expected near your saved places. ${appUrl(c)}`
    : `Hello ${u.first_name}. This is a test call from ResiliNet A I. Your weather alerts are set up correctly. You will receive a call like this when dangerous weather is expected near your saved places.`
  const res = channel === 'sms' ? await sendSMS(c.env, u.phone, msg) : await placeCall(c.env, u.phone, msg)
  await log(c.env, u.id, null, channel, u.phone, 'TEST', msg, res)
  if (res.status === 'sent') await c.env.DB.prepare('UPDATE users SET phone_verified = 1 WHERE id = ?').bind(u.id).run()
  return c.json({ ok: res.status !== 'failed', status: res.status, provider: res.provider, error: res.error, sms_live: await smsLive(c.env) })
})

// Simulate a severe event on one subscription (for demos): runs the real warning message flow
acct.post('/subscriptions/:id/simulate', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  if (!u.phone) return bad(c, 'Add your mobile number in Profile first')
  const sub = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').bind(Number(c.req.param('id')), u.id).first<any>()
  if (!sub) return bad(c, 'Not found', 404)
  const b = await c.req.json().catch(() => ({})) as { level?: string }
  const level = LEVELS.includes(b.level || '') ? b.level! : 'RED'
  const headline = level === 'RED' ? `Dangerous flooding near ${sub.place_name}` : `Likely thunderstorms near ${sub.place_name}`
  const advice = level === 'RED' ? 'Move to higher ground now.' : 'Get indoors when thunder is heard.'
  const placeUrl = `${appUrl(c)}/?lat=${sub.lat}&lon=${sub.lon}&name=${encodeURIComponent(sub.place_name)}`
  const notified: any[] = []
  if (sub.via_sms) {
    const msg = '[DRILL] ' + smsText({ label: sub.label, place: sub.place_name, level, headline, advice, url: placeUrl })
    const r = await sendSMS(c.env, u.phone, msg); await log(c.env, u.id, sub.id, 'sms', u.phone, level, msg, r); notified.push({ channel: 'sms', ...r })
  }
  if (sub.via_call && RANK[level] >= RANK[sub.call_min_level]) {
    const spoken = 'This is a drill. ' + callText({ firstName: u.first_name, label: sub.label, place: sub.place_name, level, headline, advice })
    const r = await placeCall(c.env, u.phone, spoken); await log(c.env, u.id, sub.id, 'call', u.phone, level, spoken, r); notified.push({ channel: 'call', ...r })
  }
  return c.json({ ok: true, level, notified, sms_live: await smsLive(c.env) })
})

// ---------- gateway settings (any logged-in user can view; saving requires being logged in) ----------
acct.get('/gateway', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const cfg = await loadGateway(c.env, true)
  return c.json({ ok: true, gateway: gatewaySummary(cfg) })
})

acct.put('/gateway', async (c) => {
  const u = await currentUser(c); if (!u) return bad(c, 'Please log in', 401)
  const b = await c.req.json().catch(() => ({})) as Record<string, string>
  const allowed = ['provider', 'twilio_sid', 'twilio_token', 'twilio_from', 'textbelt_key', 'fast2sms_key']
  const stmts: D1PreparedStatement[] = []
  for (const k of allowed) {
    if (!(k in b)) continue
    const v = String(b[k] ?? '').trim()
    if (k === 'provider' && !['twilio', 'textbelt', 'fast2sms', 'none', ''].includes(v)) return bad(c, 'Unknown provider')
    if (k === 'twilio_from' && v && !/^\+[1-9]\d{7,14}$/.test(v)) return bad(c, 'Twilio "from" number must be in international format, e.g. +12025550123')
    if (v === '') stmts.push(c.env.DB.prepare('DELETE FROM gateway_settings WHERE key = ?').bind(k))
    else stmts.push(c.env.DB.prepare('INSERT INTO gateway_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP').bind(k, v))
  }
  if (stmts.length) await c.env.DB.batch(stmts)
  invalidateGateway()
  const cfg = await loadGateway(c.env, true)
  await c.env.DB.prepare('INSERT INTO audit_log (actor, action, target, details) VALUES (?, ?, ?, ?)').bind(u.email, 'gateway.update', 'sms-gateway', JSON.stringify({ provider: cfg.provider })).run()
  return c.json({ ok: true, gateway: gatewaySummary(cfg) })
})

// ---------- the checker ----------
export async function runChecker(env: AcctBindings, url: string) {
  const { results } = await env.DB.prepare(
    `SELECT s.*, u.first_name, u.phone, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id
     WHERE s.active = 1 AND (s.last_checked IS NULL OR s.last_checked < datetime('now', '-${CHECK_INTERVAL_MIN} minutes'))
     ORDER BY s.last_checked ASC LIMIT ${MAX_CHECKS_PER_REQUEST}`,
  ).all<any>()
  for (const sub of results) {
    try { await checkSubscription(env, sub, { id: sub.user_id, first_name: sub.first_name, phone: sub.phone } as User, url) }
    catch (e) { console.error('check failed', sub.id, e) }
  }
  return results.length
}

function inQuietHours(sub: any, tz: string | undefined) {
  if (sub.quiet_start == null || sub.quiet_end == null) return false
  let hour: number
  try { hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz || 'UTC' }).format(new Date())) }
  catch { hour = new Date().getUTCHours() }
  const s = Number(sub.quiet_start), e = Number(sub.quiet_end)
  return s < e ? (hour >= s && hour < e) : (hour >= s || hour < e)
}

async function checkSubscription(env: AcctBindings, sub: any, user: User, url: string) {
  const a: Assessment = await assess({ name: sub.place_name, lat: sub.lat, lon: sub.lon, region: sub.region, country: sub.country })
  const level = a.risk
  const prevLevel = sub.last_level as string | null
  const lastNotifiedLevel = sub.last_notified_level as string | null
  const lastNotifiedAt = sub.last_notified ? new Date(String(sub.last_notified).replace(' ', 'T') + 'Z').getTime() : 0
  const minsSince = (Date.now() - lastNotifiedAt) / 60000

  const meetsThreshold = RANK[level] >= RANK[sub.min_level]
  const escalated = RANK[level] > RANK[lastNotifiedLevel ?? 'GREEN']
  const stale = minsSince > RENOTIFY_MIN
  const shouldWarn = meetsThreshold && (escalated || stale || !lastNotifiedLevel)
  const shouldClear = !meetsThreshold && !!lastNotifiedLevel && RANK[lastNotifiedLevel] >= RANK[sub.min_level] && level === 'GREEN'

  const notified: any[] = []
  const placeUrl = `${url}/?lat=${sub.lat}&lon=${sub.lon}&name=${encodeURIComponent(sub.place_name)}`
  const advice = a.advice[0] ? a.advice[0].title + '.' : 'Stay alert.'
  const quiet = inQuietHours(sub, a.place.timezone)

  if (shouldWarn && user.phone) {
    if (quiet && level !== 'RED') { // RED overrides quiet hours — safety first
      await log(env, user.id, sub.id, 'sms', user.phone, level, `(quiet hours — not sent) ${a.headline}`, { status: 'skipped_quiet' })
    } else {
      if (sub.via_sms) {
        const msg = smsText({ label: sub.label, place: sub.place_name, level, headline: a.headline, advice, url: placeUrl })
        const r = await sendSMS(env, user.phone, msg)
        await log(env, user.id, sub.id, 'sms', user.phone, level, msg, r); notified.push({ channel: 'sms', ...r })
      }
      if (sub.via_call && RANK[level] >= RANK[sub.call_min_level]) {
        const spoken = callText({ firstName: user.first_name, label: sub.label, place: sub.place_name, level, headline: a.headline, advice })
        const r = await placeCall(env, user.phone, spoken)
        await log(env, user.id, sub.id, 'call', user.phone, level, spoken, r); notified.push({ channel: 'call', ...r })
      }
    }
    await env.DB.prepare('UPDATE subscriptions SET last_level = ?, last_notified_level = ?, last_notified = CURRENT_TIMESTAMP, last_checked = CURRENT_TIMESTAMP WHERE id = ?').bind(level, level, sub.id).run()
  } else if (shouldClear && user.phone && sub.via_sms) {
    const msg = allClearText({ label: sub.label, place: sub.place_name, url: placeUrl })
    const r = await sendSMS(env, user.phone, msg)
    await log(env, user.id, sub.id, 'sms', user.phone, 'GREEN', msg, r); notified.push({ channel: 'sms', ...r })
    await env.DB.prepare('UPDATE subscriptions SET last_level = ?, last_notified_level = NULL, last_notified = CURRENT_TIMESTAMP, last_checked = CURRENT_TIMESTAMP WHERE id = ?').bind(level, sub.id).run()
  } else {
    await env.DB.prepare('UPDATE subscriptions SET last_level = ?, last_checked = CURRENT_TIMESTAMP WHERE id = ?').bind(level, sub.id).run()
  }
  return { level, previous_level: prevLevel, status: a.status, headline: a.headline, notified, quiet_hours: quiet }
}

async function log(env: AcctBindings, userId: number, subId: number | null, channel: string, to: string, level: string, message: string, r: { status: string; provider?: string; provider_ref?: string; error?: string }) {
  const ref = r.provider ? `${r.provider}${r.provider_ref ? ':' + r.provider_ref : ''}` : (r.provider_ref ?? null)
  await env.DB.prepare('INSERT INTO notifications (user_id, subscription_id, channel, to_number, level, message, status, provider_ref, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(userId, subId, channel, to, level, message.slice(0, 1000), r.status, ref, r.error ?? null).run()
}

export default acct
