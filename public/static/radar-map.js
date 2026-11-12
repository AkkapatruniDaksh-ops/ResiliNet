// Real radar map: Leaflet + OpenStreetMap base + RainViewer radar frames (last ~2 h + 20 min nowcast, animated).
// Usage: const m = mountRadarMap(el, { lat, lon, zoom }); m.setPlace(lat, lon, risk, label); m.setReports([...]); m.destroy()

const RV_API = 'https://api.rainviewer.com/public/weather-maps.json';
export const RISK_COLOR = { RED: '#ff2d55', AMBER: '#ffb347', YELLOW: '#ffea55', GREEN: '#7cf9c8' };
export const REPORT_ICON = { flood: '🌊', heavy_rain: '🌧️', lightning: '⚡', wind: '💨', hail: '🧊', landslide: '⛰️', all_clear: '✅', other: '📍' };

export function mountRadarMap(container, { lat, lon, zoom = 8, interactive = true } = {}) {
  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="empty-note mono" style="margin:20px">MAP LIBRARY FAILED TO LOAD — CHECK YOUR CONNECTION</div>';
    return { setPlace() {}, setReports() {}, setRadarVisible() {}, invalidate() {}, destroy() {} };
  }
  container.innerHTML = `
    <div class="rm-map" style="position:absolute;inset:0"></div>
    <div class="radar-legend-bar">RAIN INTENSITY<div class="bar"></div><div class="lbls"><span>light</span><span>heavy</span></div></div>
    <div class="radar-ctl">
      <button class="rm-play" aria-label="Play radar animation">▶</button>
      <input class="rm-range" type="range" min="0" max="0" value="0" aria-label="Radar frame">
      <span class="radar-time rm-time">loading radar…</span>
    </div>`;
  const mapEl = container.querySelector('.rm-map');
  const map = L.map(mapEl, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive, tap: interactive }).setView([lat, lon], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap · radar © RainViewer' }).addTo(map);

  let frames = [], host = '', frameIdx = 0, playing = false, timer = null, destroyed = false, radarVisible = true;
  const layers = {};
  const playBtn = container.querySelector('.rm-play');
  const range = container.querySelector('.rm-range');
  const timeEl = container.querySelector('.rm-time');

  function radarLayer(frame) {
    if (!layers[frame.path]) {
      layers[frame.path] = L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`, { opacity: 0, zIndex: 400, tileSize: 256, maxNativeZoom: 7, maxZoom: 18 }).addTo(map);
    }
    return layers[frame.path];
  }
  function showFrame(i) {
    if (!frames.length) return;
    frameIdx = (i + frames.length) % frames.length;
    frames.forEach((f, k) => radarLayer(f).setOpacity(k === frameIdx && radarVisible ? 0.75 : 0));
    radarLayer(frames[(frameIdx + 1) % frames.length]); // preload next
    range.value = frameIdx;
    const f = frames[frameIdx];
    const t = new Date(f.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeEl.textContent = f.kind === 'nowcast' ? `${t} (forecast)` : t;
  }
  function setPlaying(p) {
    playing = p; playBtn.textContent = p ? '❚❚' : '▶'; playBtn.setAttribute('aria-label', p ? 'Pause radar animation' : 'Play radar animation');
    clearInterval(timer);
    if (p) timer = setInterval(() => showFrame(frameIdx + 1), 650);
  }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  range.addEventListener('input', () => { setPlaying(false); showFrame(Number(range.value)); });

  async function loadFrames() {
    try {
      const j = await (await fetch(RV_API)).json();
      host = j.host;
      const past = (j.radar?.past ?? []).slice(-8).map(f => ({ ...f, kind: 'past' }));
      const nowc = (j.radar?.nowcast ?? []).slice(0, 2).map(f => ({ ...f, kind: 'nowcast' }));
      frames = [...past, ...nowc];
      if (destroyed) return;
      range.max = Math.max(0, frames.length - 1);
      showFrame(Math.max(0, past.length - 1));
    } catch { timeEl.textContent = 'radar unavailable'; }
  }
  loadFrames();
  const refresh = setInterval(loadFrames, 5 * 60_000);

  let placeMarker = null;
  const reportLayer = L.layerGroup().addTo(map);
  return {
    map,
    setPlace(la, lo, risk = 'GREEN', label = '') {
      const color = RISK_COLOR[risk] || RISK_COLOR.GREEN;
      const icon = L.divIcon({ className: '', html: `<div class="place-marker" style="color:${color}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
      if (placeMarker) placeMarker.remove();
      placeMarker = L.marker([la, lo], { icon, title: label }).addTo(map);
      if (label) placeMarker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10] });
      map.setView([la, lo], map.getZoom(), { animate: true });
    },
    setReports(reports = []) {
      reportLayer.clearLayers();
      reports.forEach(r => {
        const icon = L.divIcon({ className: '', html: `<div class="report-marker">${REPORT_ICON[r.kind] || '📍'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
        const when = new Date(String(r.created_at).replace(' ', 'T') + 'Z').toLocaleString();
        L.marker([r.lat, r.lon], { icon }).addTo(reportLayer)
          .bindPopup(`<b>${String(r.kind || '').replace('_', ' ')}</b> · ${r.severity}<br>${r.note ? r.note + '<br>' : ''}<small>${r.place || ''} · ${when}</small>`);
      });
    },
    setRadarVisible(v) { radarVisible = v; showFrame(frameIdx); },
    invalidate() { map.invalidateSize(); },
    destroy() { destroyed = true; clearInterval(timer); clearInterval(refresh); map.remove(); },
  };
}
