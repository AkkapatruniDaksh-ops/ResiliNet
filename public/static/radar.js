// Radar canvas — simulated NEXRAD polar sweep with NWS reflectivity palette.
// Vanilla JS port of src/radar.jsx. Not real data, but visually faithful:
// azimuth sweep, range rings, dBZ blobs, storm cells.

export const NWS_RAMP = [
  [5, 0, 236, 236],
  [10, 1, 160, 246],
  [15, 0, 0, 246],
  [20, 0, 255, 0],
  [25, 0, 200, 0],
  [30, 0, 144, 0],
  [35, 255, 255, 0],
  [40, 231, 192, 0],
  [45, 255, 144, 0],
  [50, 255, 0, 0],
  [55, 214, 0, 0],
  [60, 192, 0, 0],
  [65, 255, 0, 255],
  [70, 153, 85, 201],
  [75, 255, 255, 255],
];

export function dbzColor(v) {
  if (v < 5) return null;
  for (let i = NWS_RAMP.length - 1; i >= 0; i--) {
    if (v >= NWS_RAMP[i][0]) {
      const [, r, g, b] = NWS_RAMP[i];
      return `rgb(${r},${g},${b})`;
    }
  }
  return null;
}

// A storm "cell" — gaussian-ish blob in radar-relative km space.
function makeCells(seed = 1, storm = false) {
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const base = [
    { x: -18, y: 22, r: 14, peak: 38, vx: 0.9, vy: -0.2 },
    { x: 25, y: -12, r: 18, peak: 44, vx: -0.6, vy: 0.5 },
    { x: -30, y: -28, r: 10, peak: 32, vx: 0.2, vy: 0.8 },
    { x: 45, y: 35, r: 8, peak: 28, vx: -0.3, vy: -0.4 },
  ];
  if (storm) {
    base.push({ x: -45, y: -38, r: 22, peak: 68, vx: 1.4, vy: 1.1, severe: true });
    base.push({ x: -38, y: -30, r: 16, peak: 58, vx: 1.4, vy: 1.1 });
  }
  return base.map(c => ({ ...c, phase: rand() * 6.28 }));
}

function drawRadar(ctx, W, H, opts) {
  const { t, cells, sweepAngle, showRings = true, showTerrain = true } = opts;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 8;
  const kmPerPx = 120 / R;

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  bg.addColorStop(0, '#040808');
  bg.addColorStop(1, '#020404');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

  if (showTerrain) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#3a5a55'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      const y = cy - R * 0.6 + i * 20;
      ctx.moveTo(cx - R, y);
      for (let x = -R; x <= R; x += 6) {
        const n = Math.sin((x + i * 30) * 0.03) * 4 + Math.sin(x * 0.11 + i) * 3;
        ctx.lineTo(cx + x, y + n);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  cells.forEach(c => {
    const dt = t;
    const px = cx + (c.x + c.vx * dt) / kmPerPx;
    const py = cy + (c.y + c.vy * dt) / kmPerPx;
    const pr = c.r / kmPerPx;
    const steps = 8;
    for (let i = steps; i >= 1; i--) {
      const frac = i / steps;
      const dbz = 5 + (c.peak - 5) * (1 - frac);
      const col = dbzColor(dbz);
      if (!col) continue;
      const rr = pr * frac * (1 + 0.06 * Math.sin(t * 1.4 + c.phase + i));
      const g = ctx.createRadialGradient(px, py, rr * 0.2, px, py, rr);
      g.addColorStop(0, col);
      g.addColorStop(0.7, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(px, py, rr * 1.15, rr * 0.9, c.phase, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  if (showRings) {
    ctx.strokeStyle = 'rgba(124,249,200,0.18)';
    ctx.lineWidth = 1;
    for (let km = 30; km <= 120; km += 30) {
      ctx.beginPath(); ctx.arc(cx, cy, km / kmPerPx, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.fillStyle = 'rgba(124,249,200,0.5)';
    ctx.font = '10px JetBrains Mono, monospace';
    for (let km = 30; km <= 120; km += 30) {
      ctx.fillText(`${km}km`, cx + km / kmPerPx + 3, cy - 3);
    }
    ctx.fillStyle = 'rgba(230,237,245,0.6)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText('N', cx - 4, cy - R + 12);
    ctx.fillText('S', cx - 4, cy + R - 4);
    ctx.fillText('E', cx + R - 12, cy + 4);
    ctx.fillText('W', cx - R + 4, cy + 4);
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (typeof ctx.createConicGradient === 'function') {
    try {
      const sweepW = 0.28;
      const g2 = ctx.createConicGradient(sweepAngle, cx, cy);
      g2.addColorStop(0, 'rgba(124,249,200,0.35)');
      g2.addColorStop(sweepW / (Math.PI * 2), 'rgba(124,249,200,0)');
      g2.addColorStop(1, 'rgba(124,249,200,0)');
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();
    } catch (e) { /* fall through to wedge */ }
  } else {
    ctx.fillStyle = 'rgba(124,249,200,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, sweepAngle - 0.35, sweepAngle);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(124,249,200,0.95)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepAngle) * R, cy + Math.sin(sweepAngle) * R);
  ctx.stroke();

  ctx.fillStyle = '#7cf9c8';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(124,249,200,0.6)';
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();

  ctx.strokeStyle = 'rgba(124,249,200,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
}

// Mounts a self-animating radar canvas into `container`.
// Returns a controller object { update(props), destroy() }.
export function mountRadarCanvas(container, initialProps) {
  const size = initialProps.size || 340;
  const canvas = document.createElement('canvas');
  canvas.className = 'radar-canvas';
  container.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const props = { ...initialProps };
  let cells = makeCells(3, props.storm);
  let rafId = 0;
  let mounted = true;

  const loop = (now) => {
    if (!mounted) return;
    const t = props.timeOffset;
    const sweepAngle = props.playing ? (now / 1000) * 1.1 : 0;
    try {
      drawRadar(ctx, size, size, {
        t, cells, sweepAngle,
        showRings: props.showRings, showTerrain: props.showTerrain,
      });
    } catch (e) { console.error('radar draw', e); }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return {
    update(next) {
      const stormChanged = next.storm !== undefined && next.storm !== props.storm;
      Object.assign(props, next);
      if (stormChanged) cells = makeCells(3, props.storm);
    },
    destroy() {
      mounted = false;
      cancelAnimationFrame(rafId);
      canvas.remove();
    },
  };
}

// Reflectivity legend — returns HTML string.
export function reflectivityLegendHTML() {
  const rows = [...NWS_RAMP].reverse().map(([v, r, g, b]) => `
    <div class="legend-row">
      <div class="legend-swatch" style="background:rgb(${r},${g},${b})"></div>
      <span class="legend-val">${v}</span>
    </div>`).join('');
  return `<div class="legend-col"><div class="legend-title">dBZ</div>${rows}</div>`;
}
