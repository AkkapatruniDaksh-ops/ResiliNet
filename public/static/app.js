// ResiliNet — operator console controller.
// Fetches live state from the Hono/D1 API, renders panels, drives the canvases,
// and polls every few seconds so multiple operator screens stay in sync.

import { svgIcon } from './icons.js';
import { mountRadarCanvas, reflectivityLegendHTML } from './radar.js';
import { mountHazardMap } from './hazard-map.js';
import {
  dataFusionPanelHTML, aiEnginePanelHTML, alertsPanelHTML, alertRowHTML,
  dispatchConsoleHTML, kpiStripHTML, scrubberHTML, scrubberValueText, timelineReadout,
  villageTableHTML, auditPanelHTML,
} from './panels.js';
import { citizenViewHTML } from './citizen.js';
import { api, operatorId, toast, relTime, escapeHTML } from './api.js';
import { mountRadarMap, RISK_COLOR } from './radar-map.js';
import { liveKpiHTML, liveSourcesHTML, liveHazardsHTML, liveTimelineHTML, liveDaysHTML, liveAlertsHTML } from './live-panels.js';

const POLL_MS = 6000;

const state = {
  // server-side
  mode: 'severe', kpis: null, hazards: null, observation: null,
  sensors: [], models: [], ensemble: null, villages: [], alerts: [], channels: [],
  dispatches: [], timeline: [], audit: [], serverTime: null,
  // client-side
  view: 'operator', alertFilter: 'open', playing: true, t: 0,
  showRings: true, showTerrain: true,
  layers: { rain: true, lightning: true, flood: true, wind: false },
  online: true, lastSync: 0, busy: false,
  // LIVE mode (any place on Earth)
  source: localStorage.getItem('resilinet.console.source') || 'live', // live | scenario
  place: (() => {
    const u = new URLSearchParams(location.search);
    if (u.get('lat') && u.get('lon')) return { lat: +u.get('lat'), lon: +u.get('lon'), name: u.get('name') || `${(+u.get('lat')).toFixed(2)}, ${(+u.get('lon')).toFixed(2)}` };
    try { return JSON.parse(localStorage.getItem('resilinet.last') || 'null'); } catch { return null; }
  })(),
  live: null, liveReports: [], liveAlerts: [], liveLoading: false,
};
let liveMap = null;
const isLive = () => state.source === 'live';
const storm = () => state.mode === 'severe';

let radarCtl = null;
let hazardCtl = null;
let pollTimer = null;
const root = document.getElementById('app');

// ================= data =================
async function loadAll() {
  const [s, sensors, models, villages, alerts, channels, dispatches, nowcast, audit] = await Promise.all([
    api.state(), api.sensors(), api.models(), api.villages(), api.alerts(state.alertFilter),
    api.channels(), api.dispatches(8), api.nowcast(), api.audit(12),
  ]);
  const modeChanged = state.mode !== s.mode;
  state.mode = s.mode; state.kpis = s.kpis; state.hazards = s.hazards; state.observation = s.observation;
  state.serverTime = s.server_time;
  state.sensors = sensors.sensors; state.models = models.models; state.ensemble = models.ensemble;
  state.villages = villages.villages; state.alerts = alerts.alerts; state.channels = channels.channels;
  state.dispatches = dispatches.dispatches; state.timeline = nowcast.timeline; state.audit = audit.entries;
  state.lastSync = Date.now();
  return { modeChanged };
}

async function loadLive(force = false) {
  if (!state.place) return;
  const p = state.place;
  const q = new URLSearchParams({ lat: p.lat, lon: p.lon, name: p.name || '' });
  if (force) q.set('refresh', '1');
  const [res, al] = await Promise.all([fetch(`/api/live?${q}`), fetch('/api/live/alerts?limit=15')]);
  const j = await res.json(); const a = await al.json();
  if (!res.ok || j.ok === false) throw new Error(j.error || 'live weather unavailable');
  state.live = j.assessment; state.liveReports = j.reports || []; state.liveAlerts = a.alerts || [];
  state.place = { ...p, ...j.assessment.place, name: p.name || j.assessment.place.name };
  localStorage.setItem('resilinet.last', JSON.stringify(state.place));
}

