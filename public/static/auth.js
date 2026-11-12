// Login / create-account page: forms + animated storm visual on the left.
import { toast } from './api.js';

const wrap = document.getElementById('auth-form-wrap');
const params = new URLSearchParams(location.search);
let mode = params.get('mode') === 'login' ? 'login' : 'register';
const next = params.get('next') || '/account';

const COUNTRIES = [['+91', '🇮🇳 +91'], ['+977', '🇳🇵 +977'], ['+880', '🇧🇩 +880'], ['+94', '🇱🇰 +94'], ['+92', '🇵🇰 +92'], ['+1', '🇺🇸 +1'], ['+44', '🇬🇧 +44'], ['+61', '🇦🇺 +61'], ['+234', '🇳🇬 +234'], ['+63', '🇵🇭 +63'], ['+62', '🇮🇩 +62'], ['+971', '🇦🇪 +971']];

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ok === false) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

const GOOGLE = `<svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>`;
const APPLE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.8 1.3 10.3.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.4-.8s2 .8 3.4.8c1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.2zM14.3 5c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z"/></svg>`;

function render() {
  document.getElementById('auth-tagline').innerHTML = mode === 'register'
    ? 'Warned before the storm,<br>safe when it arrives.'
    : 'Welcome back.<br>Your places are being watched.';
  wrap.innerHTML = mode === 'register' ? registerHTML() : loginHTML();
  bind();
}

function registerHTML() {
  return `
    <h1 class="auth-title">Create an account</h1>
    <p class="auth-sub">Already have an account? <a href="#" data-switch="login">Log in</a></p>
    <form id="auth-form" novalidate>
      <div id="auth-error" class="auth-error hidden" role="alert"></div>
      <div class="auth-grid">
        <input class="auth-input" name="first_name" placeholder="First name" autocomplete="given-name" required>
        <input class="auth-input" name="last_name" placeholder="Last name" autocomplete="family-name">
      </div>
      <input class="auth-input" name="email" type="email" placeholder="Email" autocomplete="email" required style="margin-top:10px">
      <div class="phone-row" style="margin-top:10px">
        <select name="default_country" aria-label="Country code">${COUNTRIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        <input class="auth-input" name="phone" type="tel" placeholder="Mobile number (for SMS & calls)" autocomplete="tel-national">
      </div>
      <div class="auth-hint">We'll send SMS and phone-call warnings to this number. You can add it later.</div>
      <div class="auth-field" style="margin-top:10px">
        <input class="auth-input" name="password" type="password" placeholder="Enter your password (8+ characters)" autocomplete="new-password" required minlength="8">
        <button type="button" class="eye" data-eye aria-label="Show password">👁</button>
      </div>
      <label class="auth-check" style="margin-top:12px"><input type="checkbox" name="accept_terms" checked> I agree to the <a href="/help#help-disclaimer" target="_blank">Terms &amp; Conditions</a></label>
      <button class="auth-btn" type="submit" style="margin-top:14px">Create account</button>
    </form>
    <div class="auth-or">Or register with</div>
    <div class="auth-social">
      <button type="button" data-social="google">${GOOGLE} Google</button>
      <button type="button" data-social="apple">${APPLE} Apple</button>
    </div>
    <div class="auth-benefits">
      <div class="auth-benefit">📱 <span><b>SMS &amp; phone-call warnings</b> when rain, floods, thunderstorms or strong winds are expected near your saved places.</span></div>
      <div class="auth-benefit">🌍 <span><b>Anywhere in the world</b> — home, work, family — up to 10 places.</span></div>
      <div class="auth-benefit">🔒 <span>Free. No spam. Your number is used only for weather warnings.</span></div>
    </div>`;
}

function loginHTML() {
  return `
    <h1 class="auth-title">Log in</h1>
    <p class="auth-sub">New here? <a href="#" data-switch="register">Create an account</a></p>
    <form id="auth-form" novalidate>
      <div id="auth-error" class="auth-error hidden" role="alert"></div>
      <input class="auth-input" name="email" type="email" placeholder="Email" autocomplete="email" required>
      <div class="auth-field" style="margin-top:10px">
        <input class="auth-input" name="password" type="password" placeholder="Password" autocomplete="current-password" required>
        <button type="button" class="eye" data-eye aria-label="Show password">👁</button>
      </div>
      <button class="auth-btn" type="submit" style="margin-top:14px">Log in</button>
    </form>
    <div class="auth-or">Or continue with</div>
    <div class="auth-social">
      <button type="button" data-social="google">${GOOGLE} Google</button>
      <button type="button" data-social="apple">${APPLE} Apple</button>
    </div>
    <div class="auth-benefits"><div class="auth-benefit">🔔 <span>Log in to manage the places you're warned about and see your SMS / call history.</span></div></div>`;
}

