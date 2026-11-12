# ResiliNet — Severe weather warnings for everyone, everywhere

## Project Overview
- **Name**: ResiliNet-AI
- **Goal**: Tell ordinary people, in plain language, whether dangerous weather — flooding, thunderstorms, heavy rain or strong winds — is coming to **their exact location, anywhere in the world**, and what to do about it. Plus a professional Expert Console for disaster-management operators.
- **Built for**: Smart India Hackathon 2026 · Problem Statement **SIH26077** · Team **Hack Wizards** · Theme: Disaster Management
- **Audience**: The general public first (mobile-first, no sign-up, no jargon), operators second.

## URLs
- **Sandbox preview**: https://3000-ive8kkycsnx0jkjdgeavj-2e1b9533.sandbox.novita.ai
  - `/` — **My Weather**: the public app (search any place / use GPS)
  - `/console` — **Expert Console** (LIVE for any location, or the Langtang training scenario)
  - `/help` — plain-language explanation of every screen and where the data comes from
  - `/docs` — REST API reference
  - `/?lat=..&lon=..&name=..` — shareable deep link to a place
- **Production**: not yet deployed (see Deployment)

## What changed in this version (global + user-friendly)
| Before | Now |
|---|---|
| Fixed to Langtang, Nepal with simulated sensors | **Any location on Earth** — real forecast, river model and rain radar |
| Operator jargon (dBZ, CAPE, VCP) up front | **Plain-language status** (SAFE / WATCH / WARNING / DANGER) + "What you should do" |
| Desktop-only 1440 px layout | **Mobile-first** public page; console is responsive down to 390 px |
| Canvas-drawn fake radar | **Real radar** (RainViewer) over OpenStreetMap, animated last 2 h + 20 min nowcast |
| Hidden dev tweaks, unexplained controls | Every feature reachable via nav; **Help page** explains each one |
| Village list hard-coded | Search millions of places, GPS, coordinates, **save places**, share links |
| No way for people to contribute | **Community reports** ("it's flooding here") shown to everyone nearby |
| Simulation looked like real data | Scenario is clearly labelled **🎓 TRAINING SCENARIO** |

## Features

### 🏠 My Weather (`/`) — for the public
- **Find your place**: type any town/city/village (autocomplete via Open-Meteo geocoding), enter coordinates (`28.16, 85.34`), or tap **Use my location** (GPS with permission handling and friendly fallbacks).
- **Big status card**: SAFE / WATCH / WARNING / DANGER with a one-line headline, a short summary, current temperature/rain/wind/humidity, and a **countdown to the heaviest rain** when relevant. Page background tints amber/red in warning states.
- **What you should do**: situation-specific advice (move to higher ground, avoid rivers, get indoors for lightning, secure loose objects, emergency numbers by region).
- **Live rain radar map**: RainViewer composite radar on OpenStreetMap; ▶ animates the last 2 hours + nowcast; your place is a colour-coded marker; nearby community reports appear as icons.
- **Risk breakdown**: flooding / thunderstorm / heavy rain / strong wind probability bars with plain explanations.
- **Next 12 hours** (hourly rain, gust, icon, colour = risk) and **next 4 days** outlook.
- **Save places** (device-local, no account) and **share** (native share sheet or copied link).
- **Report what you see**: flood / heavy rain / lightning / wind / hail / landslide / all clear, with severity and note; visible to everyone within ~50 km for 12 h.
- Auto-refresh every 5 min; "Recently checked by others" on the welcome screen.

### 🛰️ Expert Console (`/console`) — for operators
- **Two data sources**, switchable at the top:
  - **🌍 LIVE · ANY LOCATION** — location bar (search / GPS / refresh / open public view). Panels: live data sources, hazard assessment with verdict, KPI strip (live risk, rain now, peak rain 3 h, gust, river vs normal, storm energy, alerts 24 h), **real radar map**, 12-hour rain/gust timeline, 4-day outlook, live alerts + community reports feed, dispatch console (armed when live status ≥ WARNING). Zones view shows outlook + feeds + audit + dispatch history; Citizen view shows the phone mock-up rendered from the real forecast.
  - **🎓 TRAINING SCENARIO** — the original Langtang / Trishuli flash-flood exercise (simulated sensors, AI ensemble, village register, severe/clear toggle, nowcast scrubber). Clearly bannered as simulated.
- Alerts ACK/RESOLVE, manual alert form, operator overrides, audit trail, dispatch log, incident export — all retained.
- Fully responsive (3-column → 2-column → single column).