async function refresh({ full = false, forceLive = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  try {
    if (isLive()) { try { await loadLive(forceLive); } catch (e) { toast(e.message, 'err'); } }
    const { modeChanged } = await loadAll();
    setOnline(true);
    if (full || modeChanged) renderMain(); else patchMain();
    renderModeButton();
  } catch (e) {
    console.error(e);
    setOnline(false);
  } finally {
    state.busy = false;
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
}

function setOnline(on) {
  state.online = on;
  const dot = document.querySelector('.live-dot');
  const txt = document.querySelector('.live-text');
  if (!dot || !txt) return;
  dot.style.background = on ? 'var(--accent)' : 'var(--danger)';
  dot.style.boxShadow = `0 0 8px ${on ? 'var(--accent)' : 'var(--danger)'}`;
  txt.style.color = on ? 'var(--accent)' : 'var(--danger)';
  txt.textContent = on ? 'SYSTEM LIVE' : 'LINK LOST · RETRYING';
}

// ================= chrome =================
function renderChrome() {
  root.innerHTML = `
    <header class="app-header" id="app-header">
      <div class="header-left">
        <div class="logo-group">
          <div class="logo-mark">
            <div class="logo-ring-outer"></div>
            <div class="logo-ring-inner"></div>
            <div class="logo-needle"></div>
            <div class="logo-dot"></div>
          </div>
          <div>
            <div class="product-name">RESILINET<span class="accent"> RADAR</span></div>
            <div class="product-sub mono">RADAR · MAP · EXPERT CONSOLE</div>
          </div>
        </div>
        <div class="vdivider"></div>
        <div class="badge-row">
          <span class="badge badge-accent mono">SIH26077</span>
          <span class="badge badge-dim mono">TEAM · HACK WIZARDS</span>
          <span class="badge badge-dim mono" title="Operator ID (stored locally)">${escapeHTML(operatorId())}</span>
        </div>
      </div>
      <div class="header-right">
        <a class="header-link mono" href="/docs" target="_blank" rel="noopener">API</a>
        <div class="live-indicator">
          <span class="live-dot"></span>
          <span class="live-text mono">SYSTEM LIVE</span>
        </div>
        <div class="clock-block">
          <div class="clock-time mono" id="clock-time">--:--:-- UTC</div>
          <div class="clock-tz mono" id="clock-sync">KATHMANDU +05:45</div>
        </div>
      </div>
    </header>

    <nav class="view-bar" id="view-bar">
      <div class="view-switch" role="tablist" aria-label="Data source">
        <button class="view-btn ${isLive() ? 'active' : ''}" data-source="live" title="Real forecast + radar for any place on Earth">🌍 LIVE · ANY LOCATION</button>
        <button class="view-btn ${!isLive() ? 'active' : ''}" data-source="scenario" title="Langtang flash-flood training exercise with simulated sensors">🎓 TRAINING SCENARIO</button>
      </div>
      <div class="view-switch" role="tablist" aria-label="Console view">
        ${[['operator', 'target', 'CONSOLE'], ['zones', 'mountain', 'ZONES & AUDIT'], ['citizen', 'people', 'CITIZEN VIEW']].map(([v, icon, label]) => `
          <button class="view-btn ${state.view === v ? 'active' : ''}" data-view="${v}">${svgIcon(icon, { size: 12 })} ${label}</button>`).join('')}
      </div>
      <div class="sim-mode-group" id="scenario-controls" style="${isLive() ? 'display:none' : ''}">
        <button class="ghost-btn mono" id="force-tick" title="Force an engine tick">${svgIcon('refresh', { size: 11 })} TICK</button>
        <span class="sim-label mono">SCENARIO:</span>
        <button class="sim-btn severe" id="sim-toggle">⚠ SEVERE EVENT ACTIVE</button>
      </div>
    </nav>
    <section class="location-bar" id="location-bar" style="${isLive() ? '' : 'display:none'}">
      <div class="loc-current">
        <span class="loc-label mono">LOCATION</span>
        <b id="loc-name">${state.place ? escapeHTML([state.place.name, state.place.country].filter(Boolean).join(', ')) : 'No place selected'}</b>
        ${state.place ? `<span class="mono loc-coords">${Number(state.place.lat).toFixed(3)}, ${Number(state.place.lon).toFixed(3)}</span>` : ''}
      </div>
      <div class="loc-controls">
        <input class="mini-input loc-input" id="loc-input" type="search" placeholder="Search any place or lat, lon…" aria-label="Search location" autocomplete="off">
        <div class="suggest hidden loc-suggest" id="loc-suggest"></div>
        <button class="ghost-btn mono" id="loc-gps">📍 MY LOCATION</button>
        <button class="ghost-btn mono" id="loc-refresh" title="Fetch the latest forecast">↻ REFRESH</button>
        ${state.place ? `<a class="ghost-btn mono" href="/?lat=${state.place.lat}&lon=${state.place.lon}&name=${encodeURIComponent(state.place.name || '')}" target="_blank" rel="noopener">PUBLIC VIEW ↗</a>` : ''}
      </div>
    </section>
    <div class="scenario-banner mono" id="scenario-banner" style="${isLive() ? 'display:none' : ''}">🎓 TRAINING SCENARIO — Langtang / Trishuli basin, Nepal. Sensors, AI ensemble and villages below are <b>simulated</b> for exercise purposes. Switch to LIVE for real data anywhere.</div>

    <main id="main-content"><div class="boot-note mono">CONNECTING TO NOWCAST ENGINE…</div></main>
    ${tweaksPanelHTML()}
  `;
  startClock();
  bindChromeEvents();
  bindTweaksPanel();
}

function renderModeButton() {
  const btn = document.getElementById('sim-toggle');
  if (!btn) return;
  btn.className = `sim-btn ${storm() ? 'severe' : 'clear'}`;
  btn.textContent = storm() ? '⚠ SEVERE EVENT ACTIVE — CLICK TO STAND DOWN' : '● ALL CLEAR — CLICK TO SIMULATE EVENT';
  syncTweakControl('storm', storm());
}

function startClock() {
  const el = document.getElementById('clock-time');
  const sync = document.getElementById('clock-sync');
  const tick = () => {
    const now = new Date();
    const f = (n) => String(n).padStart(2, '0');
    el.textContent = `${f(now.getUTCHours())}:${f(now.getUTCMinutes())}:${f(now.getUTCSeconds())} UTC`;
    if (state.lastSync) sync.textContent = `KATHMANDU +05:45 · SYNC ${Math.round((Date.now() - state.lastSync) / 1000)}s`;
    // live-update relative timestamps
    document.querySelectorAll('[data-ts]').forEach(n => { n.textContent = relTime(n.dataset.ts); });
  };
  tick();
  setInterval(tick, 1000);
}

function bindChromeEvents() {
  root.querySelectorAll('.view-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      root.querySelectorAll('.view-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
      renderMain();
    });
  });
  root.querySelectorAll('[data-source]').forEach(btn => btn.addEventListener('click', () => setSource(btn.dataset.source)));
  document.getElementById('sim-toggle').addEventListener('click', () => toggleMode());
  bindLocationBar();
  document.getElementById('force-tick').addEventListener('click', async () => {
    try { await api.tick(); toast('Engine tick complete', 'ok'); await refresh(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

async function toggleMode() {
  const next = storm() ? 'clear' : 'severe';
  const btn = document.getElementById('sim-toggle');
  btn.disabled = true;
  try {
    await api.setMode(next);
    toast(next === 'severe' ? 'Severe event scenario started' : 'All clear issued — engine alerts resolved', next === 'severe' ? 'warn' : 'ok');
    await refresh({ full: true });
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; }
}

function setSource(src) {
  if (src === state.source) return;
  state.source = src;
  localStorage.setItem('resilinet.console.source', src);
  root.querySelectorAll('[data-source]').forEach(b => b.classList.toggle('active', b.dataset.source === src));
  document.getElementById('scenario-controls').style.display = isLive() ? 'none' : '';
  document.getElementById('location-bar').style.display = isLive() ? '' : 'none';
  document.getElementById('scenario-banner').style.display = isLive() ? 'none' : '';
  if (isLive() && !state.place) toast('Pick a location to load live data', 'warn');
  refresh({ full: true });
}

async function selectPlace(p) {
  state.place = p; state.live = null;
  const nameEl = document.getElementById('loc-name');
  if (nameEl) nameEl.textContent = [p.name, p.country].filter(Boolean).join(', ');
  toast(`Loading live data for ${p.name}…`, 'info', 1500);
  await refresh({ full: true, forceLive: false });
  renderChromeLocation();
}

function renderChromeLocation() {
  const p = state.place; if (!p) return;
  const nameEl = document.getElementById('loc-name');
  if (nameEl) nameEl.textContent = [p.name, p.country].filter(Boolean).join(', ');
  const c = document.querySelector('.loc-coords'); if (c) c.textContent = `${Number(p.lat).toFixed(3)}, ${Number(p.lon).toFixed(3)}`;
}

function bindLocationBar() {
  const input = document.getElementById('loc-input'); const sug = document.getElementById('loc-suggest');
  if (!input) return;
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t); const q = input.value.trim();
    if (q.length < 2) { sug.classList.add('hidden'); return; }
    t = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/places/search?q=${encodeURIComponent(q)}`)).json();
        sug.innerHTML = j.results.length ? j.results.map((r, i) => `<button type="button" data-i="${i}"><span>${escapeHTML(r.name)}</span><small>${escapeHTML([r.region, r.country].filter(Boolean).join(', '))}</small></button>`).join('') : '<button type="button" disabled>No places found</button>';
        sug.classList.remove('hidden');
        sug.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { sug.classList.add('hidden'); input.value = ''; selectPlace(j.results[Number(b.dataset.i)]); }));
      } catch (e) { toast(e.message, 'err'); }
    }, 280);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sug.querySelector('[data-i]')?.click(); if (e.key === 'Escape') sug.classList.add('hidden'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.loc-controls')) sug.classList.add('hidden'); });
  document.getElementById('loc-gps').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation not supported — type a place instead', 'warn'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try { const j = await (await fetch(`/api/places/reverse?lat=${lat}&lon=${lon}`)).json(); selectPlace({ ...j.place, lat, lon }); }
      catch { selectPlace({ name: 'My location', lat, lon }); }
    }, () => toast('Could not get your location — type a place instead', 'warn'), { timeout: 12000 });
  });
  document.getElementById('loc-refresh').addEventListener('click', () => refresh({ full: false, forceLive: true }).then(() => toast('Live data refreshed', 'ok')));
}

// ================= main region =================
function renderMain() {
  const el = document.getElementById('main-content');
  radarCtl && radarCtl.destroy();
  hazardCtl && hazardCtl.destroy();
  radarCtl = null; hazardCtl = null;
  if (liveMap) { liveMap.destroy(); liveMap = null; }

  if (isLive()) { renderLive(el); return; }

  if (state.view === 'operator') {
    el.innerHTML = operatorConsoleHTML();
    mountOperatorConsole();
  } else if (state.view === 'zones') {
    el.innerHTML = `<div class="zones-grid">
      <div class="col">${villageTableHTML(state.villages)}${nowcastDetailHTML()}</div>
      <div class="col">${auditPanelHTML(state.audit)}${dispatchHistoryHTML()}</div>
    </div>`;
    bindVillageTable();
  } else {
    el.innerHTML = citizenViewHTML(storm(), citizenContext());
  }
}

// Update data-bound panels in place (no canvas remount) after a poll.
function patchMain() {
  if (isLive()) { patchLive(); return; }
  if (state.view === 'operator') {
    setHTML('fusion-panel', dataFusionPanelHTML(state.sensors, state.kpis));
    setHTML('ai-panel', aiEnginePanelHTML(state.models, state.ensemble, state.hazards));
    setHTML('kpi-strip', kpiStripHTML(state.kpis, state.mode));
    setHTML('village-strip', villageStripHTML());
    renderAlerts();
    renderDispatch();
    const title = document.getElementById('hazard-title');
    if (title) title.textContent = hazardTitle();
    const readout = document.getElementById('scrubber-readout');
    if (readout) readout.textContent = timelineReadout(state.timeline, state.t);
    hazardCtl && hazardCtl.update({ villages: state.villages });
  } else if (state.view === 'zones') {
    renderMain();
  } else {
    renderMain();
  }
}

function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }

// ---------- LIVE mode ----------
function renderLive(el) {
  if (!state.place) {
    el.innerHTML = `<section class="panel" style="margin:16px"><div class="panel-body" style="align-items:center;text-align:center;padding:40px 16px;gap:14px">
      <div style="font-size:40px">🌍</div><div style="font-size:18px;font-weight:600">Choose any location on Earth</div>
      <div style="color:var(--ink-dim);max-width:520px">Type a town, city or village in the location bar above — or press <b>MY LOCATION</b>. The console will load the real forecast, river model and rain radar for that place.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${[['Kathmandu',27.71,85.32,'Nepal'],['Mumbai',19.07,72.88,'India'],['Dhaka',23.81,90.41,'Bangladesh'],['Manila',14.6,120.98,'Philippines'],['Lagos',6.45,3.39,'Nigeria'],['Miami',25.76,-80.19,'United States']].map(([n,la,lo,c]) => `<button class="ghost-btn mono" data-quick='${JSON.stringify({name:n,lat:la,lon:lo,country:c})}'>${n}</button>`).join('')}</div>
    </div></section>`;
    el.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => selectPlace(JSON.parse(b.dataset.quick))));
    return;
  }
  if (!state.live) { el.innerHTML = `<div class="boot-note mono">LOADING LIVE DATA FOR ${escapeHTML((state.place.name || '').toUpperCase())}…</div>`; return; }
  if (state.view === 'citizen') { el.innerHTML = liveCitizenHTML(); return; }
  if (state.view === 'zones') {
    el.innerHTML = `<div class="zones-grid"><div class="col">${liveDaysHTML(state.live)}${liveAlertsHTML(state.liveAlerts, state.liveReports)}</div><div class="col">${auditPanelHTML(state.audit)}${dispatchHistoryHTML()}</div></div>`;
    return;
  }
  const a = state.live;
  el.innerHTML = `
    <div class="operator-grid live-grid">
      <div class="col">
        <div id="live-sources">${liveSourcesHTML(a)}</div>
        <div id="live-hazards">${liveHazardsHTML(a)}</div>
      </div>
      <div class="col">
        <div id="live-kpi">${liveKpiHTML(a, state.liveAlerts.length)}</div>
        <section class="viz-card" id="live-map-card">
          <div class="viz-head"><div><div class="viz-label">LIVE RAIN RADAR · ${escapeHTML((a.place.name || '').toUpperCase())}</div><div class="viz-title" id="live-title">${escapeHTML(a.headline)}</div></div>
            <span class="mono" style="font-size:10px;color:${RISK_COLOR[a.risk]}">● ${a.status}</span></div>
          <div class="live-map-wrap"><div id="live-map"></div></div>
          <div class="viz-foot"><span>${Number(a.place.lat).toFixed(4)}° ${Number(a.place.lon).toFixed(4)}° · ELEV ${Math.round(a.place.elevation_m ?? 0)} m</span><span>RADAR © RAINVIEWER · MAP © OSM</span></div>
        </section>
        <div id="live-timeline">${liveTimelineHTML(a)}</div>
        <div id="live-days">${liveDaysHTML(a)}</div>
      </div>
      <div class="col">
        <div id="live-alerts">${liveAlertsHTML(state.liveAlerts, state.liveReports)}</div>
        <div id="dispatch-panel"></div>
      </div>
    </div>`;
  renderDispatch();
  const mapEl = document.getElementById('live-map');
  liveMap = mountRadarMap(mapEl, { lat: a.place.lat, lon: a.place.lon, zoom: 8 });
  liveMap.setPlace(a.place.lat, a.place.lon, a.risk, a.place.name);
  liveMap.setReports(state.liveReports);
  setTimeout(() => liveMap && liveMap.invalidate(), 200);
}

function patchLive() {
  const a = state.live; if (!a) { renderMain(); return; }
  if (state.view !== 'operator' || !document.getElementById('live-kpi')) { renderMain(); return; }
  setHTML('live-sources', liveSourcesHTML(a)); setHTML('live-hazards', liveHazardsHTML(a)); setHTML('live-kpi', liveKpiHTML(a, state.liveAlerts.length));
  setHTML('live-timeline', liveTimelineHTML(a)); setHTML('live-days', liveDaysHTML(a)); setHTML('live-alerts', liveAlertsHTML(state.liveAlerts, state.liveReports));
  const t = document.getElementById('live-title'); if (t) t.textContent = a.headline;
  liveMap && liveMap.setPlace(a.place.lat, a.place.lon, a.risk, a.place.name); liveMap && liveMap.setReports(state.liveReports);
  renderDispatch();
}

function liveCitizenHTML() {
  const a = state.live;
  const danger = a.status === 'DANGER' || a.status === 'WARNING';
  const ctx = { village: { name: a.place.name, slug: '', safe_zone: 'the nearest high ground', river: 'local rivers and streams', fm_channel: 'local emergency radio' }, alert: danger ? { title: a.headline, hazard: a.hazards.flood.level !== 'GREEN' ? 'FLOOD' : 'CONVECTION', eta_minutes: a.peak.minutes_until ?? 30, created_at: a.fetched_at } : null, conditions: { rain_rate: a.current.precipitation_mm, wind_gust: a.current.gust_kmh }, kpis: { population_at_risk: a.place.population || 0 }, reach: 0 };
  return `<div class="demo-banner" style="margin:16px 16px 0">🌍 <span>This is what a citizen in <b>${escapeHTML(a.place.name)}</b> sees right now, based on the real forecast.</span><a href="/?lat=${a.place.lat}&lon=${a.place.lon}&name=${encodeURIComponent(a.place.name)}" target="_blank" rel="noopener">Open the full public page →</a></div>` + citizenViewHTML(danger, ctx);
}

function hazardTitle() {
  const v = state.hazards?.verdict;
  if (v === 'SEVERE CONVECTION') return '⚠ Severe convection · SW quadrant';
  if (v === 'ELEVATED') return 'Elevated · cells developing';
  return 'Nominal · monitoring';
}

function operatorConsoleHTML() {
  return `
    <div class="operator-grid">
      <div class="col">
        <div id="fusion-panel"></div>
        <div id="ai-panel"></div>
      </div>
      <div class="col">
        <div id="kpi-strip"></div>
        <div class="viz-row">
          <section class="viz-card" id="radar-card">
            <div class="viz-head">
              <div>
                <div class="viz-label">DOPPLER RADAR</div>
                <div class="viz-title">KTM-01 · Elev 0.5° · 120km</div>
              </div>
              <span class="viz-status mono">● SWEEPING</span>
            </div>
            <div class="viz-body">
              <div id="radar-canvas-mount"></div>
              <div id="radar-legend"></div>
            </div>
            <div class="viz-foot">
              <span>SITE: 27.7172°N 85.3240°E</span>
              <span>VCP-215 · PRF 1014Hz</span>
            </div>
          </section>
          <section class="viz-card" id="hazard-card">
            <div class="viz-head">
              <div>
                <div class="viz-label">HAZARD MAP · LANGTANG REGION</div>
                <div class="viz-title" id="hazard-title">${hazardTitle()}</div>
              </div>
              <div class="layer-chips" id="layer-chips">${layerChipsHTML()}</div>
            </div>
            <div id="hazard-canvas-mount"></div>
          </section>
        </div>
        <div id="scrubber-mount"></div>
        <div id="village-strip"></div>
      </div>
      <div class="col">
        <div id="alerts-panel"></div>
        <div id="dispatch-panel"></div>
      </div>
    </div>`;
}

function layerChipsHTML() {
  return [['rain', 'RAIN'], ['lightning', 'LTN'], ['flood', 'FLOOD'], ['wind', 'WIND']]
    .map(([k, l]) => `<button class="layer-chip ${state.layers[k] ? 'on' : 'off'}" data-layer="${k}">${l}</button>`).join('');
}

function mountOperatorConsole() {
  setHTML('fusion-panel', dataFusionPanelHTML(state.sensors, state.kpis));
  setHTML('ai-panel', aiEnginePanelHTML(state.models, state.ensemble, state.hazards));
  setHTML('kpi-strip', kpiStripHTML(state.kpis, state.mode));
  setHTML('radar-legend', reflectivityLegendHTML());
  setHTML('village-strip', villageStripHTML());

  radarCtl = mountRadarCanvas(document.getElementById('radar-canvas-mount'), {
    storm: storm(), playing: state.playing, timeOffset: state.t * 3,
    showRings: state.showRings, showTerrain: state.showTerrain, size: 320,
  });
  hazardCtl = mountHazardMap(document.getElementById('hazard-canvas-mount'), {
    storm: storm(), timeOffset: state.t, playing: state.playing, layers: state.layers,
    villages: state.villages, W: 340, H: 320,
  });

  renderAlerts();
  renderDispatch();
  setHTML('scrubber-mount', scrubberHTML(state.t, state.playing, state.mode, state.timeline));
  bindScrubber();
  bindLayerChips();
}

// ---------- alerts ----------
function renderAlerts() {
  const panel = document.getElementById('alerts-panel');
  if (!panel) return;
  const composeOpen = panel.querySelector('#alert-compose:not(.hidden)');
  const draft = composeOpen ? Object.fromEntries(new FormData(composeOpen).entries()) : null;
  panel.innerHTML = alertsPanelHTML(state.alerts, state.mode, state.alertFilter);
  // village options
  const sel = panel.querySelector('#compose-village');
  state.villages.forEach(v => {
    const o = document.createElement('option'); o.value = v.slug; o.textContent = v.name.toUpperCase(); sel.appendChild(o);
  });
  const form = panel.querySelector('#alert-compose');
  if (draft) {
    form.classList.remove('hidden');
    for (const [k, v] of Object.entries(draft)) { const f = form.elements[k]; if (f) f.value = v; }
  }
  panel.querySelector('#alerts-filter').addEventListener('change', async (e) => {
    state.alertFilter = e.target.value;
    try { state.alerts = (await api.alerts(state.alertFilter)).alerts; renderAlerts(); } catch (err) { toast(err.message, 'err'); }
  });
  panel.querySelector('#alert-compose-toggle').addEventListener('click', () => { form.classList.toggle('hidden'); form.elements.title.focus(); });
  panel.querySelector('#alert-compose-cancel').addEventListener('click', () => { form.classList.add('hidden'); form.reset(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    if (!payload.eta_minutes) delete payload.eta_minutes;
    try {
      await api.createAlert(payload);
      toast('Manual alert raised', 'warn');
      form.reset(); form.classList.add('hidden');
      await refresh();
    } catch (err) { toast(err.message, 'err'); }
  });
  panel.querySelectorAll('[data-alert-act]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.alertId);
      btn.disabled = true;
      try {
        if (btn.dataset.alertAct === 'ack') { await api.ackAlert(id); toast(`Alert #${id} acknowledged`, 'ok'); }
        else { await api.resolveAlert(id); toast(`Alert #${id} resolved`, 'ok'); }
        await refresh();
      } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
    });
  });
}

