// ResiliNet public site — AirCast-style layout, real data for any place.
import { escapeHTML, relTime } from './api.js';
import { mountRadarMap, REPORT_ICON } from './radar-map.js';

const root = document.getElementById('site-app');
const SAVED_KEY = 'resilinet.saved', LAST_KEY = 'resilinet.last';
const state = { place: null, a: null, reports: [], saved: loadSaved(), loading: false, map: null, user: null };
const RISK_COLOR = { GREEN: '#22c55e', YELLOW: '#eab308', AMBER: '#f97316', RED: '#ef4444' };
const STATUS_TEXT = { SAFE: 'Safe', WATCH: 'Watch', WARNING: 'Warning', DANGER: 'Danger' };

const ICON = (code, isDay = 1) => code === 0 ? (isDay ? '☀️' : '🌙') : code <= 2 ? (isDay ? '🌤️' : '☁️') : code === 3 ? '☁️' : code <= 48 ? '🌫️' : code <= 57 ? '🌦️' : code <= 67 ? '🌧️' : code <= 77 ? '🌨️' : code <= 82 ? '🌧️' : code <= 86 ? '🌨️' : '⛈️';

function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved.slice(0, 8))); }
const key = (p) => `${Number(p.lat).toFixed(2)},${Number(p.lon).toFixed(2)}`;
const isSaved = (p) => !!p && state.saved.some(s => key(s) === key(p));
const label = (p) => [p.name, p.region, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ');

export function toast(msg, kind = 'info', ms = 3200) {
  const host = document.getElementById('toast-host'); if (!host) return;
  const el = document.createElement('div'); el.className = `toast toast-${kind}`; el.textContent = msg; host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
async function get(url, opts) { const r = await fetch(url, opts); const j = await r.json().catch(() => ({})); if (!r.ok || j.ok === false) throw new Error(j.error || `Request failed (${r.status})`); return j; }

// ---------- data ----------
async function selectPlace(p, push = true) {
  state.place = p; state.loading = true;
  localStorage.setItem(LAST_KEY, JSON.stringify(p));
  if (push) history.replaceState(null, '', `/?lat=${Number(p.lat).toFixed(4)}&lon=${Number(p.lon).toFixed(4)}&name=${encodeURIComponent(p.name || '')}`);
  render();
  try {
    const q = new URLSearchParams({ lat: p.lat, lon: p.lon, name: p.name || '' });
    if (p.region) q.set('region', p.region); if (p.country) q.set('country', p.country);
    const j = await get(`/api/live?${q}`);
    state.a = j.assessment; state.reports = j.reports || [];
    state.place = { ...p, ...state.a.place, name: p.name || state.a.place.name };
  } catch (e) { state.a = null; toast(e.message, 'err', 5000); }
  finally { state.loading = false; render(); }
}
async function refresh(force = false) {
  if (!state.place || state.loading) return;
  try { const q = new URLSearchParams({ lat: state.place.lat, lon: state.place.lon, name: state.place.name || '' }); if (force) q.set('refresh', '1'); const j = await get(`/api/live?${q}`); state.a = j.assessment; state.reports = j.reports || []; render(); if (force) toast('Forecast updated', 'ok'); } catch (e) { toast(e.message, 'err'); }
}
function useGPS() {
  if (!navigator.geolocation) { toast('Location is not available in this browser — type your town instead.', 'warn'); return; }
  toast('Finding your location…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    try { const j = await get(`/api/places/reverse?lat=${lat}&lon=${lon}`); selectPlace({ ...j.place, lat, lon }); } catch { selectPlace({ name: 'My location', lat, lon }); }
  }, (err) => toast(err.code === 1 ? 'Location permission denied — type your town instead.' : 'Could not get your location — type your town instead.', 'warn', 5000), { timeout: 12000, maximumAge: 300000 });
}

// ---------- render ----------
function render() {
  const a = state.a;
  document.title = a ? `${a.place.name} weather — ResiliNet` : 'ResiliNet — Weather warnings for your town';
  root.innerHTML = heroHTML() + (a ? bodyHTML(a) : (state.place && state.loading ? `<div class="loading">Loading the forecast for ${escapeHTML(state.place.name || '')}…</div>` : welcomeHTML())) + ctaHTML();
  bind();
  if (a) mountMap();
}

function heroHTML() {
  const a = state.a, c = a?.current;
  const localTime = c ? new Date(c.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const left = a ? `
    <h1 class="hero-place">${escapeHTML(a.place.name)}<small>${escapeHTML([a.place.region, a.place.country, localTime].filter(Boolean).join(' · '))}</small></h1>
    <div class="hero-now">
      <div class="hero-temp"><span class="ico">${ICON(c.weather_code, c.is_day)}</span><span class="num">${Math.round(c.temperature_c)}</span><span class="deg">°</span></div>
      <div class="hero-sep"></div>
      <div class="hero-rain">Rain<b>🌧 ${Math.max(a.next_hours[0]?.prob_pct || 0, c.precipitation_mm > 0 ? 90 : 0)}%</b></div>
      <div class="hero-sep"></div>
      <div class="hero-rain">Wind<b>💨 ${Math.round(c.gust_kmh)} <span style="font-size:16px">km/h</span></b></div>
    </div>
    <span class="hero-badge"><i style="background:${RISK_COLOR[a.risk]}"></i>${STATUS_TEXT[a.status]} · ${escapeHTML(c.weather_text)}</span>
    <p class="hero-desc" style="margin-top:14px">${escapeHTML(a.headline)}</p>`
    : `<h1 class="hero-place">Know what the sky is about to do<small>Live rain, storm, flood and wind warnings for any town on Earth</small></h1>
       <p class="hero-desc">Type your town or use your location. We check the latest weather models and live radar and tell you plainly whether you need to do anything.</p>`;
  return `
  <header class="hero ${a ? 'risk-' + a.risk : ''}" id="hero">
    <div class="hero-in">
      <div>
        ${left}
        <div class="hero-search" id="hero-search">
          <input id="q" type="search" placeholder="Search a town, city or village…" autocomplete="off" aria-label="Search place">
          <button class="btn" id="gps">📍 My location</button>
          <div class="sugg hidden" id="sugg"></div>
        </div>
        ${state.saved.length ? `<div class="saved" style="margin-top:12px">${state.saved.map(s => `<span class="chip ${state.place && key(s) === key(state.place) ? 'on' : ''}" data-saved="${key(s)}" style="color:#fff;background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.3)"><i style="background:${RISK_COLOR[s.risk] || '#94a3b8'}"></i>${escapeHTML(s.name)}<span class="x" data-remove="${key(s)}">✕</span></span>`).join('')}</div>` : ''}
      </div>
      ${a ? hourCardsHTML(a) : ''}
    </div>
  </header>`;
}

function hourCardsHTML(a) {
  const now = a.current;
  const cards = [{ t: 'Now', code: now.weather_code, hi: Math.round(now.temperature_c), lo: null, feel: Math.round(now.temperature_c - (now.gust_kmh > 30 ? 1 : 0)), rain: now.precipitation_mm, risk: a.risk }];
  a.next_hours.slice(1, 3).forEach((h, i) => cards.push({ t: new Date(h.time).toLocaleTimeString([], { hour: 'numeric' }), code: h.code, hi: null, lo: null, rain: h.rain_mm, gust: h.gust_kmh, prob: h.prob_pct, risk: h.risk }));
  return `<div class="hours">${cards.map(c => `
    <div class="hcard">
      <div class="t">${c.t}</div>
      <div class="ico">${ICON(c.code, now.is_day)}</div>
      ${c.hi != null ? `<div class="hi">${c.hi}<sup>°</sup></div><div class="lo">Feels ${c.feel}<sup>°</sup></div>` : `<div class="hi">${c.rain > 0 ? c.rain + ' mm' : 'Dry'}</div><div class="lo">${c.prob}% chance</div>`}
      <div class="foot" style="border-top:3px solid ${RISK_COLOR[c.risk]}">${c.hi != null ? 'Risk' : 'Gusts'}<b>${c.hi != null ? STATUS_TEXT[a.status] : c.gust + ' km/h'}</b></div>
    </div>`).join('')}</div>`;
}

function welcomeHTML() {
  return `<section class="block"><div class="wrap">
    <div class="sec-head"><h2>How it works</h2><p>Free · no sign-up needed to check · works anywhere</p></div>
    <div class="welcome-steps">
      <div class="step"><div class="n">1</div><b>Pick your place</b><span>Search a town or tap “My location”.</span></div>
      <div class="step"><div class="n">2</div><b>Read the status</b><span>Safe, Watch, Warning or Danger — in plain words.</span></div>
      <div class="step"><div class="n">3</div><b>Follow the advice</b><span>Simple steps written for the current situation.</span></div>
      <div class="step"><div class="n">4</div><b>Get warned by phone</b><span>Create an account to receive SMS and calls for your places.</span></div>
    </div>
    <div id="popular" style="margin-top:22px"></div>
  </div></section>`;
}

function bodyHTML(a) {
  const dominant = Object.entries(a.hazards).sort((x, y) => y[1].prob - x[1].prob)[0][0];
  const emoji = { flood: '🌊', storm: '⛈️', wind: '💨', rain: '🌧️' }[dominant];
  return `
  <section class="block" style="padding-top:28px"><div class="wrap">
    <div class="alert-box ${a.risk}" id="alert-box">
      <div class="big">${a.status === 'SAFE' ? '✅' : emoji}</div>
      <div><h3>${escapeHTML(a.headline)}</h3><p>${escapeHTML(a.summary)}</p></div>
      <a class="btn" href="/account?add=${encodeURIComponent(JSON.stringify({ name: a.place.name, region: a.place.region || '', country: a.place.country || '', lat: a.place.lat, lon: a.place.lon }))}">📱 Get SMS / call alerts</a>
    </div>
  </div></section>

  <section class="block" style="padding-top:0"><div class="wrap grid2">
    <div class="card"><h3>What you should do</h3><div class="tips">${a.advice.map(x => `<div class="tip"><div class="ic">${x.icon}</div><div><b>${escapeHTML(x.title)}</b><span>${escapeHTML(x.sub)}</span></div></div>`).join('')}</div>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" id="save">${isSaved(a.place) ? '★ Saved' : '☆ Save this place'}</button>
        <button class="btn ghost sm" id="share">🔗 Share</button>
        <button class="btn ghost sm" id="refresh">↻ Refresh</button>
        <a class="btn ghost sm" href="/console?lat=${a.place.lat}&lon=${a.place.lon}&name=${encodeURIComponent(a.place.name)}">Detailed view</a>
      </div></div>
    <div class="card"><h3>Risk in the next few hours</h3>
      ${[['Flooding', a.hazards.flood, '#ef4444'], ['Thunderstorm', a.hazards.storm, '#f97316'], ['Heavy rain', a.hazards.rain, '#2e8bff'], ['Strong wind', a.hazards.wind, '#8b5cf6']].map(([l, h, c]) => `
        <div class="risk-row"><div>${l}<small>${escapeHTML(h.detail)}</small></div><div class="bar"><div class="fill" style="width:${Math.round(h.prob * 100)}%;background:${c}"></div></div><div class="lv" style="color:${RISK_COLOR[h.level]}">${h.level}</div></div>`).join('')}
      <p style="font-size:12px;color:var(--muted);margin:12px 0 0">Updated ${relTime(a.fetched_at)} · ${escapeHTML(a.data_source)}</p></div>
  </div></section>

  <section class="block" style="padding-top:0"><div class="wrap">
    <div class="card map-card"><h3>Live rain radar</h3><div class="map-wrap"><div id="site-map"></div></div>
    <div class="map-note">Colours show rain seen by weather radar right now (blue light → red/purple very heavy). Press ▶ to replay the last two hours. Icons are reports from people nearby.</div></div>
  </div></section>

  <section class="block" style="padding-top:0"><div class="wrap grid2">
    <div class="card"><h3>Next 12 hours</h3><div class="hourly-strip">${a.next_hours.map(h => `<div class="hs"><div class="t">${new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</div><div class="ico">${ICON(h.code)}</div><div class="r">${h.rain_mm > 0 ? h.rain_mm + ' mm' : 'Dry'}</div><div class="g">💨 ${h.gust_kmh}</div><div class="lv" style="background:${RISK_COLOR[h.risk]}"></div></div>`).join('')}</div></div>
    <div class="card"><h3>Next days</h3><div class="days">${a.next_days.map(d => { const dt = new Date(d.date + 'T12:00'); return `<div class="day"><div><b>${dt.toLocaleDateString([], { weekday: 'short' })}</b><small>${dt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</small></div><div class="ico">${ICON(d.code)}</div><div>${escapeHTML(d.text)}<small>${d.rain_mm} mm · ${d.prob_pct}% · gusts ${d.gust_kmh} km/h</small></div><div style="text-align:right"><div class="tt">${Math.round(d.tmax)}° / ${Math.round(d.tmin)}°</div><span class="tag ${d.risk}">${d.risk}</span></div></div>`; }).join('')}</div></div>
  </div></section>

  <section class="block" style="padding-top:0"><div class="wrap grid2">
    <div class="card reports"><h3>What people nearby are seeing</h3>${state.reports.length ? state.reports.map(r => `<div class="rep"><div style="font-size:22px">${REPORT_ICON[r.kind] || '📍'}</div><div><b>${escapeHTML(String(r.kind).replace('_', ' '))}</b> · ${escapeHTML(r.severity)}${r.note ? ` — ${escapeHTML(r.note)}` : ''}<small>${escapeHTML(r.place || '')} · ${relTime(r.created_at)}</small></div></div>`).join('') : '<p style="color:var(--muted);font-size:14px">No reports within ~50 km in the last 12 hours.</p>'}</div>
    <div class="card"><h3>Report what you see</h3><form class="form" id="rep">
      <div class="row"><select name="kind"><option value="flood">🌊 Flooding</option><option value="heavy_rain">🌧️ Very heavy rain</option><option value="lightning">⚡ Lightning nearby</option><option value="wind">💨 Damaging wind</option><option value="hail">🧊 Hail</option><option value="landslide">⛰️ Landslide</option><option value="all_clear">✅ All clear here</option><option value="other">📍 Something else</option></select>
      <select name="severity"><option value="LOW">Minor</option><option value="MEDIUM" selected>Noticeable</option><option value="HIGH">Serious</option><option value="CRITICAL">Life-threatening</option></select></div>
      <input name="note" maxlength="200" placeholder="Optional: a few words (e.g. road under water near the bridge)">
      <button class="btn" type="submit">Send report</button></form></div>
  </div></section>`;
}

function ctaHTML() {
  return `<section class="cta"><div class="wrap"><div><h2>Get a call before the storm arrives</h2><p>Create a free account, add your home and family's villages, and we'll SMS or phone you when the risk rises.</p></div><a class="btn" style="background:#fff;color:var(--navy)" href="${state.user ? '/account' : '/login'}">${state.user ? 'My alerts' : 'Create free account'}</a></div></section>
  <footer class="foot"><div class="wrap"><div>© ResiliNet · Weather data Open-Meteo · Radar RainViewer · Map © OpenStreetMap. Not an official warning service — always follow local authorities.</div><div><a href="/help">Help</a><a href="/console">Expert console</a><a href="/docs">API</a></div></div></footer>`;
}

// ---------- map ----------
let mapHost = null;
function mountMap() {
  const mount = document.getElementById('site-map'); if (!mount) return;
  if (!mapHost) { mapHost = document.createElement('div'); mapHost.style.cssText = 'position:absolute;inset:0'; }
  mount.appendChild(mapHost);
  if (!state.map) state.map = mountRadarMap(mapHost, { lat: state.a.place.lat, lon: state.a.place.lon, zoom: 8 });
  state.map.setPlace(state.a.place.lat, state.a.place.lon, state.a.risk, state.a.place.name);
  state.map.setReports(state.reports);
  setTimeout(() => state.map && state.map.invalidate(), 150);
}

// ---------- events ----------
let st = null;
function bind() {
  const q = document.getElementById('q'), sugg = document.getElementById('sugg');
  q.addEventListener('input', () => {
    clearTimeout(st); const v = q.value.trim(); if (v.length < 2) { sugg.classList.add('hidden'); return; }
    st = setTimeout(async () => {
      try { const j = await get(`/api/places/search?q=${encodeURIComponent(v)}`);
        sugg.innerHTML = j.results.length ? j.results.map((r, i) => `<button type="button" data-i="${i}">${escapeHTML(r.name)}<small>${escapeHTML([r.region, r.country].filter(Boolean).join(', '))}</small></button>`).join('') : `<button type="button" disabled>No places found — try a bigger town nearby</button>`;
        sugg.classList.remove('hidden');
        sugg.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { sugg.classList.add('hidden'); q.value = ''; selectPlace(j.results[Number(b.dataset.i)]); }));
      } catch (e) { toast(e.message, 'err'); }
    }, 280);
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') sugg.querySelector('[data-i]')?.click(); if (e.key === 'Escape') sugg.classList.add('hidden'); });
  document.getElementById('gps').addEventListener('click', useGPS);
  root.querySelectorAll('[data-saved]').forEach(ch => ch.addEventListener('click', (e) => {
    if (e.target.closest('[data-remove]')) { state.saved = state.saved.filter(s => key(s) !== ch.dataset.saved); persistSaved(); render(); return; }
    const s = state.saved.find(x => key(x) === ch.dataset.saved); if (s) selectPlace(s);
  }));
  const save = document.getElementById('save'); save && save.addEventListener('click', () => { const p = state.a.place; if (isSaved(p)) state.saved = state.saved.filter(s => key(s) !== key(p)); else state.saved.unshift({ name: p.name, region: p.region, country: p.country, lat: p.lat, lon: p.lon, risk: state.a.risk }); persistSaved(); render(); toast(isSaved(p) ? 'Saved on this device' : 'Removed', 'ok'); });
  const share = document.getElementById('share'); share && share.addEventListener('click', async () => { try { if (navigator.share) await navigator.share({ title: 'ResiliNet', text: state.a.headline, url: location.href }); else { await navigator.clipboard.writeText(location.href); toast('Link copied', 'ok'); } } catch { /* cancelled */ } });
  const rf = document.getElementById('refresh'); rf && rf.addEventListener('click', () => refresh(true));
  const rep = document.getElementById('rep'); rep && rep.addEventListener('submit', async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(rep).entries()); const b = rep.querySelector('button'); b.disabled = true; try { await get('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...fd, lat: state.a.place.lat, lon: state.a.place.lon, place: state.a.place.name }) }); toast('Thank you — your report is visible to people nearby', 'ok'); await refresh(); } catch (err) { toast(err.message, 'err'); b.disabled = false; } });
  document.addEventListener('click', (e) => { if (!e.target.closest('#hero-search')) sugg.classList.add('hidden'); });
  const pop = document.getElementById('popular');
  if (pop) get('/api/popular').then(j => { if (!j.places.length) return; pop.innerHTML = `<p style="font-size:13px;color:var(--muted);margin:0 0 8px">Recently checked by others</p><div class="saved">${j.places.map((p, i) => `<span class="chip" data-pop="${i}"><i style="background:${RISK_COLOR[p.last_risk] || '#94a3b8'}"></i>${escapeHTML(p.name)}${p.country_code ? ` · ${escapeHTML(p.country_code)}` : ''}</span>`).join('')}</div>`; pop.querySelectorAll('[data-pop]').forEach(b => b.addEventListener('click', () => selectPlace(j.places[Number(b.dataset.pop)]))); }).catch(() => {});
}

// nav burger + auth label
document.getElementById('burger')?.addEventListener('click', () => document.getElementById('menu').classList.toggle('open'));
fetch('/api/auth/me').then(r => r.json()).then(j => { state.user = j.user; const a = document.getElementById('nav-auth'); if (a && j.user) { a.textContent = j.user.first_name; a.href = '/account'; } }).catch(() => {});

// boot
(async () => {
  const q = new URLSearchParams(location.search); render();
  const DEMO = { syabrubesi: { name: 'Syabrubesi', lat: 28.16, lon: 85.34 }, dhunche: { name: 'Dhunche', lat: 28.11, lon: 85.297 }, kalikasthan: { name: 'Kalikasthan', lat: 28.03, lon: 85.25 }, langtang: { name: 'Langtang', lat: 28.214, lon: 85.517 }, trishuli: { name: 'Trishuli', lat: 27.92, lon: 85.15 } };
  if (q.get('demo') && DEMO[q.get('demo')]) return selectPlace({ ...DEMO[q.get('demo')], region: 'Bagmati', country: 'Nepal' });
  if (q.get('lat') && q.get('lon')) return selectPlace({ name: q.get('name') || 'Selected location', lat: Number(q.get('lat')), lon: Number(q.get('lon')) }, false);
  const last = localStorage.getItem(LAST_KEY); if (last) { try { return selectPlace(JSON.parse(last)); } catch { /* ignore */ } }
})();
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5 * 60_000);
