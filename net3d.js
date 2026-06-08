/* ============================================================================
 * HydroManifold — 3D Water-Network Renderer (dependency-free canvas 3D)
 * ----------------------------------------------------------------------------
 * Builds a 3D scene straight from a network schema (network.js) and drives every
 * node's color from live sensor health on the manifold z=x·y gradient
 * (red→amber→green). Warning & critical nodes BLINK orange / red, with the pulse
 * intensity & speed scaling by severity. Orbit (drag), zoom (wheel), hover for
 * detail. No WebGL, no libraries — a small perspective projector + painter sort.
 *   new HM_NET3D.Net3D(canvas, network, { statusFn, sensorFn, onHover })
 * ========================================================================== */
(function (root) {
  'use strict';
  const MAN = root.HM_MANIFOLD;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const ease = (t) => t < 0 ? 0 : t > 1 ? 1 : (t * t * (3 - 2 * t));
  const colorForHealth = (z) => (MAN && MAN.colorForHealth) ? MAN.colorForHealth(z) : 'hsl(' + (z * 120) + ',80%,50%)';
  const tierForHealth = (z) => (MAN && MAN.statusForHealth) ? MAN.statusForHealth(z).tier : (z > 0.7 ? 'healthy' : z > 0.45 ? 'warning' : 'critical');

  function Net3D(canvas, net, opts) {
    opts = opts || {};
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.statusFn = opts.statusFn || (() => 1);          // node → health z (0..1)
    this.sensorFn = opts.sensorFn || (() => 1);          // (node, sensorId) → z
    this.onHover = opts.onHover || function () {};
    this.yaw = 0.7; this.pitch = 0.42; this.dist = 250; this.focal = 540; this.target = [0, 7, 0];
    this.autorotate = true; this.t = 0; this.hover = null; this.mouse = null;
    this.dpr = Math.min(root.devicePixelRatio || 1, 2);
    this.setNetwork(net);
    this._wire(); this._resize();
    const self = this; this._raf = function (ts) { self._frame(ts); root.requestAnimationFrame(self._raf); }; root.requestAnimationFrame(this._raf);
  }

  Net3D.prototype.setNetwork = function (net) {
    this.net = net || { nodes: [], pipes: [] };
    if (root.HM_NETWORK && root.HM_NETWORK.resolvePositions) root.HM_NETWORK.resolvePositions(this.net);   // GPS + elevation → 3D positions
    this.buildStart = (root.performance || Date).now();    // restart the "build itself" animation
    this.nodeById = {}; this.net.nodes.forEach((n, i) => { n._i = i; this.nodeById[n.id] = n; });
  };

  // ── perspective projection of a world point ──
  Net3D.prototype.proj = function (p) {
    const t = this.target; let x = p[0] - t[0], y = p[1] - t[1], z = p[2] - t[2];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw); const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch); const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const camZ = z2 + this.dist, f = this.focal / Math.max(camZ, 1);
    return { x: this.W / 2 + x1 * f, y: this.H / 2 - y2 * f, s: f, depth: camZ };
  };

  // ── per-node appearance: gradient base + severity blink ──
  Net3D.prototype._look = function (z) {
    const base = colorForHealth(z), tier = tierForHealth(z);
    if (tier === 'healthy' || tier === 'watch') return { base: base, blink: null };
    const sev = clamp(1 - z, 0, 1), freq = 2.2 + sev * 7, amp = 0.45 + sev * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * freq);                       // 0..1
    const col = tier === 'critical' ? '#ff3b4e' : (tier === 'alarm' ? '#ff7a2f' : '#ffc233');
    return { base: base, blink: { col: col, glow: 6 + 26 * amp * pulse, alpha: 0.35 + 0.65 * amp * pulse, sev: sev } };
  };

  // ── shape geometry (world space) ──
  function ring(cx, cy, cz, r, n) { const v = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; v.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]); } return v; }
  function prism(pos, r, h, n, yBase) { // n-gon prism from yBase..yBase+h
    const y0 = yBase, y1 = yBase + h, bot = ring(pos[0], y0, pos[2], r, n), top = ring(pos[0], y1, pos[2], r, n);
    const verts = bot.concat(top), faces = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j, n + i]); }
    faces.push(top.map((_, i) => n + i)); faces.push(bot.map((_, i) => i).reverse());
    return { verts: verts, faces: faces };
  }
  function box(pos, hx, hy, hz, yBase) {
    const x = pos[0], z = pos[2], y0 = yBase, y1 = yBase + hy * 2;
    const v = [[x - hx, y0, z - hz], [x + hx, y0, z - hz], [x + hx, y0, z + hz], [x - hx, y0, z + hz], [x - hx, y1, z - hz], [x + hx, y1, z - hz], [x + hx, y1, z + hz], [x - hx, y1, z + hz]];
    return { verts: v, faces: [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] };
  }

  Net3D.prototype._poly = function (g, color, alpha, grow) {
    const ctx = this.ctx, pv = g.verts.map((v) => this.proj(this._scaleV(v, grow)));
    const fd = g.faces.map((f) => ({ f: f, d: f.reduce((s, i) => s + pv[i].depth, 0) / f.length })).sort((a, b) => b.d - a.d);
    fd.forEach(({ f }) => {
      ctx.beginPath(); f.forEach((i, k) => { const p = pv[i]; k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath();
      ctx.globalAlpha = 0.13 * alpha; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };
  // grow animates height from the ground as the node "comes online"
  Net3D.prototype._scaleV = function (v, grow) { if (grow >= 1) return v; const yb = this._growBase; return [v[0], yb + (v[1] - yb) * grow, v[2]]; };

  Net3D.prototype._billboard = function (p, r, color, alpha, glow) {
    const ctx = this.ctx; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.shadowColor = color; ctx.shadowBlur = glow || 0;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  };

  Net3D.prototype._drawNode = function (n, z, grow) {
    const ctx = this.ctx, look = this._look(z), col = look.base, pos = n.pos, base = pos[1], P = this.proj(pos);
    this._growBase = base;                                  // shapes grow upward from their own terrain elevation
    const al = Math.min(1, grow * 1.5);
    if (look.blink) { ctx.shadowColor = look.blink.col; ctx.shadowBlur = look.blink.glow; }
    if (n.type === 'reservoir') { this._poly(prism(pos, 16, 3, 6, base), '#2f8fd6', al, grow); this._poly({ verts: ring(pos[0], base + 3, pos[2], 15, 6), faces: [[0, 1, 2, 3, 4, 5]] }, '#3fd0ff', 0.85 * al, grow); }
    else if (n.type === 'tank_elevated') { const T = 12; this._poly(prism(pos, 8, 9, 12, base + T), col, al, grow); this._legs(pos, 8, grow, base + T, base); }
    else if (n.type === 'tank_ground') { this._poly(prism(pos, 9, 7, 12, base), col, al, grow); }
    else if (n.type === 'treatment') { this._poly(box(pos, 11, 3, 7, base), col, al, grow); }
    else if (n.type === 'pump') { this._poly(box(pos, 4.5, 3, 4.5, base), col, al, grow); }
    else if (n.type === 'well') { this._poly(prism(pos, 2.4, 4, 8, base), col, al, grow); this._line(this.proj([pos[0], base, pos[2]]), this.proj([pos[0], base - 9, pos[2]]), col, 1, 0.5 * grow); }
    else { this._billboard(P, 9 * P.s * grow + 3, col, 0.9, look.blink ? look.blink.glow : 5); }   // junction / service
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    // the BLINK: a pulsing ring in amber/red for warning/critical, intensity & radius by severity
    if (look.blink) { ctx.strokeStyle = look.blink.col; ctx.globalAlpha = look.blink.alpha; ctx.shadowColor = look.blink.col; ctx.shadowBlur = look.blink.glow; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(P.x, P.y, 12 + look.blink.sev * 7, 0, 7); ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
    // sensors arranged around the node top — each its own health color + blink
    if (grow >= 0.6) {
      const sy = base + (n.type === 'tank_elevated' ? 23 : n.type === 'reservoir' ? 6 : 9);
      (n.sensors || []).forEach((sid, k) => { const a = k / Math.max(n.sensors.length, 1) * Math.PI * 2; const sp = this.proj([pos[0] + Math.cos(a) * 6, sy, pos[2] + Math.sin(a) * 6]); const sl = this._look(this.sensorFn(n, sid)); this._billboard(sp, (3 + (sl.blink ? sl.blink.sev * 2.5 : 0)) * Math.max(sp.s, 0.5) + 1.5, sl.blink ? sl.blink.col : sl.base, sl.blink ? sl.blink.alpha : 0.95, sl.blink ? sl.blink.glow : 4); });
    }
    if (grow > 0.85) { const ly = base + (n.type === 'tank_elevated' ? 26 : n.type === 'reservoir' ? 9 : 11); const lp = this.proj([pos[0], ly, pos[2]]); ctx.fillStyle = '#cfe0f2'; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.globalAlpha = clamp((grow - 0.85) / 0.15, 0, 1) * 0.9; ctx.fillText(n.name, lp.x, lp.y); ctx.globalAlpha = 1; }
  };
  Net3D.prototype._legs = function (pos, r, grow, topY, botY) { for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const x = pos[0] + Math.cos(a) * r * 0.7, z = pos[2] + Math.sin(a) * r * 0.7; const top = this.proj(this._scaleV([x, topY, z], grow)), bot = this.proj(this._scaleV([x, botY, z], grow)); this._line(top, bot, '#5a7794', 1.4, 0.7); } };
  Net3D.prototype._line = function (a, b, col, w, alpha) { const ctx = this.ctx; ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.strokeStyle = col; ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = 1; };

  Net3D.prototype._drawPipe = function (a, b, pipe, za, zb) {
    const ctx = this.ctx, pa = this.proj([a.pos[0], a.pos[1] + 1.5, a.pos[2]]), pb = this.proj([b.pos[0], b.pos[1] + 1.5, b.pos[2]]);
    const z = Math.min(za, zb), col = colorForHealth(z), w = clamp((pipe.diameter || 16) / 6 * Math.min(pa.s, pb.s) * 4, 1.5, 9);
    ctx.strokeStyle = '#1d3349'; ctx.lineWidth = w + 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    // animated flow ticks
    ctx.setLineDash([3, 14]); ctx.lineDashOffset = -(this.t * 30) % 17; ctx.strokeStyle = '#e7f6ff'; ctx.lineWidth = Math.max(1, w * 0.35); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  };

  Net3D.prototype._grid = function () {
    const ctx = this.ctx, R = 120, S = 20; ctx.strokeStyle = 'rgba(40,70,100,.28)'; ctx.lineWidth = 1;
    for (let i = -R; i <= R; i += S) { const a = this.proj([i, 0, -R]), b = this.proj([i, 0, R]), c = this.proj([-R, 0, i]), d = this.proj([R, 0, i]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke(); }
  };

  Net3D.prototype._frame = function () {
    const now = (root.performance || Date).now(); this.t = now / 1000;
    if (this.autorotate && !this.drag) this.yaw += 0.0024;
    const ctx = this.ctx; ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, this.W, this.H);
    this._grid();
    const online = (n) => ease(((now - this.buildStart) - n._i * 180) / 700);    // sequential "comes online"
    // collect drawables for painter sort
    const items = [];
    this.net.pipes.forEach((p) => { const a = this.nodeById[p.from], b = this.nodeById[p.to]; if (!a || !b) return; if (online(a) < 0.6 || online(b) < 0.6) return; const za = this.statusFn(a), zb = this.statusFn(b); items.push({ depth: (this.proj(a.pos).depth + this.proj(b.pos).depth) / 2, fn: () => this._drawPipe(a, b, p, za, zb) }); });
    this.net.nodes.forEach((n) => { const g = online(n); if (g <= 0) return; items.push({ depth: this.proj(n.pos).depth, fn: () => this._drawNode(n, this.statusFn(n), g) }); });
    items.sort((x, y) => y.depth - x.depth).forEach((it) => it.fn());
    // hover hit-test
    if (this.mouse) { let best = null, bd = 26; this.net.nodes.forEach((n) => { const p = this.proj(n.pos); const d = Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y); if (d < bd) { bd = d; best = n; } }); if (best !== this.hover) { this.hover = best; this.onHover(best, best ? this.statusFn(best) : null); } if (best) { const p = this.proj(best.pos); ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; } }
  };

  // ── interaction ──
  Net3D.prototype._wire = function () {
    const el = this.c, self = this;
    el.addEventListener('mousedown', (e) => { self.drag = { x: e.clientX, y: e.clientY, yaw: self.yaw, pitch: self.pitch }; });
    root.addEventListener('mouseup', () => { self.drag = null; });
    el.addEventListener('mousemove', (e) => { const r = el.getBoundingClientRect(); self.mouse = { x: e.clientX - r.left, y: e.clientY - r.top }; if (self.drag) { self.yaw = self.drag.yaw + (e.clientX - self.drag.x) * 0.01; self.pitch = clamp(self.drag.pitch + (e.clientY - self.drag.y) * 0.008, -0.2, 1.35); } });
    el.addEventListener('mouseleave', () => { self.mouse = null; });
    el.addEventListener('wheel', (e) => { e.preventDefault(); self.dist = clamp(self.dist * (1 + (e.deltaY > 0 ? 0.1 : -0.1)), 90, 600); }, { passive: false });
    root.addEventListener('resize', () => self._resize());
  };
  Net3D.prototype._resize = function () { const r = this.c.getBoundingClientRect(); this.W = r.width || 800; this.H = r.height || 500; this.c.width = this.W * this.dpr; this.c.height = this.H * this.dpr; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); };
  Net3D.prototype.setAutorotate = function (v) { this.autorotate = v; };
  Net3D.prototype.reset = function () { this.yaw = 0.7; this.pitch = 0.42; this.dist = 250; };

  root.HM_NET3D = { Net3D: Net3D };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_NET3D;
}(typeof window !== 'undefined' ? window : globalThis));