function bind() {
  wrap.querySelectorAll('[data-switch]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); mode = a.dataset.switch; history.replaceState(null, '', `/login?mode=${mode}${next !== '/account' ? '&next=' + encodeURIComponent(next) : ''}`); render(); }));
  wrap.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? '👁' : '🙈'; }));
  wrap.querySelectorAll('[data-social]').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.social === 'google') {
      location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
    } else {
      toast('Apple sign-in is not available yet. Please use email for now.', 'warn', 5000);
    }
  });
});
  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('auth-error'); err.classList.add('hidden');
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; const prev = btn.textContent; btn.textContent = mode === 'register' ? 'Creating…' : 'Logging in…';
    const data = Object.fromEntries(new FormData(form).entries());
    data.accept_terms = form.accept_terms ? form.accept_terms.checked : true;
    try {
      const j = await post(mode === 'register' ? '/api/auth/register' : '/api/auth/login', data);
      toast(mode === 'register' ? `Welcome, ${j.user.first_name}! Your account is ready.` : `Welcome back, ${j.user.first_name}!`, 'ok');
      setTimeout(() => { location.href = next; }, 500);
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = prev;
    }
  });
}

// ---------- animated storm visual (radar sweep + storm cells + rain + lightning over hills) ----------
function startVisual() {
  const cv = document.getElementById('auth-storm'); if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, drops = [], flash = 0, t = 0;
  const resize = () => { const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); W = r.width; H = r.height; drops = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: Math.random() * H, l: 8 + Math.random() * 14, v: 4 + Math.random() * 5 })); };
  resize(); window.addEventListener('resize', resize);
  const hills = (y0, amp, freq, phase) => { ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 6) ctx.lineTo(x, y0 - Math.abs(Math.sin(x * freq + phase)) * amp - Math.sin(x * freq * 2.7 + phase) * amp * .25); ctx.lineTo(W, H); ctx.closePath(); ctx.fill(); };
  const loop = () => {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * .7, H * .25, 10, W * .7, H * .25, W * .8); g.addColorStop(0, 'rgba(160,120,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (Math.random() < 0.006) flash = 1;
    if (flash > 0) { ctx.fillStyle = `rgba(220,210,255,${flash * .35})`; ctx.fillRect(0, 0, W, H); flash -= 0.08; }
    const cx = W * .5, cy = H * .46, R = Math.min(W, H) * .34;
    ctx.strokeStyle = 'rgba(124,249,200,.18)'; ctx.lineWidth = 1;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, R * k / 3, 0, Math.PI * 2); ctx.stroke(); }
    const ang = t * 1.2;
    if (ctx.createConicGradient) { const sw = ctx.createConicGradient(ang - 1.2, cx, cy); sw.addColorStop(0, 'rgba(124,249,200,0)'); sw.addColorStop(.85, 'rgba(124,249,200,0)'); sw.addColorStop(1, 'rgba(124,249,200,.35)'); ctx.fillStyle = sw; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(124,249,200,.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R); ctx.stroke();
    [[-.35, -.2, .28, 'rgba(255,45,85,.55)'], [-.2, -.05, .18, 'rgba(255,179,71,.55)'], [.3, .15, .2, 'rgba(74,211,255,.45)']].forEach(([dx, dy, r, col]) => { const px = cx + dx * R * 2, py = cy + dy * R * 2; const gg = ctx.createRadialGradient(px, py, 0, px, py, r * R); gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px, py, r * R, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#1c1838'; hills(H * .78, 70, 0.012, 1.2);
    ctx.fillStyle = '#120f26'; hills(H * .86, 50, 0.018, 3.1);
    ctx.fillStyle = '#0a0916'; hills(H * .94, 30, 0.025, 0.4);
    ctx.strokeStyle = 'rgba(200,190,255,.35)'; ctx.lineWidth = 1;
    drops.forEach(d => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); ctx.stroke(); d.y += d.v; d.x -= .6; if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 40); } });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

fetch('/api/auth/me').then(r => r.json()).then(j => { if (j.user && !params.get('force')) location.href = next; }).catch(() => {});
render();
