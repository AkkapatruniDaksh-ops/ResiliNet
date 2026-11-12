// Side panels rendered from live API data: data fusion sources, AI ensemble,
// alerts feed (with ack/resolve), dispatch console (with history), KPI strip,
// time scrubber, village risk table.

import { svgIcon } from './icons.js';
import { relTime, fmtInt, fmtK, escapeHTML } from './api.js';

export function panelWrap(title, tag, rightHTML, bodyHTML, extraClass = '') {
  return `
    <section class="panel ${extraClass}">
      <header class="panel-head">
        <div class="panel-head-left">
          ${tag ? `<span class="panel-tag">${tag}</span>` : ''}
          <span class="panel-title">${title}</span>
        </div>
        ${rightHTML || ''}
      </header>
      <div class="panel-body">${bodyHTML}</div>
    </section>`;
}

const STATUS_COLOR = { LIVE: 'var(--accent)', ELEVATED: 'var(--warn)', ALERT: 'var(--danger)', OFFLINE: 'var(--ink-mute)' };
const SEV_COLOR = { CRITICAL: 'var(--danger)', HIGH: 'var(--danger-2)', MEDIUM: 'var(--warn)', LOW: 'var(--accent)', INFO: 'var(--ink-dim)' };
const RISK_COLOR = { RED: '#ff2d55', AMBER: '#ffb347', YELLOW: '#ffea55', GREEN: '#7cf9c8' };

// ---------- Data Fusion Panel ----------
export function dataFusionPanelHTML(sensors, kpis) {
  const rows = (sensors || []).map(s => {
    const dot = STATUS_COLOR[s.status] || 'var(--accent)';
    const idLabel = s.unit_count > 1 ? `${s.code.split('-')[0]} x ${s.unit_count}` : s.code;
    return `
      <div class="source-row" title="${escapeHTML(s.kind)} · last seen ${relTime(s.last_seen)}">
        <div class="source-icon">${svgIcon(s.icon, { size: 14 })}</div>
        <div>
          <div class="source-name">${escapeHTML(s.name)}</div>
          <div class="source-meta">${escapeHTML(idLabel)} · ${escapeHTML(s.rate_label || '')}</div>
        </div>
        <div class="status-group">
          <span class="status-dot" style="background:${dot};box-shadow:0 0 8px ${dot}"></span>
          <span class="status-label" style="color:${dot}">${s.status}</span>
        </div>
      </div>`;
  }).join('');
  const body = rows + `
    <div class="panel-footer">
      <div class="metric-row"><span class="metric-label">Fusion Latency</span>
        <span class="metric-value-wrap"><span class="metric-value" style="color:var(--accent)">${kpis?.fusion_latency_s ?? '—'}</span><span class="metric-unit">s</span></span></div>
      <div class="metric-row"><span class="metric-label">Model Sync</span>
        <span class="metric-value-wrap"><span class="metric-value" style="color:var(--accent-2)">${kpis?.model_sync_pct ?? '—'}</span><span class="metric-unit">%</span></span></div>
    </div>`;
  return panelWrap('MULTI-SOURCE DATA FUSION', 'INGEST', '', body);
}