// ---------- dispatch ----------
function renderDispatch() {
  const panel = document.getElementById('dispatch-panel');
  if (!panel) return;
  let channels = state.channels, mode = state.mode;
  if (isLive()) { const armed = !!state.live && (state.live.status === 'DANGER' || state.live.status === 'WARNING'); channels = state.channels.map(c => ({ ...c, armed })); mode = armed ? 'severe' : 'clear'; }
  panel.innerHTML = dispatchConsoleHTML(channels, state.dispatches, mode);
  panel.querySelectorAll('[data-dispatch-id]').forEach(btn => {
    btn.addEventListener('click', () => sendDispatch([btn.dataset.dispatchId], btn));
  });
  const all = panel.querySelector('#dispatch-all');
  all && all.addEventListener('click', () => sendDispatch(state.channels.map(c => c.id), all));
}

async function sendDispatch(channelIds, btn) {
  if (isLive()) {
    const a = state.live;
    if (!a || (a.status !== 'DANGER' && a.status !== 'WARNING')) { toast('Channels are in STANDBY — live risk is below WARNING for this place', 'warn'); return; }
    btn.disabled = true; const prev = btn.textContent; btn.textContent = 'SENDING…';
    try {
      // record an operator alert for this real place, then dispatch on top of it (scenario engine must be armed)
      let total = 0;
      for (const ch of channelIds) {
        const r = await fetch('/api/dispatch', { method: 'POST', headers: { 'content-type': 'application/json', 'x-operator': operatorId() }, body: JSON.stringify({ channel: ch, message: `⚠ ${a.status}: ${a.headline}. ${a.advice[0]?.title || 'Stay safe.'} (ResiliNet live)`, live: true }) });
        const j = await r.json(); if (!r.ok || j.ok === false) throw new Error(j.error);
        total += j.dispatch.reach;
      }
      toast(`Simulated dispatch on ${channelIds.length} channel(s) · ~${total.toLocaleString()} reach`, 'ok');
      await refresh();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = prev; }
    return;
  }
  if (!storm()) { toast('Channels are in STANDBY — no severe event active', 'warn'); return; }
  btn.disabled = true;
  const prev = btn.textContent; btn.textContent = 'SENDING…';
  try {
    const primary = state.alerts.find(a => a.status === 'active');
    let totalReach = 0;
    for (const ch of channelIds) {
      const r = await api.dispatch(ch, primary?.id);
      totalReach += r.dispatch.reach;
    }
    toast(`Dispatched on ${channelIds.length} channel${channelIds.length > 1 ? 's' : ''} · ~${totalReach.toLocaleString('en-IN')} reached`, 'ok');
    await refresh();
  } catch (e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = prev;
  }
}

