import { Hono } from 'hono'
import type { Bindings } from './types'
import api from './api'
import pub from './public-api'
import acct from './account-api'

const app = new Hono<{ Bindings: Bindings }>()

app.route('/api', pub)   // public, location-aware endpoints
app.route('/api', api)   // operator/demo endpoints
app.route('/api', acct)  // accounts, alert subscriptions, SMS/call notifications

const HEAD = (title: string, desc: string, extraCss = '', viewport = 'width=device-width, initial-scale=1, viewport-fit=cover') => `
<meta charset="utf-8" />
<meta name="viewport" content="${viewport}" />
<meta name="theme-color" content="#07090c">
<meta name="description" content="${desc}">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<link href="/static/style.css" rel="stylesheet">
<link href="/static/shared.css" rel="stylesheet">
${extraCss}`

const SITE_NAV_FN = (active = 'home') => `
<nav class="top"><div class="top-in">
  <a class="brand" href="/"><svg viewBox="0 0 48 48" fill="none"><circle cx="19" cy="18" r="9" fill="#f6b73c"/><path d="M14 36h20a7 7 0 0 0 .8-13.95A9 9 0 0 0 17.6 20 8 8 0 0 0 14 36z" fill="#fff" stroke="#2e8bff" stroke-width="2"/><path d="M18 40l-2 4M25 40l-2 4M32 40l-2 4" stroke="#2e8bff" stroke-width="2.4" stroke-linecap="round"/></svg>ResiliNet</a>
  <button class="burger" id="burger" aria-label="Menu">☰</button>
  <div class="menu" id="menu">
    <a href="/" class="${active === 'home' ? 'on' : ''}">Weather</a>
    <a href="/account" class="${active === 'account' ? 'on' : ''}">My Alerts</a>
    <a href="/console" class="${active === 'console' ? 'on' : ''}">Radar &amp; Map</a>
    <a href="/help" class="${active === 'help' ? 'on' : ''}">Safety</a>
    <a href="/docs" class="${active === 'docs' ? 'on' : ''}">Developers</a>
    <a class="btn" id="nav-auth" href="/login?mode=login">Login</a>
  </div>
</div></nav>
<script type="module" src="/static/nav.js"></script>`
const SITE_NAV = SITE_NAV_FN('home')

const SITE_FOOT = `<footer class="foot"><div class="wrap"><div>© ResiliNet · Weather data Open-Meteo · Radar RainViewer · Map © OpenStreetMap. Not an official warning service — always follow local authorities.</div><div><a href="/help">Help</a><a href="/console">Radar &amp; Map</a><a href="/docs">API</a></div></div></footer>`