// ---------- AI Engine Panel ----------
export function aiEnginePanelHTML(models, ensemble, hazards) {
  const rows = (models || []).map(m => `
    <div class="model-row">
      <div class="model-top">
        <div><span class="model-short">${escapeHTML(m.code)}</span><span class="model-name">${escapeHTML(m.name)}</span></div>
        <span class="model-conf">${Number(m.confidence).toFixed(0)}%</span>
      </div>
      <div class="conf-bar-bg"><div class="conf-bar-fill" style="width:${m.confidence}%"></div></div>
      <div class="model-sub"><span>GPU LOAD ${Math.round(m.gpu_load)}%</span><span>${escapeHTML(m.detail || '')} · ${escapeHTML(m.version || '')}</span></div>
    </div>`).join('');

  const verdictText = hazards?.verdict || ensemble?.verdict || 'STABLE';
  const severe = verdictText === 'SEVERE CONVECTION';
  const elevated = verdictText === 'ELEVATED';
  const v = severe
    ? { color: 'var(--danger)', bg: 'rgba(255,45,85,0.08)', border: 'rgba(255,45,85,0.3)' }
    : elevated
      ? { color: 'var(--warn)', bg: 'rgba(255,179,71,0.08)', border: 'rgba(255,179,71,0.3)' }
      : { color: 'var(--accent)', bg: 'rgba(124,249,200,0.05)', border: 'var(--line-2)' };
  const sub = hazards
    ? `Flood ${Math.round(hazards.flood_prob * 100)}% · Lightning ${Math.round(hazards.lightning_prob * 100)}% · Wind ${Math.round(hazards.wind_prob * 100)}% · ${ensemble?.horizon_min ?? 45} min horizon`
    : '—';
  const body = rows + `
    <div class="panel-footer">
      <div class="verdict-box" style="background:${v.bg};border:1px solid ${v.border}">
        ${svgIcon('cpu', { size: 16, stroke: v.color })}
        <div style="flex:1">
          <div class="verdict-title" style="color:${v.color}">ENSEMBLE VERDICT: ${escapeHTML(verdictText)}</div>
          <div class="verdict-sub">${sub}</div>
        </div>
      </div>
    </div>`;
  const right = `<span class="mono" style="font-size:10px;color:var(--accent)">● GPU 4×A100</span>`;
  return panelWrap('AI NOWCAST ENGINE', 'INFER', right, body);
}

