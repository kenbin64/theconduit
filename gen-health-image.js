/* ============================================================================
 * Generate health-manifold.svg — a color-gradient image of system health.
 * X axis = supply adequacy (x), Y axis = integrity/quality (y),
 * every point colored by its health z = x·y using the EXACT app mapping.
 * Dependency-free: builds an SVG string and writes it. Run: node gen-health-image.js
 * ========================================================================== */
'use strict';
const fs = require('fs');

// ---- exact color mapping from manifold.js ----
function colorForHealth(z) {
  z = Math.max(0, Math.min(1, z));
  const hue = 130 * Math.pow(z, 1.15);
  const light = 38 + 14 * z;
  return `hsl(${hue.toFixed(0)}, 90%, ${light.toFixed(1)}%)`;
}
const TIERS = [
  { min: 0.80, label: 'Healthy' }, { min: 0.55, label: 'Watch' },
  { min: 0.35, label: 'Warning' }, { min: 0.18, label: 'Alarm' }, { min: 0.00, label: 'CRITICAL' }
];

// ---- geometry ----
const PX = 90, PY = 56, PW = 480, PH = 480;   // plot origin + size
const W = 760, H = 600;
const N = 64, c = PW / N;                       // grid cells

const sx = (x) => PX + x * PW;                  // supply 0..1 → px
const sy = (y) => PY + (1 - y) * PH;            // integrity 0..1 → px (inverted)

let cells = '';
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const x = (i + 0.5) / N, y = (j + 0.5) / N;
    const px = PX + i * c, py = PY + (N - 1 - j) * c;
    cells += `<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${(c + 0.6).toFixed(2)}" height="${(c + 0.6).toFixed(2)}" fill="${colorForHealth(x * y)}"/>`;
  }
}

// tier-boundary contours: z = x·y = k → y = k/x (a hyperbola)
let contours = '';
[0.80, 0.55, 0.35, 0.18].forEach((k) => {
  let pts = [];
  for (let t = 0; t <= 100; t++) {
    const x = k + (1 - k) * (t / 100);          // x runs from k..1 (where y=k/x ≤ 1)
    const y = k / x;
    if (y >= 0 && y <= 1) pts.push(`${sx(x).toFixed(1)},${sy(y).toFixed(1)}`);
  }
  const mid = pts[Math.floor(pts.length / 2)].split(',');
  contours += `<polyline points="${pts.join(' ')}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.1" stroke-dasharray="4 3"/>`;
  contours += `<text x="${mid[0]}" y="${(+mid[1] - 4).toFixed(1)}" fill="#fff" font-size="11" font-family="ui-monospace,monospace" text-anchor="middle" opacity=".85">z=${k.toFixed(2)}</text>`;
});

// legend swatches at representative z per tier
const reps = [['Healthy', 0.90], ['Watch', 0.67], ['Warning', 0.45], ['Alarm', 0.26], ['Critical', 0.09]];
let legend = '';
reps.forEach(([lbl, z], i) => {
  const lx = PX + i * 96;
  legend += `<rect x="${lx}" y="${PY + PH + 44}" width="16" height="16" rx="3" fill="${colorForHealth(z)}"/>`;
  legend += `<text x="${lx + 22}" y="${PY + PH + 56}" fill="#c2d4e8" font-size="12" font-family="Segoe UI,system-ui,sans-serif">${lbl}</text>`;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI,system-ui,sans-serif">
  <rect width="${W}" height="${H}" fill="#070b12"/>
  <text x="${PX}" y="34" fill="#ffcf4a" font-size="20" font-weight="700">System health manifold <tspan fill="#3fd0ff" font-family="ui-monospace,monospace">z = x · y</tspan></text>
  <g shape-rendering="crispEdges">${cells}</g>
  <rect x="${PX}" y="${PY}" width="${PW}" height="${PH}" fill="none" stroke="#1f2e42"/>
  ${contours}
  <!-- axes -->
  <text x="${PX + PW / 2}" y="${PY + PH + 30}" fill="#8195ad" font-size="13" text-anchor="middle">Supply adequacy (x) →</text>
  <text x="${PX - 34}" y="${PY + PH / 2}" fill="#8195ad" font-size="13" text-anchor="middle" transform="rotate(-90 ${PX - 34} ${PY + PH / 2})">Integrity / quality (y) →</text>
  <text x="${PX}" y="${PY + PH + 16}" fill="#5d7f9c" font-size="11">0</text>
  <text x="${PX + PW}" y="${PY + PH + 16}" fill="#5d7f9c" font-size="11" text-anchor="end">1</text>
  <text x="${PX - 14}" y="${PY + PH}" fill="#5d7f9c" font-size="11" text-anchor="end">0</text>
  <text x="${PX - 14}" y="${PY + 10}" fill="#5d7f9c" font-size="11" text-anchor="end">1</text>
  ${legend}
  <text x="${PX}" y="${H - 12}" fill="#5d7f9c" font-size="11">Health is multiplicative: one failing axis collapses the whole. Same spectrum used live across every station.</text>
</svg>`;

fs.writeFileSync(__dirname + '/health-manifold.svg', svg);
console.log('wrote health-manifold.svg  (' + svg.length + ' bytes, ' + (N * N) + ' cells)');