// ---------- scrubber / layers ----------
function bindScrubber() {
  const playBtn = document.getElementById('scrubber-play');
  const input = document.getElementById('scrubber-input');
  playBtn.addEventListener('click', () => {
    state.playing = !state.playing;
    syncTweakControl('playing', state.playing);
    updateScrubberUI();
    radarCtl && radarCtl.update({ playing: state.playing });
    hazardCtl && hazardCtl.update({ playing: state.playing });
  });
  input.addEventListener('input', (e) => {
    state.t = Number(e.target.value);
    updateScrubberUI();
    radarCtl && radarCtl.update({ timeOffset: state.t * 3 });
    hazardCtl && hazardCtl.update({ timeOffset: state.t });
  });
}

function updateScrubberUI() {
  const playBtn = document.getElementById('scrubber-play');
  if (!playBtn) return;
  playBtn.className = `play-btn ${state.playing ? 'playing' : ''}`;
  playBtn.innerHTML = svgIcon(state.playing ? 'pause' : 'play', { size: 14, stroke: 'currentColor' });
  document.getElementById('scrubber-value-text').textContent = scrubberValueText(state.t);
  document.getElementById('scrubber-readout').textContent = timelineReadout(state.timeline, state.t);
}

function bindLayerChips() {
  document.getElementById('layer-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-layer]');
    if (!chip) return;
    const k = chip.dataset.layer;
    state.layers[k] = !state.layers[k];
    hazardCtl && hazardCtl.update({ layers: state.layers });
    refreshLayerChips();
    syncTweakControl('layer' + k[0].toUpperCase() + k.slice(1), state.layers[k]);
  });
}

