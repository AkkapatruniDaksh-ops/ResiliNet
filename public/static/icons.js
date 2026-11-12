// Stroke-based icon set — vanilla JS port of src/icons.jsx.
// Each entry is either a single path "d" string, or an array of path "d" strings
// (for icons that need multiple sub-paths / a filled circle, etc).

const ICON_DEFS = {
  radar: { multi: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M12 12L20 6'], dot: true },
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  cloud: 'M7 18a4 4 0 1 1 .6-7.96A6 6 0 0 1 19 12a4 4 0 0 1-1 8H7z',
  drop: 'M12 3s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h9a2 2 0 1 1-2 2',
  wave: 'M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2',
  fog: 'M3 8h18M3 12h14M3 16h18M3 20h10',
  hail: { multi: ['M8 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M14 20a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M17 16a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3', 'M7 14a4 4 0 1 1 .6-7.96A6 6 0 0 1 19 8a4 4 0 0 1-1 8'] },
  alert: 'M12 3 2 21h20L12 3zM12 10v5M12 18h.01',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0',
  cpu: { multi: ['M4 4h16v16H4zM9 9h6v6H9z', 'M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3'] },
  broadcast: 'M4 12a8 8 0 0 1 2.34-5.66M20 12a8 8 0 0 0-2.34-5.66M7.76 9.76A4 4 0 0 1 12 8a4 4 0 0 1 4.24 1.76M12 12v10',
  sms: 'M4 5h16v11H8l-4 4V5z',
  mesh: { multi: ['M6 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M18 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4', 'M8 6h8M8 18h8M7.4 7.4 10.6 10.6M16.6 7.4 13.4 10.6M7.4 16.6 10.6 13.4M16.6 16.6 13.4 13.4'] },
  play: { d: 'M6 4l14 8-14 8V4z', fill: true },
  pause: { d: 'M7 4h4v16H7zM13 4h4v16h-4z', fill: true },
  circle: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8', fill: true },
  target: { multi: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10', 'M12 1v3M12 20v3M1 12h3M20 12h3'] },
  layers: 'M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5',
  chevronR: 'M9 6l6 6-6 6',
  chevronD: 'M6 9l6 6 6-6',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  eye: { multi: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'] },
  camera: { multi: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8'] },
  satellite: 'M4 20 20 4M9 3l6 6-4 4-6-6zM15 9l6 6-4 4-6-6M12 15a3 3 0 0 0-3 3M18 21a9 9 0 0 0-9-9',
  sensor: { multi: ['M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4', 'M8 8a5.66 5.66 0 0 0 0 8M16 8a5.66 5.66 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14'] },
  people: { multi: ['M9 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6', 'M3 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-4.9'] },
  mountain: 'M3 20 10 8l4 6 3-4 4 10z',
};

function svgIcon(name, { size = 16, stroke = 'currentColor', sw = 1.6, style = '' } = {}) {
  const def = ICON_DEFS[name];
  if (!def) return '';
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="${style}"`;
  if (typeof def === 'string') {
    return `<svg ${attrs} fill="none"><path d="${def}"/></svg>`;
  }
  if (def.multi) {
    const paths = def.multi.map(d => `<path d="${d}"/>`).join('');
    const dot = def.dot ? `<circle cx="12" cy="12" r="1.5" fill="${stroke}"/>` : '';
    return `<svg ${attrs} fill="none">${paths}${dot}</svg>`;
  }
  if (def.fill) {
    return `<svg ${attrs} fill="${stroke}" stroke="none"><path d="${def.d}"/></svg>`;
  }
  return '';
}

export { svgIcon, ICON_DEFS };
