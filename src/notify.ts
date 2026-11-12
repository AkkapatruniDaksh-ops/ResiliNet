// SMS + voice-call delivery. Supports several gateways so the owner can pick whatever they have:
//   - twilio    : SMS + voice calls (global)            needs account_sid, auth_token, from_number
//   - textbelt  : SMS only (global, 1 free msg/day)     needs key ("textbelt" = free tier)
//   - fast2sms  : SMS only (India, DLT-free quick SMS)  needs api_key
// Credentials come from the in-app Gateway settings (D1) or from environment secrets.
// With no gateway configured, delivery is "simulated" and recorded so the flow still demonstrates.

export interface NotifyEnv {
  DB?: D1Database
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  TEXTBELT_KEY?: string
  FAST2SMS_KEY?: string
  SMS_PROVIDER?: string
}

export interface GatewayConfig {
  provider: 'twilio' | 'textbelt' | 'fast2sms' | 'none'
  twilio_sid?: string; twilio_token?: string; twilio_from?: string
  textbelt_key?: string
  fast2sms_key?: string
  voice: boolean          // can place calls
}

export interface DeliveryResult { status: 'sent' | 'simulated' | 'failed'; provider?: string; provider_ref?: string; error?: string }

let cache: { cfg: GatewayConfig; at: number } | null = null

export async function loadGateway(env: NotifyEnv, force = false): Promise<GatewayConfig> {
  if (!force && cache && Date.now() - cache.at < 30_000) return cache.cfg
  const s: Record<string, string> = {}
  if (env.DB) {
    try {
      const { results } = await env.DB.prepare('SELECT key, value FROM gateway_settings').all<{ key: string; value: string }>()
      for (const r of results) s[r.key] = r.value
    } catch { /* table may not exist yet */ }
  }
  const twilio_sid = s.twilio_sid || env.TWILIO_ACCOUNT_SID
  const twilio_token = s.twilio_token || env.TWILIO_AUTH_TOKEN
  const twilio_from = s.twilio_from || env.TWILIO_FROM_NUMBER
  const textbelt_key = s.textbelt_key || env.TEXTBELT_KEY
  const fast2sms_key = s.fast2sms_key || env.FAST2SMS_KEY
  let provider = (s.provider || env.SMS_PROVIDER || '') as GatewayConfig['provider']
  if (!provider) {
    provider = twilio_sid && twilio_token && twilio_from ? 'twilio' : fast2sms_key ? 'fast2sms' : textbelt_key ? 'textbelt' : 'none'
  }
  const cfg: GatewayConfig = { provider, twilio_sid, twilio_token, twilio_from, textbelt_key, fast2sms_key, voice: provider === 'twilio' && !!(twilio_sid && twilio_token && twilio_from) }
  cache = { cfg, at: Date.now() }
  return cfg
}

export function invalidateGateway() { cache = null }

export const gatewayReady = (cfg: GatewayConfig) =>
  (cfg.provider === 'twilio' && !!(cfg.twilio_sid && cfg.twilio_token && cfg.twilio_from)) ||
  (cfg.provider === 'textbelt' && !!cfg.textbelt_key) ||
  (cfg.provider === 'fast2sms' && !!cfg.fast2sms_key)

// public-safe summary (never returns secrets)
export function gatewaySummary(cfg: GatewayConfig) {
  const mask = (v?: string) => v ? v.slice(0, 4) + '…' + v.slice(-3) : ''
  return {
    provider: cfg.provider, ready: gatewayReady(cfg), voice: cfg.voice,
    twilio: { configured: !!(cfg.twilio_sid && cfg.twilio_token && cfg.twilio_from), sid: mask(cfg.twilio_sid), from: cfg.twilio_from || '' },
    textbelt: { configured: !!cfg.textbelt_key, key: cfg.textbelt_key === 'textbelt' ? 'textbelt (free, 1/day)' : mask(cfg.textbelt_key) },
    fast2sms: { configured: !!cfg.fast2sms_key, key: mask(cfg.fast2sms_key) },
  }
}