function refreshLayerChips() {
  const el = document.getElementById('layer-chips');
  if (el) el.innerHTML = layerChipsHTML();
}

function villageStripHTML() {
  const RC = { RED: '#ff2d55', AMBER: '#ffb347', YELLOW: '#ffea55', GREEN: '#7cf9c8' };
  const cells = state.villages.map(v => `
    <a class="vs-cell" href="/?demo=${v.slug}" target="_blank" rel="noopener" title="Open citizen page for ${escapeHTML(v.name)}">
      <div class="vs-top"><span class="risk-dot" style="background:${RC[v.risk]};box-shadow:0 0 8px ${RC[v.risk]}"></span><span class="vs-name">${escapeHTML(v.name)}</span></div>
      <div class="vs-risk mono" style="color:${RC[v.risk]}">${v.risk}${v.risk_override ? ' · OVR' : ''}</div>
      <div class="vs-meta mono">${Number(v.population).toLocaleString('en-IN')} ppl · ${v.active_alerts || 0} alerts</div>
    </a>`).join('');
  return `<div class="village-strip">${cells}</div>`;
}

// ---------- zones view ----------
function bindVillageTable() {
  document.querySelectorAll('[data-override]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const slug = sel.dataset.override;
      try {
        await api.overrideVillage(slug, sel.value || null);
        toast(sel.value ? `${slug} forced to ${sel.value}` : `${slug} back to AUTO`, 'ok');
        await refresh({ full: true });
      } catch (e) { toast(e.message, 'err'); }
    });
  });
}

