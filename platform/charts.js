/* ============================================================================
 * HydroManifold Platform — Charts (dependency-free SVG)
 * ----------------------------------------------------------------------------
 * The graphing mechanism: line, bars, histogram, sparkline, donut. Each returns
 * an SVG string sized to the requested box, themed to the platform palette. No
 * external library — charts render by opening the page. Robust to empty/constant
 * data (degenerate inputs produce a flat, labelled chart rather than NaN paths).
 * ========================================================================== */
(function (root) {
  'use strict';
  const PAL = ['#3fd0ff', '#ffcf4a', '#27e07a', '#ff7a2f', '#9b8cff', '#ff6a9c'];
  const AX = '#1f2e42', GRID = '#13202f', TXT = '#8195ad';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = (v) => (v == null || isNaN(v)) ? '—' : (Math.abs(v) >= 100 ? Math.round(v).toString() : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2));
  function extent(arr) { let lo = Infinity, hi = -Infinity; arr.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; }); if (!isFinite(lo)) { lo = 0; hi = 1; } if (lo === hi) { lo -= 1; hi += 1; } return [lo, hi]; }

  // multi-series line chart. series: [{name,color?,data:[numbers]}], opts {w,h,labels,unit}
  function line(series, opts) {
    opts = opts || {}; const w = opts.w || 520, h = opts.h || 180, pl = 44, pr = 12, pt = 12, pb = 22;
    const iw = w - pl - pr, ih = h - pt - pb;
    series = (series || []).filter((s) => s && s.data && s.data.length);
    if (!series.length) return empty(w, h, 'no data yet');
    const all = series.reduce((a, s) => a.concat(s.data), []);
    const [lo, hi] = extent(all); const n = Math.max(...series.map((s) => s.data.length));
    const X = (i, len) => pl + (len <= 1 ? iw : iw * i / (len - 1));
    const Y = (v) => pt + ih - ih * (v - lo) / (hi - lo);
    let g = '';
    for (let k = 0; k <= 4; k++) { const yy = pt + ih * k / 4; const val = hi - (hi - lo) * k / 4; g += `<line x1="${pl}" y1="${yy.toFixed(1)}" x2="${w - pr}" y2="${yy.toFixed(1)}" stroke="${GRID}"/><text x="${pl - 6}" y="${(yy + 3).toFixed(1)}" fill="${TXT}" font-size="9" text-anchor="end">${nf(val)}</text>`; }
    let paths = '';
    series.forEach((s, si) => {
      const col = s.color || PAL[si % PAL.length];
      const d = s.data.map((v, i) => (i ? 'L' : 'M') + X(i, s.data.length).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
      paths += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
      const lv = s.data[s.data.length - 1]; paths += `<circle cx="${X(s.data.length - 1, s.data.length).toFixed(1)}" cy="${Y(lv).toFixed(1)}" r="2.4" fill="${col}"/>`;
    });
    const lbls = (opts.labels && opts.labels.length) ? `<text x="${pl}" y="${h - 6}" fill="${TXT}" font-size="9">${esc(opts.labels[0])}</text><text x="${w - pr}" y="${h - 6}" fill="${TXT}" font-size="9" text-anchor="end">${esc(opts.labels[opts.labels.length - 1])}</text>` : '';
    const leg = series.length > 1 ? series.map((s, si) => `<tspan fill="${s.color || PAL[si % PAL.length]}"> ●</tspan><tspan fill="${TXT}"> ${esc(s.name || '')}</tspan>`).join('') : '';
    return svg(w, h, `${g}${paths}<line x1="${pl}" y1="${pt + ih}" x2="${w - pr}" y2="${pt + ih}" stroke="${AX}"/>${lbls}${leg ? `<text x="${pl}" y="10" font-size="9">${leg}</text>` : ''}${opts.unit ? `<text x="${w - pr}" y="10" fill="${TXT}" font-size="9" text-anchor="end">${esc(opts.unit)}</text>` : ''}`);
  }

  // bars. items:[{label,value,color?}], opts {w,h,unit,horizontal}
  function bars(items, opts) {
    opts = opts || {}; items = (items || []).filter((x) => x); const w = opts.w || 520, h = opts.h || 180;
    if (!items.length) return empty(w, h, 'no data');
    const max = Math.max(1, ...items.map((i) => Math.abs(i.value) || 0));
    if (opts.horizontal) {
      const pl = Math.min(150, Math.max(60, ...items.map((i) => (i.label || '').length * 6))), bh = Math.min(22, (h - 8) / items.length);
      let b = '';
      items.forEach((it, i) => { const y = 4 + i * bh; const bw = (w - pl - 50) * (Math.abs(it.value) || 0) / max; const col = it.color || PAL[i % PAL.length];
        b += `<text x="${pl - 6}" y="${(y + bh / 2 + 3).toFixed(1)}" fill="${TXT}" font-size="10" text-anchor="end">${esc(it.label)}</text><rect x="${pl}" y="${(y + 2).toFixed(1)}" width="${Math.max(0, bw).toFixed(1)}" height="${(bh - 4).toFixed(1)}" rx="2" fill="${col}"/><text x="${(pl + bw + 5).toFixed(1)}" y="${(y + bh / 2 + 3).toFixed(1)}" fill="${TXT}" font-size="9">${nf(it.value)}${opts.unit ? ' ' + esc(opts.unit) : ''}</text>`; });
      return svg(w, h, b);
    }
    const pl = 32, pb = 26, iw = w - pl - 12, ih = h - pb - 8, bw = iw / items.length;
    let b = '';
    items.forEach((it, i) => { const x = pl + i * bw; const bh2 = ih * (Math.abs(it.value) || 0) / max; const col = it.color || PAL[i % PAL.length];
      b += `<rect x="${(x + bw * 0.15).toFixed(1)}" y="${(8 + ih - bh2).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${Math.max(0, bh2).toFixed(1)}" rx="2" fill="${col}"/><text x="${(x + bw / 2).toFixed(1)}" y="${h - 14}" fill="${TXT}" font-size="9" text-anchor="middle">${esc(it.label)}</text><text x="${(x + bw / 2).toFixed(1)}" y="${(4 + ih - bh2).toFixed(1)}" fill="${TXT}" font-size="9" text-anchor="middle">${nf(it.value)}</text>`; });
    return svg(w, h, b + `<line x1="${pl}" y1="${8 + ih}" x2="${w - 12}" y2="${8 + ih}" stroke="${AX}"/>`);
  }

  // histogram (statistical distribution). values:[numbers], opts {bins,w,h,color,unit}
  function histogram(values, opts) {
    opts = opts || {}; const w = opts.w || 520, h = opts.h || 180; values = (values || []).filter((v) => typeof v === 'number' && !isNaN(v));
    if (!values.length) return empty(w, h, 'no data');
    const bins = opts.bins || 12; const [lo, hi] = extent(values); const span = (hi - lo) || 1; const counts = new Array(bins).fill(0);
    values.forEach((v) => { let b = Math.floor((v - lo) / span * bins); if (b >= bins) b = bins - 1; if (b < 0) b = 0; counts[b]++; });
    const items = counts.map((cnt, i) => ({ label: i === 0 ? nf(lo) : i === bins - 1 ? nf(hi) : '', value: cnt, color: opts.color || PAL[0] }));
    return bars(items, { w, h, unit: 'count' });
  }

  // inline sparkline. values:[numbers], opts {w,h,color}
  function sparkline(values, opts) {
    opts = opts || {}; const w = opts.w || 90, h = opts.h || 22; values = (values || []).filter((v) => typeof v === 'number' && !isNaN(v));
    if (values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const [lo, hi] = extent(values); const col = opts.color || PAL[0];
    const d = values.map((v, i) => (i ? 'L' : 'M') + (w * i / (values.length - 1)).toFixed(1) + ' ' + (h - 2 - (h - 4) * (v - lo) / (hi - lo)).toFixed(1)).join(' ');
    return `<svg width="${w}" height="${h}" style="vertical-align:middle"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.4"/></svg>`;
  }

  // donut composition. items:[{label,value,color?}], opts {w,h}
  function donut(items, opts) {
    opts = opts || {}; const sz = opts.h || 150, r = sz / 2 - 6, cx = sz / 2, cy = sz / 2, ir = r * 0.6;
    items = (items || []).filter((x) => x && x.value > 0); const tot = items.reduce((a, i) => a + i.value, 0) || 1;
    let a0 = -Math.PI / 2, seg = '';
    items.forEach((it, i) => { const a1 = a0 + 2 * Math.PI * it.value / tot; const col = it.color || PAL[i % PAL.length];
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi1 = cx + ir * Math.cos(a1), yi1 = cy + ir * Math.sin(a1), xi0 = cx + ir * Math.cos(a0), yi0 = cy + ir * Math.sin(a0);
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      seg += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} L${xi1.toFixed(1)} ${yi1.toFixed(1)} A${ir} ${ir} 0 ${large} 0 ${xi0.toFixed(1)} ${yi0.toFixed(1)} Z" fill="${col}"/>`; a0 = a1; });
    const w = sz + 130;
    const leg = items.map((it, i) => `<text x="${sz + 8}" y="${16 + i * 16}" font-size="10"><tspan fill="${it.color || PAL[i % PAL.length]}">●</tspan> <tspan fill="${TXT}">${esc(it.label)} (${nf(it.value)})</tspan></text>`).join('');
    return svg(w, sz, seg + leg);
  }

  function svg(w, h, inner) { return `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" style="max-width:${w}px;height:auto;font-family:Segoe UI,system-ui,sans-serif">${inner}</svg>`; }
  function empty(w, h, msg) { return svg(w, h, `<text x="${w / 2}" y="${h / 2}" fill="${TXT}" font-size="11" text-anchor="middle">${esc(msg)}</text>`); }

  root.HMP_CHARTS = { line, bars, histogram, sparkline, donut, PAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_CHARTS;
}(typeof window !== 'undefined' ? window : globalThis));