### 🎨 Public site design
- Light, magazine-style weather layout (AirCast-inspired): full-bleed **photo hero** (CC/public-domain storm & ocean photographs in `public/static/img/`) with the place name, big temperature, rain % and wind, three glass "Now / next hours" cards, rounded search + "My location" pill, Poppins typography, sticky white nav (Weather · Alerts · Radar & Map · Safety · About · Login).
- Below the hero: colour-coded alert banner with **"Get SMS / call alerts"**, "What you should do", risk bars, live radar map, 12-hour strip, next-days list, community reports, call-to-action band and footer.
- Login page uses the same photo panel + light form styling.
- **One design system on every page.** All routes (`/`, `/login`, `/account`, `/help`, `/docs`, `/console`) render through a shared `PAGE()` shell in `src/index.tsx`: same Poppins font, sticky white nav with burger menu, login/name button (`nav.js`), photo `page-hero` banner on inner pages, white rounded cards, and a navy footer.
- `public/static/light.css` re-skins the operator console and account modules (originally dark) to the light palette — blue accent, grey borders, coloured status gradients, light Leaflet controls — without touching their logic.
- Developers page is a proper API reference table with GET/POST/PUT/DELETE method badges; Help page is a card grid with colour pills.
- Fully responsive: verified at 1366 px and 390 px with Playwright (no horizontal overflow, no JS errors). Console deep-links via `/console?lat=&lon=&name=` from the home page's "Detailed view" button.

### 👤 Accounts & SMS / phone-call alerts (`/login`, `/account`)
- **Login / sign-up page** (`/login`): split layout — animated storm/radar scene on the left, "Create an account" / "Log in" form on the right (first & last name, email, mobile number with country-code picker, password with show/hide, T&C, Google/Apple placeholders). Redirects back to where the user came from.
- **Security**: PBKDF2-SHA256 password hashing via Web Crypto, HttpOnly cookie sessions (30 days) in D1, server-side validation with friendly messages.
- **My alerts** (`/account`): step-by-step setup guide; up to 10 watched places (search or GPS) each with warn-threshold (Watch / Warning / Danger), SMS on/off, phone call on/off + call threshold, quiet hours, pause; "Check now", "Run a drill", "Send test SMS", "Make test call"; full message & call history; profile / phone / password editing.
- **Notification engine** (`src/account-api.ts`): every 10 min each active place is re-assessed with the live forecast. Sends SMS when risk ≥ threshold (escalation or 90-min repeat), voice call when ≥ call threshold, "all clear" SMS when back to green; quiet hours are respected except for Danger.
- **Delivery** (`src/notify.ts`): pluggable gateways — **Twilio** (SMS + voice calls, global), **Textbelt** (SMS, global; key `textbelt` = 1 free/day), **Fast2SMS** (SMS, India). Credentials are entered from the account page (**"Connect an SMS gateway"** → stored in D1 `gateway_settings`) or via env secrets (`TWILIO_*`, `TEXTBELT_KEY`, `FAST2SMS_KEY`, `SMS_PROVIDER`). Without a gateway the app runs in clearly-labelled **demo delivery mode** and records messages instead of sending them. Voice alerts fall back to SMS on SMS-only gateways.
- **Why you may not receive anything yet**: the app cannot send SMS or ring a phone by itself — a telecom gateway account is mandatory. Connect one on `/account`, then use *Send test SMS*.
- Home page status card has a **"Get SMS / call alerts here"** button that deep-links the current place into the account page.

### ❓ Help (`/help`)
Explains every screen, every control, the four status levels, all data sources, and the disclaimer.

## Architecture
```
Browser (vanilla JS ES modules, Leaflet)             Cloudflare Pages / Workers (Hono + TypeScript)
┌───────────────────────────────────┐                ┌───────────────────────────────────────────────┐
│ home.js — public app               │  /api/live     │ src/index.tsx     pages + nav + routing        │
│ app.js  — expert console (2 modes) │ ◄────────────► │ src/public-api.ts places / live / reports      │
│ live-panels.js, panels.js          │  /api/places   │ src/weather.ts    Open-Meteo → risk + advice   │
│ radar-map.js — Leaflet+RainViewer  │  /api/reports  │ src/api.ts        scenario API                 │
│ radar.js, hazard-map.js (scenario) │                │ src/engine.ts     scenario nowcast engine      │
└───────────────────────────────────┘                └───────────────┬───────────────────────────────┘
        │ direct from browser                                         │ D1 (SQLite)
        ▼                                                             ▼
  RainViewer tiles · OSM tiles                 weather_cache · locations · reports · location_alerts
                                               + scenario tables (sensors, models, villages, alerts, …)
```