function nowcastDetailHTML() {
  const o = state.observation || {}; const h = state.hazards || {};
  const pct = (x) => `${Math.round((x || 0) * 100)}%`;
  const bar = (label, v, color) => `
    <div class="hz-row"><span class="hz-label">${label}</span>
      <div class="hz-bar"><div class="hz-fill" style="width:${pct(v)};background:${color}"></div></div>
      <span class="hz-val mono">${pct(v)}</span></div>`;
  const obs = [
    ['RAIN RATE', `${o.rain_rate ?? '—'} mm/hr`], ['STREAM LEVEL', `${o.stream_level ?? '—'} m`],
    ['CG STRIKES', `${o.strikes ?? '—'} /5min`], ['WIND GUST', `${o.wind_gust ?? '—'} km/h`],
    ['MAX REFLECTIVITY', `${o.max_dbz ?? '—'} dBZ`], ['HUMIDITY', `${o.humidity ?? '—'} %`],
  ].map(([l, v]) => `<div class="obs-cell"><div class="kpi-label">${l}</div><div class="obs-val mono">${v}</div></div>`).join('');
  return `<section class="panel"><header class="panel-head"><div class="panel-head-left"><span class="panel-tag">FUSED</span><span class="panel-title">CURRENT OBSERVATION & HAZARD PROBABILITIES</span></div>
    <span class="mono" style="font-size:10px;color:var(--ink-mute)">${state.ensemble?.created_at ? 'RUN ' + relTime(state.ensemble.created_at) : ''}</span></header>
    <div class="panel-body">
      <div class="obs-grid">${obs}</div>
      <div class="panel-footer">
        ${bar('FLASH FLOOD', h.flood_prob, 'var(--danger)')}
        ${bar('CONVECTION', h.convection_prob, 'var(--warn)')}
        ${bar('LIGHTNING', h.lightning_prob, 'var(--violet)')}
        ${bar('HIGH WIND', h.wind_prob, 'var(--accent-2)')}
      </div>
    </div></section>`;
}