// Generic light page shell used by every non-home page
const PAGE = (o: { title: string; desc: string; active: string; css?: string; body: string; scripts?: string; bodyClass?: string; leaflet?: boolean }) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${o.title}</title><meta name="description" content="${o.desc}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
${o.leaflet ? '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">' : ''}
<link href="/static/shared.css" rel="stylesheet"><link href="/static/site.css" rel="stylesheet">${o.css || ''}
</head><body class="site ${o.bodyClass || ''}">
${SITE_NAV_FN(o.active)}
${o.body}
${SITE_FOOT}
<div id="toast-host" class="toast-host"></div>
${o.leaflet ? '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>' : ''}
${o.scripts || ''}
</body></html>`

app.get('/', (c) => c.html(`<!doctype html><html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ResiliNet — Weather warnings for your town</title>
<meta name="description" content="Live rain, storm, flood and wind warnings for any town in the world, in plain language. Get SMS or phone-call alerts.">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="">
<link href="/static/shared.css" rel="stylesheet"><link href="/static/site.css" rel="stylesheet">
</head><body class="site">
${SITE_NAV}
<main id="site-app"><div class="loading">Loading…</div></main>
<div id="toast-host" class="toast-host"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script type="module" src="/static/site.js"></script>
</body></html>`))

// ---------- Expert / operator console (responsive, light theme) ----------
app.get('/console', (c) => c.html(PAGE({
  title: 'ResiliNet — Radar & Map', desc: 'Live radar, hazard breakdown, forecast timeline and alert dispatch for any location.', active: 'console', leaflet: true,
  css: '<link href="/static/style.css" rel="stylesheet"><link href="/static/console.css" rel="stylesheet"><link href="/static/light.css" rel="stylesheet">',
  bodyClass: 'console-page',
  body: '<div id="app"></div>',
  scripts: '<script type="module" src="/static/app.js"></script>',
})))

// Old citizen route → home with the village preselected
app.get('/citizen', (c) => {
  const v = c.req.query('v')
  return c.redirect(v ? `/?demo=${encodeURIComponent(v)}` : '/', 302)
})

// ---------- Help / About ----------
app.get('/help', (c) => c.html(PAGE({
  title: 'ResiliNet — Safety & Help', desc: 'How to use ResiliNet, what every screen means, and where the data comes from.', active: 'help',
  body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">Help centre</span><h1>Safety &amp; Help</h1><p>How ResiliNet works, what the colours mean, and what to do when a warning arrives.</p></div></section>
<main class="help-page">
  <p class="lead span-all">ResiliNet tells you, in plain words, whether dangerous weather — flooding, thunderstorms, heavy rain or strong winds — is expected where <b>you</b> are, anywhere in the world. It's free and needs no account.</p>

  <section class="help-card" id="help-home">
    <h2>🏠 My Weather (home page)</h2>
    <ol>
      <li><b>Choose your place.</b> Tap <b>Use my location</b> (your browser will ask permission) or type a town, city, village or even coordinates like <code>28.16, 85.34</code>. Suggestions appear as you type.</li>
      <li><b>Read the big status card.</b> <span class="pill green">SAFE</span> nothing to worry about · <span class="pill yellow">WATCH</span> keep an eye on it · <span class="pill amber">WARNING</span> get ready · <span class="pill red">DANGER</span> act now.</li>
      <li><b>Follow "What you should do".</b> Simple steps written for the current situation.</li>
      <li><b>Look at the map.</b> Real rain radar from the last two hours is drawn over the map (RainViewer). Press ▶ to animate it. Your place is the marker.</li>
      <li><b>Next hours &amp; next days.</b> Colour-coded timeline so you can plan.</li>
      <li><b>Save places.</b> Star a place to keep it on your device (no sign-up). Switch between home, work, family.</li>
      <li><b>Report what you see.</b> Tell others it's flooding, hailing, etc. Reports within ~50 km appear for everyone.</li>
      <li><b>Share.</b> The share button copies a link that opens this exact place.</li>
    </ol>
  </section>

  <section class="help-card" id="help-alerts">
    <h2>📱 SMS &amp; phone-call alerts (account)</h2>
    <ol>
      <li><b>Create a free account</b> at <a href="/login">/login</a> — first name, email, password and your mobile number with country code.</li>
      <li>On <a href="/account">My alerts</a>, <b>add the places you care about</b> (home, work, family). Choose when to be warned: Watch (yellow), Warning (amber) or Danger (red) only.</li>
      <li>Pick <b>SMS</b>, <b>phone call</b> or both. Calls read the warning aloud and by default are made only for Danger. Optional <b>quiet hours</b> silence non-critical alerts at night — Danger always gets through.</li>
      <li>Press <b>Send test SMS</b> / <b>Make test call</b> to confirm your number works, or <b>Run a drill</b> to receive the exact message a real warning would use.</li>
      <li>ResiliNet re-checks every place <b>every 10 minutes</b>. When the risk rises past your threshold you get a message; when it drops back to safe you get an "all clear". The same level is repeated at most every 90 minutes.</li>
    </ol>
    <p>Every message and call is listed under <b>Messages &amp; calls</b>. If the server has no SMS gateway configured you will see <em>RECORDED (DEMO)</em> — the logic is identical, only the final delivery is skipped.</p>
  </section>

  <section class="help-card" id="help-console">
    <h2>🛰️ Expert Console</h2>
    <p>The professional screen used by disaster-management operators — it also works on phones (panels stack vertically). Everything you see there:</p>
    <ul>
      <li><b>Location bar</b> — same search / GPS as the home page. Radar, map, hazards and forecast switch to that place instantly.</li>
      <li><b>KPIs</b> — quick numbers: live risk, rain rate, gusts, storm energy, river flow vs normal, alerts.</li>
      <li><b>Live Radar map</b> — real RainViewer radar tiles on an OpenStreetMap base, with an animation slider.</li>
      <li><b>Hazard breakdown</b> — flood / storm / wind / rain probabilities computed from the forecast.</li>
      <li><b>Nowcast timeline</b> — rain and gust forecast for the next 12 hours.</li>
      <li><b>Alerts feed</b> — live alerts recorded for places people have checked, plus operator alerts.</li>
      <li><b>Dispatch console</b> — simulates sending warnings via Cell Broadcast, SMS, BLE mesh and app push (nothing is actually sent).</li>
      <li><b>Training scenario</b> — a switch that loads the Langtang (Nepal) flash-flood exercise with simulated sensors, AI-ensemble panel and village register. It is clearly labelled <em>SCENARIO</em> so nobody mistakes it for real data.</li>
      <li><b>Zones &amp; Audit</b> — village risk register (scenario), current observation, operator audit trail and dispatch history.</li>
      <li><b>Export</b> — download the whole incident as JSON.</li>
    </ul>
  </section>

  <section class="help-card" id="help-data">
    <h2>📡 Where the data comes from</h2>
    <ul>
      <li><b>Weather forecast</b> — <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>, blending ECMWF, GFS, ICON and national models; 15-minute resolution where available.</li>
      <li><b>River flow</b> — Open-Meteo Flood API (GloFAS), compared to the long-term average for that river.</li>
      <li><b>Rain radar</b> — <a href="https://www.rainviewer.com" target="_blank" rel="noopener">RainViewer</a> composite of national radar networks.</li>
      <li><b>Maps</b> — © OpenStreetMap contributors, via Leaflet.</li>
      <li><b>Places</b> — Open-Meteo geocoding &amp; BigDataCloud reverse geocoding.</li>
    </ul>
    <p>Risk levels are computed by ResiliNet from rain rate, accumulated rain, storm energy (CAPE), wind gusts and river flow. Forecasts are refreshed every 10 minutes.</p>
  </section>

  <section class="help-card warn" id="help-disclaimer">
    <h2>⚠️ Important</h2>
    <p>This is a prototype built for Smart India Hackathon 2026 (SIH26077, Team Hack Wizards). It is <b>not</b> an official warning service. Always follow instructions from your national meteorological department and local authorities. In an emergency call your local emergency number (India 112 · Nepal 100 · EU 112 · US 911 · UK 999).</p>
  </section>

  <section class="help-card" id="help-api">
    <h2>🧩 For developers</h2>
    <p>Everything is available as JSON — see the <a href="/docs">API reference</a>. Example: <code>/api/live?lat=19.07&amp;lon=72.88</code>.</p>
  </section>
</main>`,
})))

