// Thin fetch wrapper for the ResiliNet REST API.

const OPERATOR_KEY = 'resilinet.operator';

export function operatorId() {
  let id = localStorage.getItem(OPERATOR_KEY);
  if (!id) {
    id = 'OPS-' + String(Math.floor(Math.random() * 90) + 10);
    localStorage.setItem(OPERATOR_KEY, id);
  }
  return id;
}

async function request(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-operator': operatorId(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || (data && data.ok === false)) {
    const err = new Error((data && data.error) || `${method} ${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  state: () => request('GET', '/state'),
  setMode: (mode) => request('POST', '/state/mode', { mode }),
  tick: () => request('POST', '/state/tick'),
  sensors: () => request('GET', '/sensors'),
  readings: (metric, limit = 60) => request('GET', `/readings?metric=${encodeURIComponent(metric)}&limit=${limit}`),
  models: () => request('GET', '/models'),
  villages: () => request('GET', '/villages'),
  village: (slug) => request('GET', `/villages/${slug}`),
  overrideVillage: (slug, risk) => request('PATCH', `/villages/${slug}`, { risk_override: risk }),
  alerts: (status = 'open', limit = 50) => request('GET', `/alerts?status=${status}&limit=${limit}`),
  createAlert: (payload) => request('POST', '/alerts', payload),
  ackAlert: (id) => request('POST', `/alerts/${id}/ack`),
  resolveAlert: (id) => request('POST', `/alerts/${id}/resolve`),
  channels: () => request('GET', '/dispatch/channels'),
  dispatches: (limit = 20) => request('GET', `/dispatch?limit=${limit}`),
  dispatch: (channel, alert_id, message) => request('POST', '/dispatch', { channel, alert_id, message }),
  nowcast: () => request('GET', '/nowcast'),
  nowcastHistory: (limit = 60) => request('GET', `/nowcast/history?limit=${limit}`),
  citizen: (slug) => request('GET', `/citizen/${slug}`),
  audit: (limit = 40) => request('GET', `/audit?limit=${limit}`),
};

// ---------- formatting helpers ----------
export function parseTs(ts) {
  if (!ts) return null;
  if (ts.includes('T')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
}

export function relTime(ts, now = Date.now()) {
  const d = parseTs(ts);
  if (!d) return '';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtInt(n) {
  return Number(n || 0).toLocaleString('en-IN');
}

export function fmtK(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- toasts ----------
export function toast(message, kind = 'info', ms = 3200) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