function dispatchHistoryHTML() {
  const rows = state.dispatches.map(d => `
    <div class="dispatch-log-row wide">
      <span class="dl-chan mono">${d.channel.toUpperCase()}</span>
      <span class="dl-msg" title="${escapeHTML(d.message)}">${escapeHTML(d.message)}</span>
      <span class="dl-reach mono">${Number(d.reach).toLocaleString('en-IN')}</span>
      <span class="dl-op mono">${escapeHTML(d.operator)}</span>
      <span class="dl-time mono" data-ts="${d.created_at}">${relTime(d.created_at)}</span>
    </div>`).join('') || `<div class="empty-note mono">NO DISPATCHES YET</div>`;
  return `<section class="panel"><header class="panel-head"><div class="panel-head-left"><span class="panel-tag">SENT</span><span class="panel-title">DISPATCH HISTORY</span></div></header>
    <div class="panel-body"><div class="dispatch-log">${rows}</div></div></section>`;
}

// ---------- citizen embed ----------
function citizenContext() {
  const red = state.villages.find(v => v.risk === 'RED') || state.villages[0];
  const primary = state.alerts.find(a => a.status === 'active' && a.eta_minutes != null) || state.alerts[0];
  return {
    village: red, alert: primary, kpis: state.kpis,
    conditions: state.observation, reach: state.dispatches.reduce((s, d) => s + Number(d.reach || 0), 0),
  };
}