// ---------- Login / Create account (split layout) ----------
app.get('/login', (c) => c.html(`<!doctype html><html lang="en"><head>
${HEAD('ResiliNet — Log in or create an account', 'Create a free ResiliNet account to receive SMS and phone-call warnings before severe weather reaches your home.', '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet"><link href="/static/auth.css" rel="stylesheet">')}
</head><body class="auth-page">
<main class="auth-shell" id="auth-shell">
  <aside class="auth-visual" aria-hidden="true">
    <div class="auth-visual-top">
      <a class="auth-logo" href="/"><svg viewBox="0 0 48 48" width="30" height="30" fill="none"><circle cx="19" cy="18" r="9" fill="#f6b73c"/><path d="M14 36h20a7 7 0 0 0 .8-13.95A9 9 0 0 0 17.6 20 8 8 0 0 0 14 36z" fill="#fff" stroke="#2e8bff" stroke-width="2"/></svg>ResiliNet</a>
      <a class="auth-back" href="/">Back to website →</a>
    </div>
    <div class="auth-visual-bottom">
      <div class="auth-tagline" id="auth-tagline">Warned before the storm,<br>safe when it arrives.</div>
      <div class="auth-dots"><span class="on"></span><span></span><span></span></div>
    </div>
  </aside>
  <section class="auth-form-wrap" id="auth-form-wrap"><div class="boot-note mono">LOADING…</div></section>
</main>
<div id="toast-host" class="toast-host"></div>
<script type="module" src="/static/auth.js"></script>
</body></html>`))

