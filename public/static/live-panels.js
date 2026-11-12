// Panels for the console's LIVE mode — driven by /api/live (real forecast for any place).

import { panelWrap } from './panels.js';
import { escapeHTML, relTime } from './api.js';
import { RISK_COLOR } from './radar-map.js';

const pct = (p) => `${Math.round((p || 0) * 100)}%`;

export function liveKpiHTML(a, alertsCount) {
  const c = a.current;
  const cells = [
    { label: 'LIVE RISK', value: a.risk, unit: '', color: RISK_COLOR[a.risk] },
    { label: 'RAIN NOW', value: c.precipitation_mm, unit: 'mm', color: 'var(--accent-2)' },
    { label: 'PEAK RAIN 3H', value: a.peak.rain_mm, unit: 'mm/h', color: a.peak.rain_mm >= 10 ? 'var(--warn)' : 'var(--accent)' },
    { label: 'WIND GUST', value: Math.round(c.gust_kmh), unit: 'km/h', color: c.gust_kmh >= 50 ? 'var(--warn)' : 'var(--accent)' },
    { label: 'RIVER vs NORMAL', value: a.river ? `${a.river.ratio}×` : '—', unit: '', color: a.river && a.river.ratio >= 1.5 ? 'var(--danger)' : 'var(--accent)' },
    { label: 'STORM ENERGY', value: a.hazards.storm.detail.match(/(\d+) J/)?.[1] ?? '—', unit: 'J/kg', color: 'var(--violet)' },
    { label: 'ALERTS 24H', value: alertsCount ?? 0, unit: '', color: alertsCount ? 'var(--warn)' : 'var(--ink-dim)' },
  ];
  return `<div class="kpi-strip" style="grid-template-columns:repeat(${cells.length}, 1fr)">${cells.map(k => `
    <div class="kpi-cell"><div class="kpi-label">${k.label}</div><div class="kpi-value-wrap"><span class="kpi-value" style="color:${k.color}">${k.value}</span>${k.unit ? `<span class="kpi-unit">${k.unit}</span>` : ''}</div></div>`).join('')}</div>`;
}

export function liveSourcesHTML(a) {
  const rows = [
    ['satellite', 'Global forecast blend', 'ECMWF · GFS · ICON', '15-min', 'LIVE'],
    ['sensor', 'GloFAS river model', 'Open-Meteo Flood', a.river ? `${a.river.discharge} m³/s` : 'n/a', a.river ? 'LIVE' : 'OFFLINE'],
    ['radar', 'Composite rain radar', 'RainViewer', '10-min', 'LIVE'],
    ['camera', 'Community reports', 'Crowd-sourced', 'realtime', 'LIVE'],
  ].map(([icon, name, id, rate, status]) => {
    const dot = status === 'LIVE' ? 'var(--accent)' : 'var(--ink-mute)';
    return `<div class="source-row"><div class="source-icon">${iconSVG(icon)}</div><div><div class="source-name">${name}</div><div class="source-meta">${id} · ${rate}</div></div>
      <div class="status-group"><span class="status-dot" style="background:${dot};box-shadow:0 0 8px ${dot}"></span><span class="status-label" style="color:${dot}">${status}</span></div></div>`;
  }).join('');
  const body = rows + `<div class="panel-footer">
    <div class="metric-row"><span class="metric-label">Elevation</span><span class="metric-value-wrap"><span class="metric-value" style="color:var(--accent)">${Math.round(a.place.elevation_m ?? 0)}</span><span class="metric-unit">m</span></span></div>
    <div class="metric-row"><span class="metric-label">Timezone</span><span class="metric-value-wrap"><span class="metric-value mono" style="font-size:11px;color:var(--accent-2)">${escapeHTML(a.place.timezone || '—')}</span></span></div>
    <div class="metric-row"><span class="metric-label">Forecast age</span><span class="metric-value-wrap"><span class="metric-value mono" style="font-size:11px" data-ts="${a.fetched_at}">${relTime(a.fetched_at)}</span></span></div>
  </div>`;
  return panelWrap('DATA SOURCES · LIVE', 'INGEST', '', body);
}

export function liveHazardsHTML(a) {
  const rows = [['Flash flood', a.hazards.flood, 'var(--danger)'], ['Convection', a.hazards.storm, 'var(--warn)'], ['Heavy rain', a.hazards.rain, 'var(--accent-2)'], ['High wind', a.hazards.wind, 'var(--violet)']]
    .map(([l, h, c]) => `<div class="model-row"><div class="model-top"><div><span class="model-short" style="color:${RISK_COLOR[h.level]}">${h.level}</span><span class="model-name">${l}</span></div><span class="model-conf" style="color:${c}">${pct(h.prob)}</span></div>
      <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${pct(h.prob)};background:${c}"></div></div><div class="model-sub"><span>${escapeHTML(h.detail)}</span></div></div>`).join('');
  const sev = a.status === 'DANGER' || a.status === 'WARNING';
  const v = sev ? { color: a.status === 'DANGER' ? 'var(--danger)' : 'var(--warn)', bg: 'rgba(255,45,85,0.08)', border: 'rgba(255,45,85,0.3)' } : { color: 'var(--accent)', bg: 'rgba(124,249,200,0.05)', border: 'var(--line-2)' };
  const body = rows + `<div class="panel-footer"><div class="verdict-box" style="background:${v.bg};border:1px solid ${v.border}"><div style="flex:1"><div class="verdict-title" style="color:${v.color}">VERDICT: ${a.status} · ${escapeHTML(a.headline)}</div><div class="verdict-sub">${escapeHTML(a.summary)}</div></div></div></div>`;
  return panelWrap('HAZARD ASSESSMENT', 'INFER', `<span class="mono" style="font-size:10px;color:${RISK_COLOR[a.risk]}">● ${a.risk}</span>`, body);
}

