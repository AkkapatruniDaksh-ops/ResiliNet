// My alerts: watched places (SMS / call subscriptions), notification history, profile.
import { escapeHTML, relTime, toast } from './api.js';
import { RISK_COLOR } from './radar-map.js';

const root = document.getElementById('account-app');
const state = { user: null, subs: [], notifs: [], smsLive: false, editing: null, chosen: null, gateway: null, showGateway: false };
const COUNTRIES = [['+91', '🇮🇳 +91'], ['+977', '🇳🇵 +977'], ['+880', '🇧🇩 +880'], ['+94', '🇱🇰 +94'], ['+92', '🇵🇰 +92'], ['+1', '🇺🇸 +1'], ['+44', '🇬🇧 +44'], ['+61', '🇦🇺 +61'], ['+234', '🇳🇬 +234'], ['+63', '🇵🇭 +63'], ['+62', '🇮🇩 +62'], ['+971', '🇦🇪 +971']];
const LEVEL_WORD = { YELLOW: 'Watch (yellow) or worse', AMBER: 'Warning (amber) or worse', RED: 'Danger (red) only' };
const CH_ICON = { sms: '💬', call: '📞', test: '🧪' };

async function req(method, url, body) {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = '/login?mode=login&next=/account'; throw new Error('Please log in'); }
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

async function load() {
  const me = await req('GET', '/api/auth/me');
  if (!me.user) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return; }
  // deep link from the home page: /account?add={place json}
  const addParam = new URLSearchParams(location.search).get('add');
  if (addParam && !state.chosen) { try { state.chosen = JSON.parse(addParam); } catch { /* ignore */ } }
  state.user = me.user; state.smsLive = me.sms_live;
  const [s, n, g] = await Promise.all([req('GET', '/api/subscriptions'), req('GET', '/api/notifications'), req('GET', '/api/gateway').catch(() => ({ gateway: null }))]);
  state.subs = s.subscriptions; state.notifs = n.notifications; state.gateway = g.gateway;
  render();
}

