// Hazard map — stylized Langtang / Nepal region with terrain contours,
// storm cell overlay, predicted path, sensor nodes, and villages at risk.
// Vanilla JS port of src/hazard-map.jsx.

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_VILLAGES = (storm) => [
  { x: 420, y: 310, name: 'Syabrubesi', risk: storm ? 'RED' : 'AMBER' },
  { x: 560, y: 380, name: 'Dhunche', risk: storm ? 'RED' : 'YELLOW' },
  { x: 640, y: 280, name: 'Kalikasthan', risk: storm ? 'AMBER' : 'GREEN' },
  { x: 300, y: 250, name: 'Langtang', risk: storm ? 'AMBER' : 'GREEN' },
  { x: 200, y: 390, name: 'Trishuli', risk: storm ? 'AMBER' : 'GREEN' },
];

const WORLD_W = 740, WORLD_H = 680;

// Scales the fixed world-space scene to whatever canvas size we were given.
function draw(ctx, W, H, opts) {
  const sx = W / WORLD_W, sy = H / WORLD_H;
  ctx.save();
  ctx.scale(sx, sy);
  drawWorld(ctx, WORLD_W, WORLD_H, { ...opts, fontScale: 1 / Math.min(sx, sy) });
  ctx.restore();
}

function drawWorld(ctx, W, H, { t, storm, layers, villages: villageData, fontScale = 1 }) {
  const fs = (px) => `${Math.round(px * fontScale)}px`;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070d10');
  bg.addColorStop(1, '#04080a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(124,249,200,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const rnd = mulberry32(7);
  const peaks = [];
  for (let i = 0; i < 9; i++) {
    peaks.push({
      cx: 80 + i * 90 + rnd() * 30,
      cy: 140 + Math.sin(i * 1.3) * 80 + rnd() * 40,
      r: 60 + rnd() * 80,
      h: 0.6 + rnd() * 0.4,
    });
  }
  ctx.save();
  peaks.forEach(p => {
    for (let k = 1; k <= 6; k++) {
      const a = k / 6;
      ctx.strokeStyle = `rgba(90,140,130,${0.08 + (1 - a) * 0.16})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(p.cx, p.cy, p.r * a, p.r * a * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.restore();

  const rivers = [
    [[40, 80], [180, 150], [320, 230], [460, 300], [600, 380], [740, 470]],
    [[120, 40], [240, 120], [360, 190], [500, 270]],
    [[500, 60], [560, 180], [600, 280], [640, 380]],
  ];
  ctx.strokeStyle = 'rgba(74,211,255,0.55)';
  ctx.lineWidth = 2;
  rivers.forEach(pts => {
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.quadraticCurveTo(x1, y1, mx, my);
    }
    ctx.lineTo(...pts[pts.length - 1]);
    ctx.stroke();
  });

  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255,180,80,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 60); ctx.bezierCurveTo(200, 20, 500, 90, W, 40);
  ctx.stroke();
  ctx.setLineDash([]);

  if (layers.flood) {
    ctx.save();
    const grd = ctx.createLinearGradient(0, 150, W, H);
    grd.addColorStop(0, 'rgba(74,211,255,0.0)');
    grd.addColorStop(0.5, storm ? 'rgba(255,71,87,0.22)' : 'rgba(74,211,255,0.12)');
    grd.addColorStop(1, storm ? 'rgba(255,71,87,0.35)' : 'rgba(74,211,255,0.22)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, 180);
    ctx.bezierCurveTo(180, 150, 360, 220, 500, 280);
    ctx.bezierCurveTo(620, 320, 720, 420, W, 440);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (layers.rain) {
    const baseX = storm ? 100 : 240;
    const baseY = storm ? 380 : 300;
    const vx = storm ? 3.6 : 1.2;
    const vy = storm ? -2.4 : -0.6;
    const cx = baseX + vx * t;
    const cy = baseY + vy * t;

    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,71,87,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let m = 0; m <= 60; m += 5) {
      const x = baseX + vx * (t + m * 0.1);
      const y = baseY + vy * (t + m * 0.1);
      if (m === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,71,87,0.9)';
    ctx.font = `${fs(10)} JetBrains Mono, monospace`;
    for (const m of [15, 30, 45, 60]) {
      const x = baseX + vx * (t + m * 0.1);
      const y = baseY + vy * (t + m * 0.1);
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(`+${m}m`, x + 5, y - 3);
    }
    ctx.restore();

    const layers2 = storm
      ? [{ r: 130, c: 'rgba(0,236,236,0.10)' }, { r: 105, c: 'rgba(0,255,0,0.14)' }, { r: 80, c: 'rgba(255,255,0,0.22)' }, { r: 55, c: 'rgba(255,144,0,0.32)' }, { r: 35, c: 'rgba(255,0,0,0.5)' }, { r: 18, c: 'rgba(255,0,255,0.7)' }]
      : [{ r: 80, c: 'rgba(0,236,236,0.10)' }, { r: 55, c: 'rgba(0,255,0,0.14)' }, { r: 32, c: 'rgba(255,255,0,0.22)' }];
    layers2.forEach(l => {
      ctx.fillStyle = l.c;
      ctx.beginPath(); ctx.arc(cx, cy, l.r + Math.sin(t * 3 + l.r) * 2, 0, Math.PI * 2); ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + vx * 8, cy + vy * 8);
    ctx.stroke();
    const ang = Math.atan2(vy, vx);
    ctx.beginPath();
    ctx.moveTo(cx + vx * 8, cy + vy * 8);
    ctx.lineTo(cx + vx * 8 - Math.cos(ang - 0.4) * 8, cy + vy * 8 - Math.sin(ang - 0.4) * 8);
    ctx.moveTo(cx + vx * 8, cy + vy * 8);
    ctx.lineTo(cx + vx * 8 - Math.cos(ang + 0.4) * 8, cy + vy * 8 - Math.sin(ang + 0.4) * 8);
    ctx.stroke();
  }

  if (layers.lightning && storm) {
    const baseX = 100 + 3.6 * t, baseY = 380 - 2.4 * t;
    const strikeRnd = Math.floor(t * 4);
    const sr = mulberry32(strikeRnd);
    for (let i = 0; i < 3; i++) {
      const sx = baseX + (sr() - 0.5) * 80;
      const sy = baseY + (sr() - 0.5) * 80;
      ctx.strokeStyle = 'rgba(255,255,180,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 24);
      let x = sx, y = sy - 24;
      for (let k = 0; k < 5; k++) { x += (sr() - 0.5) * 10; y += 6; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,180,0.25)';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  if (layers.wind) {
    ctx.strokeStyle = 'rgba(230,237,245,0.35)';
    ctx.lineWidth = 1;
    for (let x = 40; x < W; x += 80) {
      for (let y = 60; y < H; y += 60) {
        const ang = Math.sin(x * 0.01 + t * 0.5) + Math.cos(y * 0.01);
        const len = 12 + Math.sin(t + x * 0.02) * 3;
        const x2 = x + Math.cos(ang) * len;
        const y2 = y + Math.sin(ang) * len;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  const sensors = [
    { x: 180, y: 220, label: 'RDR-01' },
    { x: 340, y: 180, label: 'CAM-14' },
    { x: 520, y: 260, label: 'IoT-42' },
    { x: 640, y: 340, label: 'CAM-08' },
    { x: 260, y: 340, label: 'IoT-19' },
    { x: 460, y: 400, label: 'IoT-27' },
  ];
  sensors.forEach(s => {
    ctx.fillStyle = '#7cf9c8';
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(124,249,200,0.4)';
    const pulse = (t * 2 + s.x) % 2;
    ctx.globalAlpha = Math.max(0, 1 - pulse / 2);
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5 + pulse * 10, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(230,237,245,0.55)';
    ctx.font = `${fs(9)} JetBrains Mono, monospace`;
    ctx.fillText(s.label, s.x + 7, s.y + 3);
  });

  const villages = (villageData && villageData.length)
    ? villageData.map(v => ({ x: v.map_x, y: v.map_y, name: v.name, risk: v.risk }))
    : DEFAULT_VILLAGES(storm);
  villages.forEach(v => {
    const color = { RED: '#ff2d55', AMBER: '#ffb347', YELLOW: '#ffea55', GREEN: '#7cf9c8' }[v.risk];
    ctx.fillStyle = color;
    ctx.beginPath();
    const d = 5 * fontScale;
    ctx.moveTo(v.x, v.y - d);
    ctx.lineTo(v.x + d, v.y);
    ctx.lineTo(v.x, v.y + d);
    ctx.lineTo(v.x - d, v.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = `${fs(10)} Space Grotesk, sans-serif`;
    const tw = ctx.measureText(v.name).width + 10 * fontScale;
    const th = 14 * fontScale;
    ctx.fillStyle = 'rgba(13,18,24,0.85)';
    ctx.fillRect(v.x + 8, v.y - th / 2, tw, th);
    ctx.strokeStyle = 'rgba(124,249,200,0.15)';
    ctx.strokeRect(v.x + 8, v.y - th / 2, tw, th);
    ctx.fillStyle = '#e6edf5';
    ctx.fillText(v.name, v.x + 8 + 5 * fontScale, v.y + 4 * fontScale);
  });

  ctx.fillStyle = 'rgba(230,237,245,0.7)';
  ctx.font = `${fs(10)} JetBrains Mono, monospace`;
  ctx.fillText('▲ N', W - 38 * fontScale, 22 * fontScale);
  ctx.fillText('0        10km', W - 100 * fontScale, H - 18 * fontScale);
  ctx.strokeStyle = 'rgba(230,237,245,0.7)';
  const f = fontScale;
  ctx.lineWidth = f;
  ctx.beginPath(); ctx.moveTo(W - 100 * f, H - 12 * f); ctx.lineTo(W - 40 * f, H - 12 * f); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 100 * f, H - 14 * f); ctx.lineTo(W - 100 * f, H - 10 * f); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(W - 40 * f, H - 14 * f); ctx.lineTo(W - 40 * f, H - 10 * f); ctx.stroke();

  ctx.fillStyle = 'rgba(230,237,245,0.5)';
  ctx.font = `${fs(10)} JetBrains Mono, monospace`;
  ctx.fillText('28.2108° N   85.3234° E   LANGTANG BASIN', 12 * fontScale, H - 14 * fontScale);
}

// Mounts a self-animating hazard-map canvas into `container`.
export function mountHazardMap(container, initialProps) {
  const W = initialProps.W || 370;
  const H = initialProps.H || 340;
  const canvas = document.createElement('canvas');
  canvas.className = 'hazard-canvas';
  container.appendChild(canvas);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const props = { ...initialProps };
  let rafId = 0;
  let mounted = true;
  const startT = performance.now();

  const loop = (now) => {
    if (!mounted) return;
    const t = props.timeOffset + (props.playing ? ((now - startT) / 1000) * 0.6 : 0);
    try { draw(ctx, W, H, { t, storm: props.storm, layers: props.layers, villages: props.villages }); }
    catch (e) { console.error('hazard map draw', e); }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return {
    update(next) { Object.assign(props, next); },
    destroy() { mounted = false; cancelAnimationFrame(rafId); canvas.remove(); },
  };
}
