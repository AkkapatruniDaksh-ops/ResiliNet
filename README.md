# 🌦️ ResiliNet — Intelligent Weather Monitoring & Early Warning Platform

<p align="center">
  <strong>🌍 Monitor. Predict. Prepare. Protect.</strong>
</p>

**A cloud-based weather monitoring and early warning platform that helps people understand severe weather risks, receive location-based alerts, and make safer decisions.**

<p align="center">
  <img src="public/static/img/hero-storm.jpg" alt="Severe weather" width="100%">
</p>

## 🌍 Overview

ResiliNet is a weather intelligence and disaster preparedness platform designed to provide accessible, location-specific weather risk information.

It combines weather forecasts, flood-related data, radar visualization, hazard assessment, community reports, and an operator dashboard in one platform.

The application supports two main user groups:

- 👥 **Citizens:** Check local weather conditions, understand potential hazards, and receive practical safety guidance.
- 🛡️ **Disaster-management operators:** Monitor weather risks, review alerts, manage incidents, and access operational tools.

## 🚀 Live Demo

- 🌐 **Application:** https://d5e57512.webapp-bjt.pages.dev
- 💻 **GitHub Repository:** https://github.com/AkkapatruniDaksh-ops/ResiliNet

*The demo URL is a Cloudflare Pages deployment URL and may change with subsequent deployments.*

## ✨ Key Features

### 🌤️ 1. Public Weather Dashboard

- 🔎 Search for locations around the world.
- 📍 Use device location with GPS permission.
- 🌡️ View current weather conditions.
- 🌧️ Monitor heavy rainfall, flooding, thunderstorms, and strong winds.
- ⚠️ View weather risk levels and practical safety recommendations.
- 📅 Explore hourly forecasts and multi-day outlooks.
- ⭐ Save frequently monitored locations.
- 🔗 Share location-specific weather views.

### 🚨 2. Weather Risk Assessment

ResiliNet evaluates multiple weather hazards and maps them into four risk levels:

| Risk Level | Meaning |
|---|---|
| 🟢 GREEN | Normal conditions |
| 🟡 YELLOW | Watch |
| 🟠 AMBER | Warning |
| 🔴 RED | Danger |

The assessment considers rainfall intensity, precipitation forecasts, flood-related indicators, thunderstorm conditions, and wind gusts.

### 🛰️ 3. Live Radar & Interactive Maps

- 🌧️ RainViewer radar visualization.
- 🗺️ OpenStreetMap-based interactive maps.
- 🎞️ Radar animation and short-term nowcast visualization.
- 📍 Location-based weather monitoring.

### 🏘️ 4. Community Weather Reporting

Users can submit reports about observed conditions, including:

- 🌊 Flooding
- 🌧️ Heavy rainfall
- ⚡ Lightning
- 💨 Strong winds
- 🧊 Hail
- ⛰️ Landslides
- ✅ All-clear reports

Community reports provide additional local context but should not be treated as independently verified observations.

### 🖥️ 5. Disaster Management Console

The `/console` interface provides operational monitoring tools.

Features include:

- 🌦️ Live weather monitoring for selected locations.
- ⚠️ Hazard assessment and risk indicators.
- 🛰️ Weather radar and forecast panels.
- 🚨 Alerts and incident monitoring.
- 📋 Community report monitoring.
- ✔️ Alert acknowledgement and resolution.
- 🔔 Manual alert management.
- 📊 Audit history and incident export.
- 🧪 Clearly labelled training scenarios for simulated disaster exercises.

### 🔐 6. User Accounts & Notifications

- 📧 Email and password registration and login.
- 🔵 Google OAuth integration, subject to configuration.
- 🔒 Secure password hashing.
- 🍪 Session-based authentication.
- 📍 Location subscriptions.
- 🔔 Configurable alert thresholds.
- 🌙 Quiet hours and notification preferences.
- 📱 SMS and phone-call notification integrations.

Supported notification gateways include Twilio, Textbelt, and Fast2SMS, subject to provider configuration and availability.

Without a configured notification gateway, messages are recorded in demo delivery mode rather than sent to real phones.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| 🎨 Frontend | HTML, CSS, JavaScript |
| ⚙️ Backend | TypeScript, Hono |
| 📦 Build Tool | Vite |
| 🗄️ Database | Cloudflare D1 |
| ☁️ Deployment | Cloudflare Pages |
| 🌦️ Weather Data | Open-Meteo |
| 🌊 Flood Data | Open-Meteo Flood API / GloFAS |
| 🛰️ Radar | RainViewer |
| 🗺️ Maps | Leaflet, OpenStreetMap |
| 🔐 Authentication | Web Crypto API, Google OAuth |
| 🔄 Version Control | Git, GitHub |

## 🏗️ System Architecture