// ---------- Alerts Panel ----------
export function alertsPanelHTML(alerts, mode, filter = 'open') {
  const list = alerts || [];
  const active = list.filter(a => a.status === 'active').length;
  const rows = list.length ? list.map(a => alertRowHTML(a)).join('')
    : `<div class="empty-note mono">NO ${filter.toUpperCase()} ALERTS</div>`;
  const right = `
    <div class="panel-head-right">
      <select class="mini-select mono" id="alerts-filter" aria-label="Filter alerts">
        ${['open', 'active', 'acknowledged', 'resolved', 'all'].map(f => `<option value="${f}" ${f === filter ? 'selected' : ''}>${f.toUpperCase()}</option>`).join('')}
      </select>
      <span class="mono" style="font-size:10px;color:${active ? 'var(--danger)' : 'var(--accent)'}">${active ? `● ${active} ACTIVE` : '● NOMINAL'}</span>
    </div>`;
  const body = `
    <div class="alerts-list" id="alerts-list">${rows}</div>
    <div class="panel-footer alert-compose-foot">
      <button class="ghost-btn mono" id="alert-compose-toggle">${svgIcon('alert', { size: 11 })} RAISE MANUAL ALERT</button>
      <a class="ghost-btn mono" href="/api/export/incident" download>${svgIcon('layers', { size: 11 })} EXPORT</a>
    </div>
    <form class="alert-compose hidden" id="alert-compose">
      <div class="compose-grid">
        <select name="severity" class="mini-select mono">${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => `<option ${s === 'HIGH' ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select name="hazard" class="mini-select mono">${['FLOOD', 'CONVECTION', 'LIGHTNING', 'WIND', 'RAIN', 'GENERAL'].map(s => `<option>${s}</option>`).join('')}</select>
        <select name="village_slug" class="mini-select mono" id="compose-village"><option value="">BASIN-WIDE</option></select>
        <input name="eta_minutes" type="number" min="0" max="600" placeholder="ETA min" class="mini-input mono">
      </div>
      <input name="title" required maxlength="160" placeholder="Alert title (required)" class="mini-input">
      <input name="body" maxlength="600" placeholder="Details (optional)" class="mini-input">
      <div class="compose-actions">
        <button type="submit" class="dispatch-btn ready">RAISE</button>
        <button type="button" class="ghost-btn mono" id="alert-compose-cancel">CANCEL</button>
      </div>
    </form>`;
  return panelWrap('ACTIVE ALERTS', 'FEED', right, body);
}

export function alertRowHTML(a) {
  const color = SEV_COLOR[a.severity] || 'var(--ink-dim)';
  const critical = a.severity === 'CRITICAL' && a.status === 'active';
  const acked = a.status === 'acknowledged';
  const resolved = a.status === 'resolved';
  const where = a.village_name ? ` · ${escapeHTML(a.village_name)}` : '';
  const eta = a.eta_minutes != null && !resolved ? `<span class="alert-eta mono">ETA ${a.eta_minutes}m</span>` : '';
  const actions = resolved ? '' : `
    <div class="alert-actions">
      ${a.status === 'active' ? `<button class="alert-act mono" data-alert-act="ack" data-alert-id="${a.id}" title="Acknowledge">ACK</button>` : ''}
      <button class="alert-act mono" data-alert-act="resolve" data-alert-id="${a.id}" title="Resolve">RESOLVE</button>
    </div>`;
  return `
    <article class="alert-row ${critical ? 'critical' : ''} ${acked ? 'acked' : ''} ${resolved ? 'resolved' : ''}" style="border-left:3px solid ${color}" data-alert-row="${a.id}">
      <div class="alert-icon" style="color:${color}">${a.severity === 'CRITICAL' ? svgIcon('alert', { size: 14 }) : svgIcon('circle', { size: 8 })}</div>
      <div class="alert-main">
        <div class="alert-sev" style="color:${color}">${a.severity} <span class="alert-hazard">${escapeHTML(a.hazard)}</span>${where}${a.source === 'operator' ? ' <span class="alert-src">OPERATOR</span>' : ''}</div>
        <div class="alert-text">${escapeHTML(a.title)}</div>
        ${a.body ? `<div class="alert-body">${escapeHTML(a.body)}</div>` : ''}
        <div class="alert-meta-row">${eta}${acked ? `<span class="alert-eta mono" style="color:var(--accent-2)">ACK ${escapeHTML(a.acknowledged_by || '')}</span>` : ''}${actions}</div>
      </div>
      <div class="alert-time" data-ts="${a.created_at}">${relTime(a.created_at)}</div>
    </article>`;
}

// ---------- Dispatch Console ----------
export function dispatchConsoleHTML(channels, dispatches, mode) {
  const rows = (channels || []).map(ch => {
    const armed = !!ch.armed;
    const sentRecently = ch.last_sent && (Date.now() - new Date(ch.last_sent.replace(' ', 'T') + 'Z').getTime()) < 10 * 60_000;
    const btnClass = !armed ? 'standby' : sentRecently ? 'sent' : 'ready';
    const btnLabel = !armed ? 'STANDBY' : sentRecently ? '✓ SENT' : 'DISPATCH';
    const stat = ch.sent_last_hour ? `${ch.sent_last_hour}× / 1h · ${fmtK(ch.reached_last_hour)} reached` : `~${fmtInt(ch.reach)} reach`;
    const icon = { cell: 'broadcast', sms: 'sms', ble: 'mesh', app: 'bell' }[ch.id] || 'bell';
    return `
      <div class="dispatch-row">
        <div class="dispatch-icon" style="${ch.id === 'ble' ? 'color:var(--violet);background:rgba(177,140,255,.08)' : ''}">${svgIcon(icon, { size: 16 })}</div>
        <div>
          <div class="dispatch-label">${escapeHTML(ch.label)}</div>
          <div class="dispatch-meta">${escapeHTML(ch.desc)} · ${stat}</div>
        </div>
        <button class="dispatch-btn ${btnClass}" data-dispatch-id="${ch.id}" ${!armed ? 'disabled' : ''}>${btnLabel}</button>
      </div>`;
  }).join('');

  const history = (dispatches || []).slice(0, 6).map(d => `
    <div class="dispatch-log-row">
      <span class="dl-chan mono">${d.channel.toUpperCase()}</span>
      <span class="dl-msg" title="${escapeHTML(d.message)}">${escapeHTML(d.message)}</span>
      <span class="dl-reach mono">${fmtK(d.reach)}</span>
      <span class="dl-time mono" data-ts="${d.created_at}">${relTime(d.created_at)}</span>
    </div>`).join('') || `<div class="empty-note mono">NO DISPATCHES YET</div>`;

  const body = rows + `
    <div class="dispatch-all-row">
      <button class="ghost-btn mono ${mode === 'severe' ? 'danger' : ''}" id="dispatch-all" ${mode !== 'severe' ? 'disabled' : ''}>${svgIcon('broadcast', { size: 11 })} DISPATCH ALL CHANNELS</button>
    </div>
    <div class="panel-footer">
      <div class="dl-title mono">DISPATCH LOG</div>
      <div class="dispatch-log">${history}</div>
    </div>`;
  const right = `<span class="mono" style="font-size:10px;color:${mode === 'severe' ? 'var(--danger)' : 'var(--ink-mute)'}">${mode === 'severe' ? '● ARMED' : '○ STANDBY'}</span>`;
  return panelWrap('MULTI-CHANNEL DISPATCH', 'ACT', right, body);
}

// ---------- KPI Strip ----------
export function kpiStripHTML(kpis, mode) {
  const storm = mode === 'severe';
  const k = kpis || {};
  const cells = [
    { label: 'ACTIVE SENSORS', value: fmtInt(k.active_sensors), unit: `/${fmtInt(k.total_sensors)}`, color: 'var(--accent)' },
    { label: 'MODEL CONFIDENCE', value: Number(k.model_confidence || 0).toFixed(1), unit: '%', color: 'var(--accent-2)' },
    { label: 'NOWCAST HORIZON', value: k.nowcast_horizon ?? 45, unit: 'min', color: 'var(--accent)' },
    { label: 'POPULATION AT RISK', value: k.population_at_risk ? fmtK(k.population_at_risk) : '0', unit: '', color: k.population_at_risk ? 'var(--danger)' : 'var(--ink-dim)' },
    { label: 'ALERTS LAST HOUR', value: k.alerts_last_hour ?? 0, unit: '', color: k.alerts_last_hour ? 'var(--warn)' : 'var(--ink-dim)' },
    { label: 'DISPATCHES / 1H', value: k.dispatches_last_hour ?? 0, unit: '', color: k.dispatches_last_hour ? 'var(--violet)' : 'var(--ink-dim)' },
    { label: 'SYSTEM LATENCY', value: k.system_latency_s ?? '—', unit: 's', color: storm ? 'var(--warn)' : 'var(--accent)' },
  ];
  const html = cells.map(c => `
    <div class="kpi-cell">
      <div class="kpi-label">${c.label}</div>
      <div class="kpi-value-wrap">
        <span class="kpi-value" style="color:${c.color}">${c.value}</span>
        ${c.unit ? `<span class="kpi-unit">${c.unit}</span>` : ''}
      </div>
    </div>`).join('');
  return `<div class="kpi-strip" style="grid-template-columns:repeat(${cells.length}, 1fr)">${html}</div>`;
}

// ---------- Time Scrubber ----------
export function scrubberHTML(t, playing, mode, timeline) {
  const storm = mode === 'severe';
  const rangeGradient = storm
    ? 'linear-gradient(90deg, rgba(255,180,71,0.4), rgba(255,45,85,0.4))'
    : 'linear-gradient(90deg, rgba(124,249,200,0.2), rgba(74,211,255,0.2))';
  return `
    <div class="scrubber">
      <button class="play-btn ${playing ? 'playing' : ''}" id="scrubber-play" aria-label="Play/pause">${svgIcon(playing ? 'pause' : 'play', { size: 14, stroke: 'currentColor' })}</button>
      <div class="scrubber-main">
        <div class="scrubber-top">
          <span class="scrubber-caption">NOWCAST TIMELINE · <span id="scrubber-readout">${timelineReadout(timeline, t)}</span></span>
          <span class="scrubber-value" id="scrubber-value-text">${scrubberValueText(t)}</span>
        </div>
        <div class="scrubber-spark" id="scrubber-spark">${sparklineSVG(timeline, storm)}</div>
        <div class="scrubber-track-wrap">
          <div class="scrubber-track-bg"></div>
          <div class="scrubber-now-marker"></div>
          <div class="scrubber-range" style="background:${rangeGradient}"></div>
          <input type="range" class="scrubber-input" id="scrubber-input" min="-30" max="60" step="1" value="${t}" aria-label="Nowcast timeline offset">
        </div>
        <div class="scrubber-ticks">
          <span>-30m</span><span>-15m</span><span class="now">NOW</span><span>+15m</span><span>+30m</span><span>+45m</span><span>+60m</span>
        </div>
      </div>
    </div>`;
}

export function scrubberValueText(t) {
  return t < 0 ? `${Math.abs(Math.round(t))}m PAST` : t === 0 ? 'NOW' : `+${Math.round(t)}m FORECAST`;
}

export function timelineReadout(timeline, t) {
  if (!timeline || !timeline.length) return '';
  const p = timeline.reduce((best, x) => Math.abs(x.offset_min - t) < Math.abs(best.offset_min - t) ? x : best, timeline[0]);
  return `${p.max_dbz} dBZ · ${p.rain_rate} mm/hr · FLOOD ${Math.round(p.flood_prob * 100)}%`;
}

function sparklineSVG(timeline, storm) {
  if (!timeline || !timeline.length) return '';
  const W = 600, H = 26;
  const xs = timeline.map(p => ((p.offset_min + 30) / 90) * W);
  const path = (key, max) => timeline.map((p, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${(H - (Math.min(max, p[key]) / max) * (H - 2) - 1).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">
    <path d="${path('flood_prob', 1)}" fill="none" stroke="${storm ? '#ff4757' : '#4ad3ff'}" stroke-width="1.5" opacity=".8"/>
    <path d="${path('max_dbz', 75)}" fill="none" stroke="#ffb347" stroke-width="1" opacity=".7" stroke-dasharray="3 2"/>
    <line x1="${W / 3}" y1="0" x2="${W / 3}" y2="${H}" stroke="#7cf9c8" stroke-width="1" opacity=".5"/>
  </svg>`;
}

// ---------- Village risk table ----------
export function villageTableHTML(villages) {
  const rows = (villages || []).map(v => {
    const color = RISK_COLOR[v.risk] || '#7cf9c8';
    return `
      <tr data-village="${v.slug}">
        <td><span class="risk-dot" style="background:${color};box-shadow:0 0 8px ${color}"></span><b>${escapeHTML(v.name)}</b><span class="vt-dist mono">${escapeHTML(v.district || '')}</span></td>
        <td class="mono">${fmtInt(v.population)}</td>
        <td class="mono">${v.elevation_m} m</td>
        <td class="mono" style="color:${color};font-weight:700">${v.risk}${v.risk_override ? ' <span class="vt-ovr" title="Operator override">OVR</span>' : ''}</td>
        <td class="mono">${v.active_alerts || 0}</td>
        <td>
          <select class="mini-select mono" data-override="${v.slug}" aria-label="Override risk for ${escapeHTML(v.name)}">
            <option value="" ${!v.risk_override ? 'selected' : ''}>AUTO</option>
            ${['RED', 'AMBER', 'YELLOW', 'GREEN'].map(r => `<option value="${r}" ${v.risk_override === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <a class="ghost-btn mono" href="/?demo=${v.slug}" target="_blank" rel="noopener" title="Open public page">${svgIcon('people', { size: 11 })}</a>
        </td>
      </tr>`;
  }).join('');
  return panelWrap('VILLAGE RISK REGISTER', 'ZONES', `<span class="mono" style="font-size:10px;color:var(--ink-mute)">${(villages || []).length} ZONES</span>`, `
    <table class="village-table">
      <thead><tr><th>Village</th><th>Population</th><th>Elev.</th><th>Risk</th><th>Alerts</th><th>Control</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`, 'village-panel');
}

// ---------- Audit log ----------
export function auditPanelHTML(entries) {
  const rows = (entries || []).map(e => `
    <div class="audit-row">
      <span class="mono audit-actor">${escapeHTML(e.actor)}</span>
      <span class="mono audit-action">${escapeHTML(e.action)}</span>
      <span class="audit-target mono">${escapeHTML(e.target || '')}</span>
      <span class="audit-time mono" data-ts="${e.created_at}">${relTime(e.created_at)}</span>
    </div>`).join('') || `<div class="empty-note mono">NO ENTRIES</div>`;
  return panelWrap('OPERATOR AUDIT TRAIL', 'LOG', '', `<div class="audit-list">${rows}</div>`);
}
