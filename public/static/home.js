// "My Weather" — public home page. Works for any place on Earth.
// Search / GPS → /api/live → plain-language status card, advice, real radar map, timeline, reports.

import { escapeHTML, relTime, toast } from './api.js';
import { mountRadarMap, RISK_COLOR, REPORT_ICON } from './radar-map.js';

const root = document.getElementById('home-app');
const SAVED_KEY = 'resilinet.saved';
const LAST_KEY = 'resilinet.last';
const REFRESH_MS = 5 * 60_000;

const state = { place: null, a: null, reports: [], saved: loadSaved(), loading: false, map: null, demo: null };

const WX_ICON = (code, isDay = 1) => {
  if (code === 0) return isDay ? '☀️' : '🌙';
  if (code <= 2) return isDay ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '🌨️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '🌨️';
  return '⛈️';
};
const STATUS_TEXT = { SAFE: 'SAFE', WATCH: 'WATCH', WARNING: 'WARNING', DANGER: 'DANGER' };
const STATUS_PLAIN = { SAFE: 'No severe weather expected', WATCH: 'Keep an eye on the weather', WARNING: 'Get ready — bad weather is likely', DANGER: 'Take action now' };

function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved.slice(0, 8))); }
const placeKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
const isSaved = (p) => !!p && state.saved.some(s => placeKey(s) === placeKey(p));
const placeLabel = (p) => [p.name, p.region, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

async function fetchJSON(url, opts) {
  const res = await fetch(url, opts);
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

// ================= data =================
async function selectPlace(p, { pushUrl = true } = {}) {
  state.place = p; state.loading = true;
  localStorage.setItem(LAST_KEY, JSON.stringify(p));
  if (pushUrl) history.replaceState(null, '', `/?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}&name=${encodeURIComponent(p.name)}`);
  render();
  try {
    const q = new URLSearchParams({ lat: p.lat, lon: p.lon, name: p.name || '' });
    if (p.region) q.set('region', p.region);
    if (p.country) q.set('country', p.country);
    if (p.country_code) q.set('cc', p.country_code);
    const j = await fetchJSON(`/api/live?${q}`);
    state.a = j.assessment; state.reports = j.reports || [];
    state.place = { ...p, ...state.a.place, name: p.name || state.a.place.name };
  } catch (e) {
    state.a = null; toast(e.message, 'err', 5000);
  } finally {
    state.loading = false; render();
  }
}

async function refresh(force = false) {
  if (!state.place || state.loading) return;
  try {
    const p = state.place;
    const q = new URLSearchParams({ lat: p.lat, lon: p.lon, name: p.name || '' });
    if (force) q.set('refresh', '1');
    const j = await fetchJSON(`/api/live?${q}`);
    state.a = j.assessment; state.reports = j.reports || [];
    render();
    if (force) toast('Updated with the latest forecast', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function useMyLocation() {
  if (!navigator.geolocation) { toast('Your browser does not support location. Please type your place instead.', 'warn'); return; }
  const btn = document.getElementById('gps-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Finding you…'; }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    try {
      const j = await fetchJSON(`/api/places/reverse?lat=${lat}&lon=${lon}`);
      await selectPlace({ ...j.place, lat, lon });
    } catch { await selectPlace({ name: 'My location', lat, lon }); }
  }, (err) => {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Use my location'; }
    toast(err.code === 1 ? 'Location permission was denied. You can type your town instead.' : 'Could not get your location. Please type your town instead.', 'warn', 5000);
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}

// ================= render =================
function render() {
  const a = state.a, p = state.place;
  const st = a?.status;
  document.body.classList.toggle('is-danger', st === 'DANGER');
  document.body.classList.toggle('is-warning', st === 'WARNING');
  document.title = a ? `${st === 'DANGER' ? '🚨 ' : ''}${a.place.name}: ${STATUS_TEXT[st]} — ResiliNet` : 'ResiliNet — Is severe weather coming to my area?';

  const parts = [searchCardHTML()];
  if (state.demo) parts.push(demoBannerHTML());
  if (!p) parts.push(welcomeHTML());
  else if (state.loading && !a) parts.push(`<section class="card span-2"><div class="boot-note mono">CHECKING THE SKIES OVER ${escapeHTML((p.name || '').toUpperCase())}…</div></section>`);
  else if (!a) parts.push(`<section class="card span-2"><h2>Could not load the forecast</h2><p>Please check your connection and <button class="big-btn" id="retry-btn">Try again</button></p></section>`);
  else parts.push(statusCardHTML(a), adviceHTML(a), mapCardHTML(), hazardsHTML(a), hoursHTML(a), daysHTML(a), reportsHTML(a), sourcesHTML(a));

  // detach the persistent map node before the DOM is replaced, re-attach after
  if (mapHost && mapHost.parentNode) mapHost.parentNode.removeChild(mapHost);
  root.innerHTML = parts.join('');
  bind();
  if (a) mountOrUpdateMap();
}

function searchCardHTML() {
  const saved = state.saved.map(s => `
    <button class="chip ${state.place && placeKey(s) === placeKey(state.place) ? 'active' : ''}" data-saved="${placeKey(s)}" title="${escapeHTML(placeLabel(s))}">
      <span class="dot" style="background:${RISK_COLOR[s.risk] || '#54606f'}"></span>${escapeHTML(s.name)}<span class="x" data-remove="${placeKey(s)}" aria-label="Remove ${escapeHTML(s.name)}">✕</span>
    </button>`).join('');
  return `
    <section class="card search-card span-2" id="search-card">
      <h2>Where are you? <span class="hint">Any town, city or village in the world</span></h2>
      <div class="search-row">
        <input class="search-input" id="place-input" type="search" placeholder="Type a place, e.g. Mumbai, Kathmandu, Lagos…" autocomplete="off" aria-label="Search for a place" value="">
        <button class="big-btn primary" id="gps-btn" type="button">📍 Use my location</button>
      </div>
      <div class="suggest hidden" id="suggest" role="listbox"></div>
      ${saved ? `<div class="saved-row" aria-label="Saved places"><span class="hint" style="align-self:center;color:var(--ink-mute);font-size:12px">⭐ Saved:</span>${saved}</div>` : ''}
    </section>`;
}

function demoBannerHTML() {
  return `<div class="demo-banner span-2">🎓 <span><b>Training scenario:</b> you opened a link from the Langtang flash-flood exercise. The status below is the <b>real</b> live forecast for ${escapeHTML(state.demo)}, Nepal.</span><a href="/console">Open the exercise console →</a></div>`;
}

function welcomeHTML() {
  return `
    <section class="card span-2" id="welcome">
      <h2>What this does</h2>
      <p style="margin:0;font-size:16px;line-height:1.55">ResiliNet checks the latest weather models and rain radar for <b>your exact location</b> and tells you in simple words whether <b>flooding, thunderstorms, heavy rain or strong winds</b> are coming — and what to do about it. Free, no sign-up, works anywhere on Earth.</p>
      <div class="status-now" style="margin-top:6px">
        <div><span>STEP 1</span><b style="font-family:inherit;font-size:13px">Pick your place</b></div>
        <div><span>STEP 2</span><b style="font-family:inherit;font-size:13px">Read the status</b></div>
        <div><span>STEP 3</span><b style="font-family:inherit;font-size:13px">Follow the advice</b></div>
        <div><span>STEP 4</span><b style="font-family:inherit;font-size:13px">Save &amp; share</b></div>
      </div>
      <div id="popular-mount"></div>
      <p class="src-note">Need more detail? Try the <a href="/console">Expert Console</a> or read the <a href="/help">Help page</a>.</p>
    </section>`;
}

function statusCardHTML(a) {
  const c = a.current;
  const peak = a.peak?.minutes_until != null && a.peak.rain_mm >= 2
    ? `<div class="countdown"><b>${a.peak.minutes_until <= 0 ? 'now' : a.peak.minutes_until + ' min'}</b><span>until heaviest rain (${a.peak.rain_mm} mm/h)</span></div>` : '';
  return `
    <section class="card status-card ${a.status} span-2" id="status-card" aria-live="polite">
      <div class="status-top">
        <div class="status-place">${escapeHTML(STATUS_PLAIN[a.status])}<b>${escapeHTML(placeLabel(a.place))}</b></div>
        <div class="status-badge">${STATUS_TEXT[a.status]}</div>
      </div>
      <h1 class="status-headline">${escapeHTML(a.headline)}</h1>
      <p class="status-summary">${escapeHTML(a.summary)}</p>
      ${peak}
      <div class="status-now">
        <div><span>NOW</span><b>${WX_ICON(c.weather_code, c.is_day)} ${Math.round(c.temperature_c)}°C</b></div>
        <div><span>RAIN</span><b>${c.precipitation_mm} mm</b></div>
        <div><span>WIND GUST</span><b>${Math.round(c.gust_kmh)} km/h</b></div>
        <div><span>HUMIDITY</span><b>${c.humidity_pct}%</b></div>
      </div>
      <div class="status-foot">
        <span>${escapeHTML(c.weather_text)} · updated ${relTime(a.fetched_at)} · local time ${c.time.slice(11, 16)}</span>
        <div class="status-actions">
          <button class="icon-btn ${isSaved(a.place) ? 'on' : ''}" id="save-btn">${isSaved(a.place) ? '⭐ Saved' : '☆ Save place'}</button>
          <button class="icon-btn" id="share-btn">🔗 Share</button>
          <button class="icon-btn" id="refresh-btn">↻ Refresh</button>
          <a class="icon-btn on" id="alerts-cta" href="/account?add=${encodeURIComponent(JSON.stringify({ name: a.place.name, region: a.place.region || '', country: a.place.country || '', lat: a.place.lat, lon: a.place.lon }))}">📱 Get SMS / call alerts here</a>
        </div>
      </div>
    </section>`;
}

function adviceHTML(a) {
  return `
    <section class="card" id="advice-card">
      <h2>What you should do</h2>
      ${a.advice.map(x => `<div class="advice"><div class="ic">${x.icon}</div><div><b>${escapeHTML(x.title)}</b><span>${escapeHTML(x.sub)}</span></div></div>`).join('')}
    </section>`;
}

function mapCardHTML() {
  return `
    <section class="card map-card" id="map-card">
      <h2>Live rain radar <span class="hint">Press ▶ to see the last 2 hours</span></h2>
      <div class="map-wrap"><div id="home-map" role="img" aria-label="Rain radar map around your location"></div></div>
      <div class="map-note">Coloured areas are rain seen by weather radar right now (blue = light, red/purple = very heavy). Your place is the marker; icons are reports from other people nearby.</div>
    </section>`;
}

function hazardsHTML(a) {
  const rows = [['flood', 'Flooding', a.hazards.flood, 'var(--danger)'], ['storm', 'Thunderstorm', a.hazards.storm, 'var(--warn)'], ['rain', 'Heavy rain', a.hazards.rain, 'var(--accent-2)'], ['wind', 'Strong wind', a.hazards.wind, 'var(--violet)']]
    .map(([k, label, h, color]) => `
      <div class="hz">
        <div>${label}<small>${escapeHTML(h.detail)}</small></div>
        <div class="bar"><div class="fill" style="width:${Math.round(h.prob * 100)}%;background:${color}"></div></div>
        <div class="lvl" style="color:${RISK_COLOR[h.level]}">${h.level}</div>
      </div>`).join('');
  return `<section class="card" id="hazards-card"><h2>Risk breakdown <span class="hint">next few hours</span></h2>${rows}</section>`;
}

function hoursHTML(a) {
  const cells = a.next_hours.map(h => `
    <div class="hour" title="${escapeHTML(h.text)}">
      <div class="t">${h.time.slice(11, 16)}</div>
      <div class="ic">${WX_ICON(h.code)}</div>
      <div class="r">${h.rain_mm > 0 ? h.rain_mm + ' mm' : 'dry'}</div>
      <div class="g">💨 ${h.gust_kmh}</div>
      <div class="lvl" style="background:${RISK_COLOR[h.risk]}"></div>
    </div>`).join('');
  return `<section class="card span-2" id="hours-card"><h2>Next 12 hours <span class="hint">rain per hour · wind gust km/h · colour = risk</span></h2><div class="hours">${cells}</div></section>`;
}

function daysHTML(a) {
  const rows = a.next_days.map(d => {
    const dt = new Date(d.date + 'T12:00:00');
    const name = dt.toLocaleDateString([], { weekday: 'short' });
    return `<div class="day"><div><div class="d">${name}</div><div class="m">${dt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</div></div>
      <div style="font-size:22px">${WX_ICON(d.code)}</div>
      <div>${escapeHTML(d.text)}<div class="m">${d.rain_mm} mm rain · ${d.prob_pct}% chance · gusts ${d.gust_kmh} km/h</div></div>
      <div style="text-align:right"><div class="tt">${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</div><span class="pill ${d.risk.toLowerCase()}">${d.risk}</span></div></div>`;
  }).join('');
  return `<section class="card" id="days-card"><h2>Next days</h2><div class="days">${rows}</div></section>`;
}

function reportsHTML(a) {
  const list = state.reports.length ? state.reports.map(r => `
    <div class="rep"><div class="ic">${REPORT_ICON[r.kind] || '📍'}</div><div><b>${escapeHTML(String(r.kind).replace('_', ' '))}</b> · ${escapeHTML(r.severity)}${r.note ? ` — ${escapeHTML(r.note)}` : ''}<small>${escapeHTML(r.place || '')} · ${relTime(r.created_at)}</small></div></div>`).join('')
    : `<div class="empty-note mono">NO REPORTS NEAR YOU IN THE LAST 12 HOURS</div>`;
  return `
    <section class="card" id="reports-card">
      <h2>What people nearby are seeing <span class="hint">within ~50 km</span></h2>
      ${list}
      <form class="rep-form" id="report-form">
        <select name="kind" aria-label="What are you seeing?">
          <option value="flood">🌊 Flooding</option><option value="heavy_rain">🌧️ Very heavy rain</option><option value="lightning">⚡ Lightning nearby</option>
          <option value="wind">💨 Damaging wind</option><option value="hail">🧊 Hail</option><option value="landslide">⛰️ Landslide</option><option value="all_clear">✅ All clear here</option><option value="other">📍 Something else</option>
        </select>
        <select name="severity" aria-label="How bad is it?"><option value="LOW">Minor</option><option value="MEDIUM" selected>Noticeable</option><option value="HIGH">Serious</option><option value="CRITICAL">Life-threatening</option></select>
        <input name="note" maxlength="200" placeholder="Optional: a few words (e.g. 'road under water near the bridge')">
        <button class="big-btn" type="submit">📣 Report what you see</button>
      </form>
    </section>`;
}

function sourcesHTML(a) {
  return `<section class="card span-2 src-note" id="sources-card">Data: ${escapeHTML(a.data_source)} · rain radar © RainViewer · map © OpenStreetMap. Risk levels are computed automatically by ResiliNet and are <b>not</b> an official warning — always follow your local authorities. <a href="/help">How it works</a> · <a href="/console?lat=${a.place.lat}&lon=${a.place.lon}&name=${encodeURIComponent(a.place.name)}">Open this place in the Expert Console</a></section>`;
}

// ================= map =================
let mapHost = null; // persistent DOM node holding the Leaflet map
function mountOrUpdateMap() {
  const mount = document.getElementById('home-map');
  if (!mount || !state.a) return;
  if (!mapHost) { mapHost = document.createElement('div'); mapHost.style.cssText = 'position:absolute;inset:0'; }
  mount.appendChild(mapHost);
  if (!state.map) state.map = mountRadarMap(mapHost, { lat: state.a.place.lat, lon: state.a.place.lon, zoom: 8 });
  state.map.setPlace(state.a.place.lat, state.a.place.lon, state.a.risk, state.a.place.name);
  state.map.setReports(state.reports);
  setTimeout(() => state.map && state.map.invalidate(), 150);
}

// ================= events =================
let suggestTimer = null;
function bind() {
  const input = document.getElementById('place-input');
  const sug = document.getElementById('suggest');
  input.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = input.value.trim();
    if (q.length < 2) { sug.classList.add('hidden'); return; }
    suggestTimer = setTimeout(async () => {
      try {
        const j = await fetchJSON(`/api/places/search?q=${encodeURIComponent(q)}`);
        if (!j.results.length) { sug.innerHTML = `<button type="button" disabled>No places found for “${escapeHTML(q)}”. Try a bigger town nearby, or coordinates like 28.16, 85.34</button>`; sug.classList.remove('hidden'); return; }
        sug.innerHTML = j.results.map((r, i) => `<button type="button" role="option" data-idx="${i}"><span>${escapeHTML(r.name)}</span><small>${escapeHTML([r.region, r.country].filter(Boolean).join(', '))}${r.population ? ` · pop. ${Number(r.population).toLocaleString()}` : ''}</small></button>`).join('');
        sug.classList.remove('hidden');
        sug.querySelectorAll('[data-idx]').forEach(b => b.addEventListener('click', () => { sug.classList.add('hidden'); input.value = ''; selectPlace(j.results[Number(b.dataset.idx)]); }));
      } catch (e) { toast(e.message, 'err'); }
    }, 280);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = sug.querySelector('[data-idx]'); if (first) first.click(); } if (e.key === 'Escape') sug.classList.add('hidden'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-card')) sug.classList.add('hidden'); }, { once: true });
  document.getElementById('gps-btn').addEventListener('click', useMyLocation);

  root.querySelectorAll('[data-saved]').forEach(b => b.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove]')) { state.saved = state.saved.filter(s => placeKey(s) !== b.dataset.saved); persistSaved(); render(); toast('Removed from saved places', 'ok'); return; }
    const s = state.saved.find(x => placeKey(x) === b.dataset.saved); if (s) selectPlace(s);
  }));

  const retry = document.getElementById('retry-btn'); retry && retry.addEventListener('click', () => selectPlace(state.place));
  const save = document.getElementById('save-btn');
  save && save.addEventListener('click', () => {
    const p = state.a.place;
    if (isSaved(p)) { state.saved = state.saved.filter(s => placeKey(s) !== placeKey(p)); toast('Removed from saved places', 'ok'); }
    else { state.saved.unshift({ name: p.name, region: p.region, country: p.country, lat: p.lat, lon: p.lon, risk: state.a.risk }); toast('Saved on this device', 'ok'); }
    persistSaved(); render();
  });
  const share = document.getElementById('share-btn');
  share && share.addEventListener('click', async () => {
    const url = location.href;
    const text = `${state.a.headline} — ${STATUS_TEXT[state.a.status]} (ResiliNet)`;
    try {
      if (navigator.share) await navigator.share({ title: 'ResiliNet', text, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied — send it to family and neighbours', 'ok'); }
    } catch { /* cancelled */ }
  });
  const rf = document.getElementById('refresh-btn'); rf && rf.addEventListener('click', () => refresh(true));

  const form = document.getElementById('report-form');
  form && form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form).entries());
    const btn = form.querySelector('button'); btn.disabled = true;
    try {
      await fetchJSON('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...fd, lat: state.a.place.lat, lon: state.a.place.lon, place: state.a.place.name }) });
      toast('Thank you — your report is now visible to people nearby', 'ok');
      await refresh();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  });

  // popular places on welcome
  const pop = document.getElementById('popular-mount');
  if (pop) fetchJSON('/api/popular').then(j => {
    if (!j.places.length) return;
    pop.innerHTML = `<div class="hint" style="margin-top:6px;color:var(--ink-mute);font-size:12px">Recently checked by others:</div><div class="saved-row">${j.places.map((p, i) => `<button class="chip" data-pop="${i}"><span class="dot" style="background:${RISK_COLOR[p.last_risk] || '#54606f'}"></span>${escapeHTML(p.name)}${p.country_code ? ` <small style="color:var(--ink-mute)">${escapeHTML(p.country_code)}</small>` : ''}</button>`).join('')}</div>`;
    pop.querySelectorAll('[data-pop]').forEach(b => b.addEventListener('click', () => selectPlace(j.places[Number(b.dataset.pop)])));
  }).catch(() => {});
}

// ================= boot =================
(async function boot() {
  const q = new URLSearchParams(location.search);
  render();
  const DEMO = { syabrubesi: { name: 'Syabrubesi', lat: 28.16, lon: 85.34 }, dhunche: { name: 'Dhunche', lat: 28.11, lon: 85.297 }, kalikasthan: { name: 'Kalikasthan', lat: 28.03, lon: 85.25 }, langtang: { name: 'Langtang', lat: 28.214, lon: 85.517 }, trishuli: { name: 'Trishuli', lat: 27.92, lon: 85.15 } };
  if (q.get('demo') && DEMO[q.get('demo')]) { const d = DEMO[q.get('demo')]; state.demo = d.name; await selectPlace({ ...d, region: 'Bagmati', country: 'Nepal', country_code: 'NP' }); return; }
  if (q.get('lat') && q.get('lon')) { await selectPlace({ name: q.get('name') || 'Selected location', lat: Number(q.get('lat')), lon: Number(q.get('lon')) }, { pushUrl: false }); return; }
  const last = localStorage.getItem(LAST_KEY);
  if (last) { try { await selectPlace(JSON.parse(last)); return; } catch { /* ignore */ } }
})();

setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);
setInterval(() => { document.querySelectorAll('[data-ts]').forEach(n => { n.textContent = relTime(n.dataset.ts); }); }, 30_000);