```text
             👥 CITIZENS / OPERATORS
                       |
                       v
              🌐 WEB APPLICATION
            HTML + CSS + JavaScript
                       |
                       v
           ☁️ CLOUDFLARE PAGES / WORKERS
                  Hono + TypeScript
                       |
          +------------+------------+
          |            |            |
          v            v            v
      🌦️ Weather    ⚠️ Risk      🔌 API
         APIs        Engine       Routes
          |            |            |
          +------------+------------+
                       |
                       v
                🗄️ CLOUDFLARE D1
                    DATABASE
                       |
          +------------+------------+
          |            |            |
          v            v            v
       🚨 Alerts   📍 Subscriptions 📋 Reports
          |
          v
       📱 Notification Gateways
             SMS / Voice Calls
```

## 🌐 Weather Data Sources

ResiliNet integrates the following external data services:

- 🌦️ **Open-Meteo:** Weather forecasts and meteorological information.
- 🌊 **Open-Meteo Flood API / GloFAS:** Flood-related and river-discharge indicators.
- 🛰️ **RainViewer:** Weather radar tiles.
- 🗺️ **OpenStreetMap:** Geographic map data.
- 📍 **Open-Meteo Geocoding:** Location search.
- 🌐 **BigDataCloud:** Reverse geocoding.

Data availability and forecast accuracy may vary by location and provider.

## 📁 Project Structure

```text
ResiliNet/
│
├── 📂 migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_global_locations.sql
│   ├── 0003_users_alerts.sql
│   └── 0004_gateway_settings.sql
│
├── 📂 public/
│   └── 📂 static/
│       ├── 📂 img/
│       ├── account.js
│       ├── app.js
│       ├── auth.js
│       ├── home.js
│       ├── radar.js
│       └── stylesheets and other assets
│
├── 📂 src/
│   ├── account-api.ts
│   ├── api.ts
│   ├── auth.ts
│   ├── engine.ts
│   ├── google-auth.ts
│   ├── index.tsx
│   ├── notify.ts
│   ├── public-api.ts
│   ├── types.ts
│   └── weather.ts
│
├── .dev.vars.example
├── .gitignore
├── package.json
├── package-lock.json
├── schema.sql
├── seed.sql
├── vite.config.ts
└── wrangler.jsonc
```

## 💻 Getting Started

### 📋 Prerequisites

- Node.js
- npm
- Git
- Cloudflare account for deployment
- VS Code (recommended)

### 1️⃣ Clone the repository

```bash
git clone https://github.com/AkkapatruniDaksh-ops/ResiliNet.git
cd ResiliNet
```

### 2️⃣ Install dependencies

```bash
npm ci
```

### 3️⃣ Configure environment variables

Create your local environment file:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and configure the credentials required for the integrations you want to use.

🔒 **Security:** Keep `.dev.vars` private. Never commit real API keys, OAuth secrets, or passwords.

### 4️⃣ Apply local database migrations

```bash
npm run db:migrate:local
```

### 5️⃣ Seed the local database

```bash
npm run db:seed
```

### 6️⃣ Build the application

```bash
npm run build
```

### 7️⃣ Start the local development server

```bash
npm run dev:sandbox
```

Open your browser:

```text
http://localhost:3000
```

## ☁️ Deployment

ResiliNet is deployed using **Cloudflare Pages** with a Cloudflare D1 database.

The project uses:

- ☁️ Cloudflare Pages for application hosting.
- ⚙️ Cloudflare Workers runtime for backend execution.
- 🗄️ Cloudflare D1 for persistent data storage.

For an appropriately configured Cloudflare environment, build and deploy using:

```bash
npm run deploy:prod
```

Ensure that the D1 database binding and required production environment variables and secrets are configured before deployment.

## 🔐 Security Considerations

- 🔒 Passwords are hashed using PBKDF2-SHA256.
- 🍪 Authentication sessions use HTTP-only cookies.
- 🔑 Sensitive configuration is kept outside the public repository.
- 🔐 OAuth requires valid client credentials and authorized redirect URIs.
- 📲 Notification integrations require provider credentials.
- 🛡️ Community reports are user-submitted and may require verification.

## 🔮 Future Improvements

Potential areas for further development include:

- 🇮🇳 Integration of official weather warnings, including IMD and CAP feeds.
- 🌐 Multilingual support.
- 📡 Offline access to recently retrieved weather information.
- 📱 Phone-number OTP verification.
- 🛡️ Stronger abuse prevention and rate limiting for community reports.
- 👨‍💻 Expanded operator account and access management.
- 📊 Further validation of risk assessments against official warnings and observed events.

## ⚠️ Disclaimer

ResiliNet provides weather-related information and model-derived risk assessments for awareness and preparedness.

It is not a replacement for official meteorological warnings, emergency services, or instructions from local authorities.

Always follow official emergency guidance.

## 👨‍💻 Author

**Daksh Akkapatruni**

- 🐙 GitHub: [@AkkapatruniDaksh-ops](https://github.com/AkkapatruniDaksh-ops)

---

<p align="center">
  ⭐ <strong>If you find this project interesting, consider giving the repository a star!</strong>
</p>

<p align="center">
  🌦️ <strong>ResiliNet — Building a safer and more resilient tomorrow.</strong>
</p>