// ---------- Account: alert places, notifications, profile ----------
app.get('/account', (c) => c.html(PAGE({
  title: 'ResiliNet — My Alerts', desc: 'Manage the places you want to be warned about, your phone number and your notification history.', active: 'account',
  css: '<link href="/static/style.css" rel="stylesheet"><link href="/static/home.css" rel="stylesheet"><link href="/static/account.css" rel="stylesheet"><link href="/static/light.css" rel="stylesheet">',
  bodyClass: 'account-page',
  body: '<main id="account-app" class="home-app account-app"><div class="loading">Loading…</div></main>',
  scripts: '<script type="module" src="/static/account.js"></script>',
})))

// ---------- API reference ----------
app.get('/docs', (c) => {
  const routes: Array<[string, string, string]> = [
    ['GET', '/api/places/search?q=', 'Search any place on Earth (or "lat, lon")'],
    ['GET', '/api/places/reverse?lat=&lon=', 'Coordinates → place name'],
    ['GET', '/api/live?lat=&lon=&name=&refresh=1', 'Live risk assessment: status, advice, hazards, next hours/days, radar-ready coords'],
    ['GET', '/api/live/alerts', 'Alerts recorded for real locations'],
    ['GET', '/api/popular', 'Most-checked places'],
    ['GET / POST', '/api/reports?lat=&lon=', 'Community reports near a point / submit { lat, lon, kind, severity, note, place }'],
    ['POST', '/api/auth/register · /login · /logout', 'Account (email + password, cookie session)'],
    ['GET / PATCH', '/api/auth/me', 'Current user / update profile & phone'],
    ['GET / POST / PATCH / DELETE', '/api/subscriptions', 'Places to be warned about (threshold, SMS/call, quiet hours)'],
    ['POST', '/api/subscriptions/:id/check · /simulate', 'Re-check now / run a drill'],
    ['GET', '/api/notifications', 'SMS / call history'],
    ['POST', '/api/notifications/test', '{ channel: "sms" | "call" } — send a test to your phone'],
    ['GET', '/api/health', 'Service + D1 health'],
    ['GET', '/api/state', 'Scenario mode, KPIs, observation + fused hazards (training scenario)'],
    ['POST', '/api/state/mode', '{ mode: "severe" | "clear" }'],
    ['GET', '/api/sensors · /api/models · /api/villages', 'Scenario sources, ensemble, village register'],
    ['PATCH', '/api/villages/:slug', '{ risk_override }'],
    ['GET / POST', '/api/alerts', 'Alert feed / manual alert'],
    ['POST', '/api/alerts/:id/ack · /resolve', 'Alert lifecycle'],
    ['GET / POST', '/api/dispatch', 'Dispatch history / send (severe scenario only)'],
    ['GET', '/api/nowcast', 'Scenario -30..+60 min timeline'],
    ['GET', '/api/citizen/:slug', 'Scenario citizen payload'],
    ['GET', '/api/audit · /api/export/incident', 'Audit trail / incident export'],
  ]
  const rows = routes.map(([m, p, d]) => `<tr><td><span class="method ${m.split(' ')[0]}">${m}</span></td><td><code>${p}</code></td><td>${d}</td></tr>`).join('')
  return c.html(PAGE({
    title: 'ResiliNet — Developers', desc: 'REST API reference', active: 'docs',
    body: `<section class="page-hero"><div class="wrap"><span class="eyebrow">REST API</span><h1>Developers</h1><p>Everything on this site is available as JSON. All responses are <code>{ ok, … }</code>; mutating calls accept an <code>x-operator</code> header for the audit trail.</p></div></section>
<section class="docs-wrap"><table class="api-table"><thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>
<p style="font-size:13px;color:#6b7280;margin-top:14px">Storage: Cloudflare D1 · Weather: Open-Meteo · Radar: RainViewer · Example: <code>/api/live?lat=19.07&amp;lon=72.88</code></p></section>`,
  }))
})

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) return c.json({ ok: false, error: 'not found' }, 404)
  return c.redirect('/', 302)
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ ok: false, error: err.message ?? 'internal error' }, 500)
})

export default app
