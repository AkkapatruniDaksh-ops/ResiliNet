// Citizen view — phone frame with push alert + hyper-local guidance.
// Renders from a live `ctx` ({ village, alert, conditions, kpis, reach }) when available.

import { svgIcon } from './icons.js';
import { escapeHTML, fmtK, parseTs } from './api.js';

function countdownText(alert) {
  if (!alert || alert.eta_minutes == null) return '--:--';
  const created = parseTs(alert.created_at);
  const impact = created.getTime() + alert.eta_minutes * 60_000;
  const left = Math.max(0, impact - Date.now());
  const m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function severePhoneHTML(ctx) {
  const v = ctx.village || { name: 'Syabrubesi', safe_zone: 'Dhunche Ridge — 1.2km NE', river: 'Trishuli & Lende Khola', fm_channel: 'FM 100.4 MHz' };
  const a = ctx.alert;
  const eta = a?.eta_minutes ?? 25;
  const hazardWord = { FLOOD: 'FLASH FLOOD WARNING', CONVECTION: 'SEVERE STORM WARNING', LIGHTNING: 'LIGHTNING WARNING', WIND: 'HIGH WIND WARNING', RAIN: 'EXTREME RAINFALL WARNING' }[a?.hazard] || 'SEVERE WEATHER WARNING';
  return `
    <div class="phone-body">
      <div class="push-card">
        <div class="push-head">
          <div class="push-icon">${svgIcon('alert', { size: 13, stroke: '#fff' })}</div>
          <div style="flex:1">
            <div class="push-app">RESILINET-AI</div>
            <div class="push-when">Now · Cell Broadcast</div>
          </div>
        </div>
        <div class="push-title">⚠️ ${hazardWord}</div>
        <div class="push-body">${a ? escapeHTML(a.title) + '.' : 'Severe rainfall detected.'} Impact expected in <b>${escapeHTML(v.name)}</b> within <b>${eta} minutes</b>. Move to higher ground immediately.</div>
      </div>

      <div class="countdown-box">
        <div class="countdown-label">TIME TO IMPACT</div>
        <div class="countdown-value" data-cd-created="${a?.created_at ?? ''}" data-cd-eta="${a?.eta_minutes ?? ''}">${countdownText(a)}</div>
        <div class="countdown-sub">MINUTES : SECONDS</div>
      </div>

      <div class="actions-label">RECOMMENDED ACTIONS</div>
      ${[
        { i: '▲', t: 'Evacuate to Higher Ground', s: `Nearest safe zone: ${v.safe_zone}` },
        { i: '⚠', t: 'Avoid River Corridors', s: v.river },
        { i: '📻', t: 'Tune to Emergency Broadcast', s: v.fm_channel },
      ].map(x => `
        <div class="action-row">
          <div class="action-emoji">${x.i}</div>
          <div><div class="action-title">${escapeHTML(x.t)}</div><div class="action-sub">${escapeHTML(x.s)}</div></div>
        </div>`).join('')}

      <a class="evac-btn" href="/?demo=${escapeHTML(v.slug || 'syabrubesi')}" target="_blank" rel="noopener">OPEN EVACUATION MAP</a>
    </div>`;
}

function clearPhoneHTML(ctx) {
  const v = ctx.village || { name: 'Syabrubesi' };
  const c = ctx.conditions || {};
  const sensors = ['RDR-01 online', `IoT-42 · ${(c.rain_rate ?? 2.1).toFixed ? c.rain_rate.toFixed(1) : c.rain_rate} mm/hr`, 'CAM-14 · visibility OK'];
  return `
    <div class="phone-body clear">
      <div class="clear-loc">${escapeHTML(v.name).toUpperCase()} · NEPAL</div>
      <div class="clear-title">All clear</div>
      <div class="clear-sub">Light rain possible after 4pm</div>

      <div class="safe-card">
        <div class="safe-top">
          <div>
            <div class="safe-status-label">STATUS</div>
            <div class="safe-status-value">SAFE</div>
          </div>
          <div class="safe-emoji">☁️</div>
        </div>
        <div class="safe-grid">
          <div>Rainfall<br/><b>${c.rain_rate ?? '2.1'} mm/hr</b></div>
          <div>Wind<br/><b>${c.wind_gust ?? '12'} km/h</b></div>
          <div>Risk<br/><span class="risk-low">Low</span></div>
          <div>Updated<br/><b>Just now</b></div>
        </div>
      </div>

      <div class="sensors-label">HYPER-LOCAL SENSORS</div>
      ${sensors.map(s => `<div class="sensor-line"><span class="sensor-dot"></span>${escapeHTML(s)}</div>`).join('')}
    </div>`;
}

export function citizenPhoneHTML(storm, ctx = {}) {
  return `
    <div class="phone-frame">
      <div class="phone-notch"></div>
      <div class="phone-statusbar"><span>9:47</span><span>●●● 5G  ▮▮▮</span></div>
      ${storm ? severePhoneHTML(ctx) : clearPhoneHTML(ctx)}
      <div class="phone-home-indicator"></div>
    </div>`;
}

export function citizenViewHTML(storm, ctx = {}) {
  const pop = ctx.kpis?.population_at_risk || 124500;
  const reach = ctx.reach ? fmtK(ctx.reach) : `~${fmtK(pop)}`;
  const eta = ctx.alert?.eta_minutes ?? 25;
  const metrics = [
    { k: 'Alert latency', v: '< 8s', c: 'var(--accent)' },
    { k: storm ? 'Reached so far' : 'Reach', v: reach, c: 'var(--accent-2)' },
    { k: 'Actionable minutes', v: `${eta} min`, c: 'var(--warn)' },
    { k: 'Delivered offline', v: 'BLE mesh', c: 'var(--violet)' },
  ];
  return `
    <div class="citizen-view">
      <div class="citizen-copy">
        <div class="citizen-back">← CITIZEN VIEW · <a href="/" target="_blank" rel="noopener" style="color:var(--accent-2)">OPEN PUBLIC PAGE ↗</a></div>
        <h1 class="citizen-headline">${storm ? `Alert reaches ${Number(pop).toLocaleString('en-IN')} people in seconds` : 'Silent when skies are clear'}</h1>
        <p class="citizen-desc">When ResiliNet detects a severe convection cell, it delivers hyper-local warnings through
          Cell Broadcast, SMS, native app push, and — critically — a fail-safe BLE mesh network
          that reaches phones even when cell towers go dark.</p>
        <div class="citizen-metrics">
          ${metrics.map(m => `
            <div class="citizen-metric">
              <div class="citizen-metric-label">${m.k.toUpperCase()}</div>
              <div class="citizen-metric-value" style="color:${m.c}">${m.v}</div>
            </div>`).join('')}
        </div>
      </div>
      ${citizenPhoneHTML(storm, ctx)}
    </div>`;
}

// Live countdown ticker for any mounted phone
setInterval(() => {
  document.querySelectorAll('[data-cd-created]').forEach(el => {
    if (!el.dataset.cdCreated || el.dataset.cdEta === '') return;
    el.textContent = countdownText({ created_at: el.dataset.cdCreated, eta_minutes: Number(el.dataset.cdEta) });
  });
}, 1000);

export { countdownText };