// ================= render =================
function render() {
  const u = state.user;
  root.innerHTML = `
    <header class="acct-head">
      <div><h1>Hello, ${escapeHTML(u.first_name)} 👋</h1><p>${escapeHTML(u.email)}${u.phone ? ` · 📱 ${escapeHTML(u.phone)}` : ' · <b style="color:var(--warn)">no phone number yet</b>'}</p></div>
      <div class="status-actions"><a class="icon-btn" href="/">🏠 My Weather</a><button class="icon-btn" id="logout-btn">Log out</button></div>
    </header>
    ${stepsHTML()}
    ${modeBannerHTML()}
    ${subsHTML()}
    ${addHTML()}
    ${notifsHTML()}
    ${profileHTML()}`;
  bind();
  if (state.chosen && new URLSearchParams(location.search).get('add')) {
    const lbl = document.querySelector('#add-form [name=label]'); if (lbl && !lbl.value) lbl.value = state.chosen.name;
    document.getElementById('add-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    history.replaceState(null, '', '/account');
  }
}

function stepsHTML() {
  const hasPhone = !!state.user.phone, hasSub = state.subs.length > 0, tested = state.notifs.some(n => n.level === 'TEST' && n.status !== 'failed');
  return `<section class="card span-2"><h2>How your alerts work</h2><div class="steps">
    <div class="step ${hasPhone ? 'done' : ''}"><span>STEP 1 ${hasPhone ? '✓' : ''}</span>Add your mobile number (Profile below)</div>
    <div class="step ${hasSub ? 'done' : ''}"><span>STEP 2 ${hasSub ? '✓' : ''}</span>Add the places you care about</div>
    <div class="step ${tested ? 'done' : ''}"><span>STEP 3 ${tested ? '✓' : ''}</span>Send yourself a test SMS or call</div>
    <div class="step"><span>THEN</span>We check each place every 10 min and SMS / call you when risk rises</div>
  </div></section>`;
}

function modeBannerHTML() {
  const g = state.gateway;
  const live = state.smsLive
    ? `<div class="mode-banner live">✅ <b>Live delivery is on</b> via <b>${escapeHTML(g?.provider || '')}</b>${g?.voice ? ' (SMS + voice calls)' : ' (SMS only — voice alerts are delivered as SMS)'}. <a href="#" id="gw-toggle" style="color:var(--accent-2)">Change gateway</a></div>`
    : `<div class="mode-banner sim">📵 <b>Messages are not reaching your phone yet.</b> No SMS gateway is connected, so alerts are <b>recorded below</b> instead of being sent. Everything else (checks every 10 min, thresholds, quiet hours) is already working. <a href="#" id="gw-toggle" style="color:var(--accent-2);font-weight:600">Connect an SMS gateway now →</a></div>`;
  return live + (state.showGateway ? gatewayHTML() : '');
}

function gatewayHTML() {
  const g = state.gateway || {};
  const opt = (v, l) => `<option value="${v}" ${g.provider === v ? 'selected' : ''}>${l}</option>`;
  return `<section class="card span-2" id="gateway-card"><h2>SMS / call gateway <span class="hint">where the messages are actually sent from</span></h2>
    <p style="margin:0;font-size:13px;color:var(--ink-dim);line-height:1.5">ResiliNet needs a telecom provider account to deliver messages — it cannot send SMS or ring phones on its own. Pick one below, paste its key, then press <b>Send test SMS</b>. Keys are stored on the server and never shown again in full.</p>
    <form class="prof-form" id="gw-form">
      <label>Provider
        <select name="provider">${opt('textbelt', 'Textbelt — SMS only, global, 1 free SMS/day with key "textbelt" (good for a quick test)')}${opt('fast2sms', 'Fast2SMS — SMS only, India, free trial credits')}${opt('twilio', 'Twilio — SMS + voice calls, global, free trial')}${opt('none', 'None (demo mode — record only)')}</select></label>
      <div id="gw-fields">
        <div data-p="textbelt" class="gw-p"><label>Textbelt key <small style="color:var(--ink-mute)">— type <code>textbelt</code> for the free 1/day tier, or buy a key at textbelt.com (${g.textbelt?.configured ? 'saved: ' + escapeHTML(g.textbelt.key) : 'not set'})</small><input name="textbelt_key" placeholder="textbelt"></label></div>
        <div data-p="fast2sms" class="gw-p"><label>Fast2SMS API key <small style="color:var(--ink-mute)">— from fast2sms.com → Dev API (${g.fast2sms?.configured ? 'saved: ' + escapeHTML(g.fast2sms.key) : 'not set'})</small><input name="fast2sms_key" placeholder="paste your API key"></label></div>
        <div data-p="twilio" class="gw-p">
          <div class="grid2"><label>Account SID <small style="color:var(--ink-mute)">(${g.twilio?.configured ? 'saved: ' + escapeHTML(g.twilio.sid) : 'not set'})</small><input name="twilio_sid" placeholder="ACxxxxxxxx"></label><label>Auth token<input name="twilio_token" type="password" placeholder="••••••••"></label></div>
          <label>Twilio phone number (from) <small style="color:var(--ink-mute)">(${g.twilio?.from ? 'saved: ' + escapeHTML(g.twilio.from) : 'not set'})</small><input name="twilio_from" placeholder="+12025550123"></label>
          <div class="auth-hint">Free trial accounts can only message <b>verified</b> numbers — verify your own mobile in the Twilio console first.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="big-btn primary" type="submit">Save gateway</button><button class="big-btn" type="button" id="gw-cancel">Close</button></div>
    </form></section>`;
}

function subsHTML() {
  const rows = state.subs.map(s => {
    const lvl = s.last_level || 'GREEN';
    const editing = state.editing === s.id;
    return `
    <div class="sub-row" data-sub="${s.id}">
      <span class="lvl" style="background:${RISK_COLOR[lvl]};box-shadow:0 0 8px ${RISK_COLOR[lvl]}"></span>
      <div>
        <b>${escapeHTML(s.label)} <span style="color:var(--ink-dim);font-weight:400;font-size:13px">· ${escapeHTML(s.place_name)}${s.country ? ', ' + escapeHTML(s.country) : ''}</span></b>
        <div class="meta">
          <span class="pill ${lvl.toLowerCase()}">${lvl === 'GREEN' ? 'SAFE NOW' : lvl}</span>
          ${s.active ? '' : '<span class="pill" style="background:rgba(255,255,255,.08);color:var(--ink-dim)">PAUSED</span>'}
          Warn at: ${LEVEL_WORD[s.min_level]} · ${s.via_sms ? '💬 SMS' : ''} ${s.via_call ? `📞 Call at ${s.call_min_level}` : ''}
          ${s.quiet_start != null ? ` · 🌙 quiet ${s.quiet_start}:00–${s.quiet_end}:00` : ''}
          <br>Checked ${s.last_checked ? relTime(s.last_checked) : 'never'}${s.last_notified ? ` · last alert ${relTime(s.last_notified)}` : ''}
        </div>
      </div>
      <div class="sub-actions">
        <button class="icon-btn" data-act="check" data-id="${s.id}" title="Re-check the forecast now">↻ Check</button>
        <button class="icon-btn" data-act="edit" data-id="${s.id}">${editing ? '✕ Close' : '⚙ Settings'}</button>
        <a class="icon-btn" href="/?lat=${s.lat}&lon=${s.lon}&name=${encodeURIComponent(s.place_name)}">👁 View</a>
      </div>
      ${editing ? editHTML(s) : ''}
    </div>`;
  }).join('');
  return `<section class="card span-2" id="subs-card"><h2>Places I'm warned about <span class="hint">${state.subs.length}/10</span></h2>
    ${rows || '<div class="empty-note mono">NO PLACES YET — ADD ONE BELOW</div>'}</section>`;
}

function editHTML(s) {
  const hours = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${sel === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
  return `<form class="sub-edit" data-edit="${s.id}">
    <label>Name<input name="label" value="${escapeHTML(s.label)}" maxlength="40"></label>
    <label>Warn me at<select name="min_level">${['YELLOW', 'AMBER', 'RED'].map(l => `<option value="${l}" ${s.min_level === l ? 'selected' : ''}>${LEVEL_WORD[l]}</option>`).join('')}</select></label>
    <label class="row-check"><input type="checkbox" name="via_sms" ${s.via_sms ? 'checked' : ''}> 💬 SMS</label>
    <label class="row-check"><input type="checkbox" name="via_call" ${s.via_call ? 'checked' : ''}> 📞 Phone call</label>
    <label>Call only at<select name="call_min_level">${['YELLOW', 'AMBER', 'RED'].map(l => `<option value="${l}" ${s.call_min_level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Quiet from<select name="quiet_start"><option value="">— none —</option>${hours(s.quiet_start)}</select></label>
    <label>Quiet until<select name="quiet_end"><option value="">— none —</option>${hours(s.quiet_end)}</select></label>
    <label class="row-check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Active</label>
    <div style="grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="big-btn primary" type="submit">Save</button>
      <button class="big-btn" type="button" data-act="drill" data-id="${s.id}" title="Send the real warning message as a drill">🚨 Run a drill</button>
      <button class="big-btn danger" type="button" data-act="delete" data-id="${s.id}" style="margin-left:auto">Remove</button>
    </div>
    <div style="grid-column:1/-1;font-size:11px;color:var(--ink-mute)">Danger (red) warnings ignore quiet hours. The same level is repeated at most every 90 minutes; you get an "all clear" SMS when the risk passes.</div>
  </form>`;
}

function addHTML() {
  return `<section class="card" id="add-card"><h2>Add a place</h2>
    <form class="add-form" id="add-form">
      <input class="search-input" id="add-search" type="search" placeholder="Search a town, village or city…" autocomplete="off" aria-label="Search place">
      <div class="suggest hidden" id="add-suggest"></div>
      <div class="chosen" id="add-chosen">${state.chosen ? `📍 ${escapeHTML([state.chosen.name, state.chosen.region, state.chosen.country].filter(Boolean).join(', '))}` : 'No place chosen yet — or <a href="#" id="add-gps" style="color:var(--accent-2)">use my current location</a>'}</div>
      <div class="grid2">
        <input class="small" name="label" placeholder="Name it (e.g. Home, Mum's village)" maxlength="40">
        <select name="min_level"><option value="YELLOW">Warn at Watch (yellow)+</option><option value="AMBER" selected>Warn at Warning (amber)+</option><option value="RED">Warn at Danger (red) only</option></select>
      </div>
      <div class="grid2">
        <label class="auth-check" style="min-height:44px"><input type="checkbox" name="via_sms" checked> 💬 SMS</label>
        <label class="auth-check" style="min-height:44px"><input type="checkbox" name="via_call" checked> 📞 Phone call for Danger</label>
      </div>
      <button class="big-btn primary" type="submit" ${state.user.phone ? '' : 'disabled title="Add your phone number first"'}>🔔 Start watching this place</button>
      ${state.user.phone ? '' : '<div class="auth-hint" style="color:var(--warn)">Add your mobile number in Profile to enable SMS / calls.</div>'}
    </form></section>`;
}

function notifsHTML() {
  const rows = state.notifs.map(n => `<div class="notif"><div class="ic">${CH_ICON[n.channel] || '🔔'}</div>
    <div><div class="msg">${escapeHTML(n.message)}</div><div class="meta">${n.channel.toUpperCase()} → ${escapeHTML(n.to_number || '')} · ${n.label ? escapeHTML(n.label) + ' · ' : ''}${n.level ? n.level + ' · ' : ''}${relTime(n.created_at)}${n.error && n.status === 'failed' ? ` · <span style="color:var(--danger)">${escapeHTML(n.error)}</span>` : ''}</div></div>
    <span class="st ${n.status}">${n.status === 'simulated' ? 'RECORDED (DEMO)' : n.status.replace('_', ' ').toUpperCase()}</span></div>`).join('');
  return `<section class="card" id="notif-card"><h2>Messages & calls <span class="hint">latest 50</span></h2>
    <div class="status-actions"><button class="icon-btn" id="test-sms" ${state.user.phone ? '' : 'disabled'}>💬 Send test SMS</button><button class="icon-btn" id="test-call" ${state.user.phone ? '' : 'disabled'}>📞 Make test call</button></div>
    ${rows || '<div class="empty-note mono">NOTHING SENT YET</div>'}</section>`;
}

function profileHTML() {
  const u = state.user;
  return `<section class="card span-2" id="profile-card"><h2>Profile & phone number</h2>
    <form class="prof-form" id="prof-form">
      <div class="grid2"><label>First name<input name="first_name" value="${escapeHTML(u.first_name)}" required></label><label>Last name<input name="last_name" value="${escapeHTML(u.last_name || '')}"></label></div>
      <label>Mobile number (with country code) — used for SMS and calls
        <div class="grid-phone"><select name="default_country">${COUNTRIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><input name="phone" type="tel" value="${escapeHTML(u.phone || '')}" placeholder="+91 98765 43210"></div></label>
      <div class="grid2"><label>Current password (only to change it)<input name="current_password" type="password" autocomplete="current-password"></label><label>New password<input name="new_password" type="password" autocomplete="new-password" minlength="8"></label></div>
      <button class="big-btn primary" type="submit" style="justify-self:start">Save profile</button>
    </form></section>`;
}

// ================= events =================
let sugTimer = null;
const chosenText = () => `📍 ${[state.chosen.name, state.chosen.region, state.chosen.country].filter(Boolean).join(', ')}`;
function bind() {
  document.getElementById('logout-btn').addEventListener('click', async () => { await req('POST', '/api/auth/logout'); location.href = '/'; });
  const gwT = document.getElementById('gw-toggle'); gwT && gwT.addEventListener('click', (e) => { e.preventDefault(); state.showGateway = !state.showGateway; render(); if (state.showGateway) document.getElementById('gateway-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  const gwF = document.getElementById('gw-form');
  if (gwF) {
    const showP = () => { const p = gwF.provider.value; gwF.querySelectorAll('.gw-p').forEach(d => d.style.display = d.dataset.p === p ? '' : 'none'); };
    showP(); gwF.provider.addEventListener('change', showP);
    document.getElementById('gw-cancel').addEventListener('click', () => { state.showGateway = false; render(); });
    gwF.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(gwF).entries());
      const body = { provider: fd.provider };
      for (const k of ['textbelt_key', 'fast2sms_key', 'twilio_sid', 'twilio_token', 'twilio_from']) if (fd[k]) body[k] = fd[k];
      try { const r = await req('PUT', '/api/gateway', body); toast(r.gateway.ready ? `Gateway connected: ${r.gateway.provider}. Now press "Send test SMS".` : 'Saved — but this provider still needs its key before it can send', r.gateway.ready ? 'ok' : 'warn', 6000); state.showGateway = !r.gateway.ready; await load(); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const id = Number(b.dataset.id), act = b.dataset.act;
    try {
      if (act === 'edit') { state.editing = state.editing === id ? null : id; render(); return; }
      if (act === 'check') { b.disabled = true; const r = await req('POST', `/api/subscriptions/${id}/check`); toast(`${r.subscription.label}: ${r.status} — ${r.headline}${r.notified.length ? ` · ${r.notified.length} message(s) ${state.smsLive ? 'sent' : 'recorded'}` : ''}`, r.level === 'RED' ? 'err' : r.level === 'AMBER' ? 'warn' : 'ok', 6000); await load(); return; }
      if (act === 'delete') { if (!confirm('Stop watching this place?')) return; await req('DELETE', `/api/subscriptions/${id}`); toast('Removed', 'ok'); state.editing = null; await load(); return; }
      if (act === 'drill') { b.disabled = true; const r = await req('POST', `/api/subscriptions/${id}/simulate`, { level: 'RED' }); toast(`Drill: ${r.notified.map(n => n.channel.toUpperCase() + ' ' + (n.status === 'sent' ? 'sent' : n.status === 'simulated' ? 'recorded (demo)' : 'FAILED')).join(', ') || 'no channels enabled'}`, 'warn', 6000); await load(); return; }
    } catch (err) { toast(err.message, 'err'); b.disabled = false; }
  }));

  root.querySelectorAll('[data-edit]').forEach(f => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(f.dataset.edit); const fd = new FormData(f);
    const body = { label: fd.get('label'), min_level: fd.get('min_level'), call_min_level: fd.get('call_min_level'), via_sms: f.via_sms.checked, via_call: f.via_call.checked, active: f.active.checked, quiet_start: fd.get('quiet_start') || null, quiet_end: fd.get('quiet_end') || null };
    if ((body.quiet_start == null) !== (body.quiet_end == null)) { toast('Set both quiet-hours times, or neither', 'warn'); return; }
    try { await req('PATCH', `/api/subscriptions/${id}`, body); toast('Settings saved', 'ok'); state.editing = null; await load(); } catch (err) { toast(err.message, 'err'); }
  }));

  // add place
  const search = document.getElementById('add-search'), sug = document.getElementById('add-suggest');
  search.addEventListener('input', () => {
    clearTimeout(sugTimer); const q = search.value.trim();
    if (q.length < 2) { sug.classList.add('hidden'); return; }
    sugTimer = setTimeout(async () => {
      try {
        const j = await req('GET', `/api/places/search?q=${encodeURIComponent(q)}`);
        sug.innerHTML = j.results.length ? j.results.map((r, i) => `<button type="button" data-i="${i}"><span>${escapeHTML(r.name)}</span><small>${escapeHTML([r.region, r.country].filter(Boolean).join(', '))}</small></button>`).join('') : '<button type="button" disabled>No places found</button>';
        sug.classList.remove('hidden');
        sug.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { state.chosen = j.results[Number(b.dataset.i)]; sug.classList.add('hidden'); search.value = ''; document.getElementById('add-chosen').textContent = chosenText(); const lbl = document.querySelector('#add-form [name=label]'); if (!lbl.value) lbl.value = state.chosen.name; }));
      } catch (err) { toast(err.message, 'err'); }
    }, 280);
  });
  const gps = document.getElementById('add-gps');
  gps && gps.addEventListener('click', (e) => { e.preventDefault(); if (!navigator.geolocation) { toast('Location not supported here', 'warn'); return; } navigator.geolocation.getCurrentPosition(async (pos) => { const { latitude: lat, longitude: lon } = pos.coords; const j = await req('GET', `/api/places/reverse?lat=${lat}&lon=${lon}`); state.chosen = { ...j.place, lat, lon }; document.getElementById('add-chosen').textContent = chosenText(); const lbl = document.querySelector('#add-form [name=label]'); if (!lbl.value) lbl.value = 'Home'; }, () => toast('Could not get your location', 'warn')); });
  document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.chosen) { toast('Please search and choose a place first', 'warn'); search.focus(); return; }
    const f = e.target; const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await req('POST', '/api/subscriptions', { label: f.label.value, place_name: state.chosen.name, region: state.chosen.region, country: state.chosen.country, lat: state.chosen.lat, lon: state.chosen.lon, min_level: f.min_level.value, via_sms: f.via_sms.checked, via_call: f.via_call.checked, call_min_level: 'RED' });
      toast(`Now watching ${r.subscription.label}. Current status: ${r.check?.status || 'checking…'}`, r.check?.level === 'RED' ? 'err' : 'ok', 5000);
      state.chosen = null; await load();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  });

  // tests
  const t = async (channel, btn) => { btn.disabled = true; try { const r = await req('POST', '/api/notifications/test', { channel }); toast(r.status === 'sent' ? `✅ Test ${channel} sent to ${state.user.phone} via ${r.provider}${r.error ? ' — ' + r.error : ''}` : r.status === 'failed' ? `❌ ${r.provider || 'Gateway'} rejected it: ${r.error}` : `Recorded only — no SMS gateway connected yet. Use “Connect an SMS gateway” above.`, r.status === 'sent' ? 'ok' : r.status === 'failed' ? 'err' : 'warn', 7000); await load(); } catch (err) { toast(err.message, 'err'); btn.disabled = false; } };
  document.getElementById('test-sms').addEventListener('click', (e) => t('sms', e.currentTarget));
  document.getElementById('test-call').addEventListener('click', (e) => t('call', e.currentTarget));

  // profile
  document.getElementById('prof-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target;
    const body = { first_name: f.first_name.value, last_name: f.last_name.value, phone: f.phone.value, default_country: f.default_country.value };
    if (f.new_password.value) { body.new_password = f.new_password.value; body.current_password = f.current_password.value; }
    try { await req('PATCH', '/api/auth/me', body); toast('Profile saved', 'ok'); await load(); } catch (err) { toast(err.message, 'err'); }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#add-form')) sug.classList.add('hidden'); });
}

load().catch(e => { root.innerHTML = `<div class="card span-2"><h2>Could not load your account</h2><p>${escapeHTML(e.message)}</p><a class="big-btn" href="/login">Log in</a></div>`; });
