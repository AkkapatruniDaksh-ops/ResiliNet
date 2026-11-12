// Password hashing (PBKDF2-SHA256 via Web Crypto) + cookie sessions stored in D1.
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const ITER = 100_000
const SESSION_DAYS = 30
export const COOKIE = 'rn_session'

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const bits = await pbkdf2(password, salt, ITER)
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'pbkdf2') return false
  const bits = await pbkdf2(password, unb64(saltB64), Number(iterStr))
  const a = new Uint8Array(bits), b = unb64(hashB64)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function randomToken(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('')
}

export interface User {
  id: number; email: string; first_name: string; last_name: string | null; phone: string | null
  phone_verified: number; provider: string; created_at: string; last_login: string | null
}

export async function createSession(db: D1Database, userId: number, ua: string | undefined) {
  const id = randomToken()
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString()
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)').bind(id, userId, expires, (ua || '').slice(0, 200)).run()
  await db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(userId).run()
  return { id, expires }
}

export function setSessionCookie(c: Context, id: string) {
  setCookie(c, COOKIE, id, { httpOnly: true, sameSite: 'Lax', path: '/', secure: new URL(c.req.url).protocol === 'https:', maxAge: SESSION_DAYS * 86400 })
}

export async function currentUser(c: Context<{ Bindings: { DB: D1Database } }>): Promise<User | null> {
  const sid = getCookie(c, COOKIE)
  if (!sid) return null
  const row = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.phone_verified, u.provider, u.created_at, u.last_login
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > datetime('now')`,
  ).bind(sid).first<User>()
  return row ?? null
}

export async function destroySession(c: Context<{ Bindings: { DB: D1Database } }>) {
  const sid = getCookie(c, COOKIE)
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run()
  deleteCookie(c, COOKIE, { path: '/' })
}

// Normalise phone numbers to E.164-ish; returns null if clearly invalid
export function normalisePhone(raw: string | undefined | null, defaultCountry = '+91'): string | null {
  if (!raw) return null
  let s = raw.replace(/[\s\-().]/g, '')
  if (s.startsWith('00')) s = '+' + s.slice(2)
  if (!s.startsWith('+')) {
    if (s.length === 10) s = defaultCountry + s
    else if (s.length > 10) s = '+' + s
    else return null
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
}

export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)