// ================= tweaks drawer =================
function tweaksPanelHTML() {
  return `
    <aside class="twk-panel" id="tweaks-panel">
      <div class="twk-head"><b>Tweaks</b><button id="tweaks-close" class="twk-x" aria-label="Close">✕</button></div>
      <div class="twk-body">
        ${tweakSection('Simulation', [tweakToggle('storm', 'Severe event active', storm()), tweakToggle('playing', 'Animation playing', state.playing)])}
        ${tweakSection('Radar', [tweakToggle('showRings', 'Range rings', state.showRings), tweakToggle('showTerrain', 'Terrain overlay', state.showTerrain)])}
        ${tweakSection('Hazard Layers', [
          tweakToggle('layerRain', 'Rainfall / reflectivity', state.layers.rain),
          tweakToggle('layerLightning', 'Lightning strikes', state.layers.lightning),
          tweakToggle('layerFlood', 'Flood risk basin', state.layers.flood),
          tweakToggle('layerWind', 'Wind vectors', state.layers.wind),
        ])}
      </div>
    </aside>
    <button id="tweaks-open" class="twk-fab" title="Open tweaks" style="display:none">${svgIcon('layers', { size: 16 })}</button>`;
}
function tweakSection(label, rows) { return `<div class="twk-section">${label}</div>${rows.join('')}`; }
function tweakToggle(key, label, value) {
  return `<div class="twk-row"><span>${label}</span>
    <button type="button" class="twk-toggle ${value ? 'on' : ''}" data-tweak-key="${key}" aria-pressed="${value}"><i></i></button></div>`;
}
function bindTweaksPanel() {
  const panel = document.getElementById('tweaks-panel');
  const openBtn = document.getElementById('tweaks-open');
  panel.style.display = 'none'; openBtn.style.display = 'grid'; // start collapsed
  document.getElementById('tweaks-close').addEventListener('click', () => { panel.style.display = 'none'; openBtn.style.display = 'grid'; });
  openBtn.addEventListener('click', () => { panel.style.display = 'flex'; openBtn.style.display = 'none'; });
  panel.querySelectorAll('.twk-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const on = !btn.classList.contains('on');
      btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on);
      applyTweak(btn.dataset.tweakKey, on);
    });
  });
}
function syncTweakControl(key, value) {
  const btn = document.querySelector(`.twk-toggle[data-tweak-key="${key}"]`);
  if (btn) { btn.classList.toggle('on', value); btn.setAttribute('aria-pressed', value); }
}
function applyTweak(key, value) {
  if (key === 'storm') { if (value !== storm()) toggleMode(); return; }
  if (key === 'playing') {
    state.playing = value; updateScrubberUI();
    radarCtl && radarCtl.update({ playing: value }); hazardCtl && hazardCtl.update({ playing: value }); return;
  }
  if (key === 'showRings') { state.showRings = value; radarCtl && radarCtl.update({ showRings: value }); return; }
  if (key === 'showTerrain') { state.showTerrain = value; radarCtl && radarCtl.update({ showTerrain: value }); return; }
  if (key.startsWith('layer')) {
    const k = key.slice(5).toLowerCase();
    state.layers[k] = value;
    hazardCtl && hazardCtl.update({ layers: state.layers });
    refreshLayerChips();
  }
}

// ================= boot =================
renderChrome();
refresh({ full: true }).then(() => startPolling());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
