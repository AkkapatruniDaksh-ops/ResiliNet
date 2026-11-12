
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import {
  createSession,
  setSessionCookie,
  hashPassword,
  randomToken,
  type User
} from './auth'

type GoogleBindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  APP_URL?: string
}

const google = new Hono<{ Bindings: GoogleBindings }>()

const STATE_COOKIE = 'rn_google_state'
const NEXT_COOKIE = 'rn_google_next'

const appUrl = (c: any) =>
  (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/$/, '')

const callbackUrl = (c: any) =>
  `${appUrl(c)}/api/auth/google/callback`

function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/account'
  }

  if (value.startsWith('/api/auth/google')) {
    return '/account'
  }

  return value
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

function decodeJson(value: string): any {
  return JSON.parse(
    new TextDecoder().decode(base64UrlDecode(value))
  )
}

async function verifyGoogleToken(
  token: string,
  clientId: string
) {
  const parts = token.split('.')

  if (parts.length !== 3) {
    throw new Error('Invalid Google identity token')
  }

  const header = decodeJson(parts[0])
  const claims = decodeJson(parts[1])

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Google identity token')
  }

  const response = await fetch(
    'https://www.googleapis.com/oauth2/v3/certs'
  )

  if (!response.ok) {
    throw new Error('Could not retrieve Google signing keys')
  }

  const keys = await response.json() as {
    keys: JsonWebKey[]
  }

  const jwk = keys.keys.find(
    key => (key as any).kid === header.kid
  )

  if (!jwk) {
    throw new Error('Google signing key not found')
  }

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['verify']
  )

  const signature = base64UrlDecode(parts[2])

  const signedData = new TextEncoder().encode(
    `${parts[0]}.${parts[1]}`
  )

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature,
    signedData
  )

  if (!valid) {
    throw new Error('Google token signature is invalid')
  }

  const now = Math.floor(Date.now() / 1000)

  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(
      claims.iss
    ) ||
    claims.aud !== clientId ||
    !claims.sub ||
    !claims.email ||
    claims.email_verified !== true ||
    !claims.exp ||
    claims.exp <= now ||
    (claims.iat && claims.iat > now + 60)
  ) {
    throw new Error('Google identity claims are invalid')
  }

  return claims
}

google.get('/google', async c => {
  const state = randomToken()

  const next = safeNext(
    c.req.query('next') || '/account'
  )

  const secure = new URL(c.req.url).protocol === 'https:'

  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600
  })

  setCookie(c, NEXT_COOKIE, encodeURIComponent(next), {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600
  })

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(c),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  })

  return c.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
})

google.get('/google/callback', async c => {
  const state = c.req.query('state')
  const savedState = getCookie(c, STATE_COOKIE)
  const savedNext = getCookie(c, NEXT_COOKIE)

  deleteCookie(c, STATE_COOKIE, { path: '/' })
  deleteCookie(c, NEXT_COOKIE, { path: '/' })

  if (!state || !savedState || state !== savedState) {
    return c.redirect('/login?error=google_state')
  }

  const code = c.req.query('code')

  if (!code) {
    return c.redirect('/login?error=google_cancelled')
  }

  try {
    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: c.env.GOOGLE_CLIENT_ID,
          client_secret: c.env.GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl(c)
        })
      }
    )

    if (!tokenResponse.ok) {
      throw new Error('Google token exchange failed')
    }

    const tokens = await tokenResponse.json() as {
      id_token?: string
    }

    if (!tokens.id_token) {
      throw new Error('Google did not return an identity token')
    }

    const claims = await verifyGoogleToken(
      tokens.id_token,
      c.env.GOOGLE_CLIENT_ID
    )

    const email = String(claims.email).trim().toLowerCase()

    const existing = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    )
      .bind(email)
      .first<User & { password_hash: string }>()

    let userId: number

    if (existing) {
      if (existing.provider !== 'google') {
        return c.redirect('/login?error=google_account_exists')
      }

      userId = existing.id
    } else {
      const firstName = String(
        claims.given_name || claims.name || 'Google User'
      ).slice(0, 60)

      const lastName = claims.family_name
        ? String(claims.family_name).slice(0, 60)
        : null

      const passwordHash = await hashPassword(randomToken())

      await c.env.DB.prepare(
        `INSERT INTO users
          (email, first_name, last_name, password_hash, provider)
         VALUES (?, ?, ?, ?, 'google')`
      )
        .bind(email, firstName, lastName, passwordHash)
        .run()

      const created = await c.env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      )
        .bind(email)
        .first<{ id: number }>()

      if (!created) {
        throw new Error('Could not create Google account')
      }

      userId = created.id
    }

    const session = await createSession(
      c.env.DB,
      userId,
      c.req.header('user-agent')
    )

    setSessionCookie(c, session.id)

    let next = '/account'

    try {
      next = safeNext(
        savedNext ? decodeURIComponent(savedNext) : '/account'
      )
    } catch {
      next = '/account'
    }

    return c.redirect(next)
  } catch (error) {
    console.error('Google OAuth error:', error)

    return c.redirect('/login?error=google_failed')
  }
})

export default google