// ---------- providers ----------
async function twilioPost(cfg: GatewayConfig, resource: 'Messages' | 'Calls', form: Record<string, string>): Promise<DeliveryResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilio_sid}/${resource}.json`
  const auth = btoa(`${cfg.twilio_sid}:${cfg.twilio_token}`)
  try {
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() })
    const j = await res.json() as any
    if (!res.ok) return { status: 'failed', provider: 'twilio', error: j.message || `Twilio ${res.status}` }
    return { status: 'sent', provider: 'twilio', provider_ref: j.sid }
  } catch (e: any) { return { status: 'failed', provider: 'twilio', error: e.message } }
}

async function textbeltSend(cfg: GatewayConfig, to: string, body: string): Promise<DeliveryResult> {
  try {
    const res = await fetch('https://textbelt.com/text', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: to, message: body.slice(0, 600), key: cfg.textbelt_key }) })
    const j = await res.json() as any
    if (!j.success) return { status: 'failed', provider: 'textbelt', error: j.error || 'Textbelt rejected the message' }
    return { status: 'sent', provider: 'textbelt', provider_ref: j.textId ? String(j.textId) : undefined }
  } catch (e: any) { return { status: 'failed', provider: 'textbelt', error: e.message } }
}

async function fast2smsSend(cfg: GatewayConfig, to: string, body: string): Promise<DeliveryResult> {
  // Fast2SMS quick route: Indian numbers only (10 digits)
  const digits = to.replace(/\D/g, '')
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits
  if (local.length !== 10) return { status: 'failed', provider: 'fast2sms', error: 'Fast2SMS supports Indian 10-digit numbers only' }
  try {
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', { method: 'POST', headers: { authorization: cfg.fast2sms_key!, 'content-type': 'application/json' }, body: JSON.stringify({ route: 'q', message: body.slice(0, 500), language: 'english', flash: 0, numbers: local }) })
    const j = await res.json() as any
    if (!j.return) return { status: 'failed', provider: 'fast2sms', error: Array.isArray(j.message) ? j.message.join(', ') : (j.message || 'Fast2SMS rejected the message') }
    return { status: 'sent', provider: 'fast2sms', provider_ref: Array.isArray(j.request_id) ? j.request_id[0] : j.request_id }
  } catch (e: any) { return { status: 'failed', provider: 'fast2sms', error: e.message } }
}

// ---------- public API ----------
export async function sendSMS(env: NotifyEnv, to: string, body: string): Promise<DeliveryResult> {
  const cfg = await loadGateway(env)
  if (!gatewayReady(cfg)) return { status: 'simulated', provider: 'none' }
  if (cfg.provider === 'twilio') return twilioPost(cfg, 'Messages', { To: to, From: cfg.twilio_from!, Body: body.slice(0, 1500) })
  if (cfg.provider === 'textbelt') return textbeltSend(cfg, to, body)
  return fast2smsSend(cfg, to, body)
}

// Voice call (Twilio only). Other providers fall back to an SMS marked as "call fallback".
export async function placeCall(env: NotifyEnv, to: string, spoken: string): Promise<DeliveryResult> {
  const cfg = await loadGateway(env)
  if (!gatewayReady(cfg)) return { status: 'simulated', provider: 'none' }
  if (cfg.voice) {
    const safe = spoken.replace(/[<>&]/g, ' ').slice(0, 800)
    const twiml = `<Response><Say voice="alice" language="en-IN">${safe}</Say><Pause length="1"/><Say voice="alice" language="en-IN">${safe}</Say></Response>`
    return twilioPost(cfg, 'Calls', { To: to, From: cfg.twilio_from!, Twiml: twiml })
  }
  const r = await sendSMS(env, to, `[VOICE ALERT — delivered as SMS: your gateway (${cfg.provider}) has no calling] ${spoken}`)
  return { ...r, error: r.status === 'sent' ? 'Voice not supported by this gateway; sent as SMS instead' : r.error }
}

// ---------- message templates (plain language, SMS-friendly) ----------
const STATUS_WORD: Record<string, string> = { RED: 'DANGER', AMBER: 'WARNING', YELLOW: 'WATCH', GREEN: 'ALL CLEAR' }

export function smsText(opts: { label: string; place: string; level: string; headline: string; advice: string; url: string }) {
  const w = STATUS_WORD[opts.level] || opts.level
  return `ResiliNet ${w} for ${opts.label} (${opts.place}): ${opts.headline}. ${opts.advice} Details: ${opts.url}`.slice(0, 320)
}

export function callText(opts: { firstName: string; label: string; place: string; level: string; headline: string; advice: string }) {
  const w = STATUS_WORD[opts.level] || opts.level
  return `Hello ${opts.firstName}. This is a weather ${w.toLowerCase()} from ResiliNet for ${opts.label}, ${opts.place}. ${opts.headline}. ${opts.advice} Please stay safe and follow local authorities.`
}

export function allClearText(opts: { label: string; place: string; url: string }) {
  return `ResiliNet ALL CLEAR for ${opts.label} (${opts.place}): severe weather risk has passed. Stay alert for updates. ${opts.url}`
}