export function liveTimelineHTML(a) {
  const W = 600, H = 40;
  const hrs = a.next_hours;
  const maxRain = Math.max(5, ...hrs.map(h => h.rain_mm));
  const bars = hrs.map((h, i) => { const x = (i / hrs.length) * W, w = W / hrs.length - 3, bh = (h.rain_mm / maxRain) * (H - 4); return `<rect x="${x}" y="${H - bh}" width="${w}" height="${bh}" fill="${RISK_COLOR[h.risk]}" opacity=".8" rx="2"/>`; }).join('');
  const gustPath = hrs.map((h, i) => `${i ? 'L' : 'M'}${((i + 0.5) / hrs.length) * W},${H - (Math.min(100, h.gust_kmh) / 100) * (H - 4)}`).join(' ');
  const ticks = hrs.map(h => `<span>${h.time.slice(11, 16)}</span>`).join('');
  return `<div class="scrubber" style="flex-direction:column;align-items:stretch;gap:6px">
    <div class="scrubber-top"><span class="scrubber-caption">NEXT 12 HOURS · bars = rain mm/h (colour = risk) · line = gust km/h</span><span class="scrubber-value">${a.peak.time ? `PEAK ${a.peak.time.slice(11, 16)} · ${a.peak.rain_mm} mm/h` : 'NO SIGNIFICANT RAIN'}</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">${bars}<path d="${gustPath}" fill="none" stroke="#b18cff" stroke-width="1.5" opacity=".9"/></svg>
    <div class="scrubber-ticks" style="display:grid;grid-template-columns:repeat(${hrs.length},1fr);text-align:center">${ticks}</div>
  </div>`;
}

export function liveDaysHTML(a) {
  const rows = a.next_days.map(d => `<div class="dispatch-log-row wide" style="grid-template-columns:70px 1fr 90px 70px 60px"><span class="mono" style="color:var(--ink)">${new Date(d.date + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' })}</span><span class="dl-msg">${escapeHTML(d.text)}</span><span class="mono dl-reach">${d.rain_mm} mm · ${d.prob_pct}%</span><span class="mono dl-op">💨 ${d.gust_kmh}</span><span class="mono" style="color:${RISK_COLOR[d.risk]};text-align:right;font-weight:700">${d.risk}</span></div>`).join('');
  return panelWrap('4-DAY OUTLOOK', 'FCST', '', `<div class="dispatch-log">${rows}</div>`);
}

export function liveAlertsHTML(alerts, reports) {
  const SEV = { CRITICAL: 'var(--danger)', HIGH: 'var(--danger-2)', MEDIUM: 'var(--warn)', LOW: 'var(--accent)' };
  const a = (alerts || []).map(x => `<article class="alert-row" style="border-left:3px solid ${SEV[x.severity] || 'var(--ink-dim)'}"><div class="alert-icon" style="color:${SEV[x.severity]}">●</div><div class="alert-main"><div class="alert-sev" style="color:${SEV[x.severity]}">${x.severity} <span class="alert-hazard">${escapeHTML(x.hazard)}</span> · ${escapeHTML(x.place || '')}</div><div class="alert-text">${escapeHTML(x.title)}</div></div><div class="alert-time" data-ts="${x.created_at}">${relTime(x.created_at)}</div></article>`).join('');
  const r = (reports || []).map(x => `<article class="alert-row" style="border-left:3px solid var(--accent-2)"><div class="alert-icon">📣</div><div class="alert-main"><div class="alert-sev" style="color:var(--accent-2)">REPORT · ${escapeHTML(x.severity)}</div><div class="alert-text">${escapeHTML(String(x.kind).replace('_', ' '))}${x.note ? ` — ${escapeHTML(x.note)}` : ''} <span class="alert-hazard">${escapeHTML(x.place || '')}</span></div></div><div class="alert-time" data-ts="${x.created_at}">${relTime(x.created_at)}</div></article>`).join('');
  const body = `<div class="alerts-list">${a + r || '<div class="empty-note mono">NO LIVE ALERTS OR REPORTS NEAR THIS PLACE</div>'}</div>`;
  return panelWrap('LIVE ALERTS & COMMUNITY REPORTS', 'FEED', `<span class="mono" style="font-size:10px;color:var(--ink-mute)">${(alerts || []).length + (reports || []).length} ITEMS</span>`, body);
}

function iconSVG(name) {
  const d = {
    satellite: 'M4 20 20 4M9 3l6 6-4 4-6-6zM15 9l6 6-4 4-6-6M12 15a3 3 0 0 0-3 3M18 21a9 9 0 0 0-9-9',
    sensor: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4M8 8a5.66 5.66 0 0 0 0 8M16 8a5.66 5.66 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14',
    radar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 12L20 6',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  }[name];
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