### Live risk engine (`src/weather.ts`)
1. Fetch Open-Meteo forecast (current, 15-min, hourly incl. CAPE, daily) + Open-Meteo Flood API (GloFAS river discharge vs long-term mean) for the coordinates.
2. Compute four hazard probabilities: **rain** (peak 15-min rate, 3 h / 6 h totals × precipitation probability), **flood** (6 h / 24 h totals, river ratio, low elevation), **storm** (CAPE gated by rain probability, WMO thunderstorm codes), **wind** (gusts).
3. Map to GREEN / YELLOW / AMBER / RED → SAFE / WATCH / WARNING / DANGER; pick the dominant hazard for the headline; generate advice.
4. Cache per 0.01° cell for 10 min in D1; record `locations` (for "popular") and `location_alerts` when AMBER/RED.

## API summary
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/places/search?q=` | Search any place, or parse `lat, lon` |
| GET | `/api/places/reverse?lat=&lon=` | Coordinates → place |
| GET | `/api/live?lat=&lon=&name=&refresh=1` | Full assessment (status, headline, advice, hazards, next hours/days, peak, river) + nearby reports |
| GET | `/api/live/alerts` | Alerts recorded for real locations |
| GET | `/api/popular` | Most-checked places |
| GET / POST | `/api/reports` | Nearby community reports / submit one |
| POST | `/api/auth/register` · `/login` · `/logout` | Accounts (cookie session) |
| GET / PATCH | `/api/auth/me` | Current user / profile & phone |
| GET / POST / PATCH / DELETE | `/api/subscriptions` | Watched places (threshold, SMS/call, quiet hours) |
| POST | `/api/subscriptions/:id/check` · `/simulate` | Re-check now / drill |
| GET / POST | `/api/notifications` · `/notifications/test` | History / send test SMS or call |
| … | `/api/state`, `/api/alerts`, `/api/dispatch`, `/api/villages`, `/api/nowcast`, `/api/audit`, `/api/export/incident` | Scenario + operator endpoints (see `/docs`) |

## Data sources (all free, no API keys)
- **Open-Meteo** forecast API (ECMWF / GFS / ICON blend, 15-min resolution) and **Flood API** (GloFAS)
- **RainViewer** composite radar tiles (past 2 h + 20 min nowcast)
- **OpenStreetMap** tiles via **Leaflet 1.9**
- **Open-Meteo Geocoding** + **BigDataCloud** reverse geocoding

## Data Architecture
- **Storage**: Cloudflare D1. Migrations `0001_initial_schema.sql` (scenario), `0002_global_locations.sql` (`weather_cache`, `locations`, `reports`, `location_alerts`), `0003_users_alerts.sql` (`users`, `sessions`, `subscriptions`, `notifications`), `0004_gateway_settings.sql`.
- **Client storage**: `localStorage` for saved places, last place, operator ID, console mode.

## Local development
```bash
npm install && npm run build
npm run db:migrate:local && npm run db:seed
pm2 start ecosystem.config.cjs
curl "http://localhost:3000/api/live?lat=19.07&lon=72.88&name=Mumbai"
```

## Deployment
- **Platform**: Cloudflare Pages + D1 · **Status**: ❌ not yet deployed
- `npx wrangler d1 create webapp-production` → set `database_id` in `wrangler.jsonc` → `npm run db:migrate:prod && npm run db:seed:prod` → `npm run deploy:prod`
- For real SMS/calls: `npx wrangler pages secret put TWILIO_ACCOUNT_SID` (and `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, optionally `APP_URL`).
- **Tech**: Hono 4 · TypeScript · Vite · D1 · vanilla JS · Leaflet · Space Grotesk / JetBrains Mono
- **Last updated**: 2026-09-20

## Not yet implemented / next steps
- Multi-language UI (Hindi, Nepali, Bengali, …) — narrative strings are centralised in `weather.ts` + `home.js`, ready for i18n.
- Google / Apple OAuth sign-in (buttons present, need OAuth client keys).
- Phone-number OTP verification before the first real SMS.
- Offline mode (service worker caching the last assessment).
- Official-warning ingestion (IMD, CAP feeds) alongside the model-derived risk.
- Accounts for operators; rate limiting on report submission.
