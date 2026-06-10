/* ============================================================================
 * HydroManifold — Dimensional Navigator (recursive "thing → parts" drill-down)
 * ----------------------------------------------------------------------------
 * A non-spatial way to explore the system: ONE thing sits in the middle of the
 * screen. Click it and it reveals its PARTS, blooming out around it. Click a
 * part and it collapses into the middle as the new single thing — whose parts
 * you can then reveal, and so on, as deep as the real data goes. Every "part"
 * is a genuine constituent (a system's parts are its nodes; a node's parts are
 * its sensors; a sensor's parts are its live reading + real thresholds). When a
 * thing has no parts it is atomic — the drill honestly stops. Nothing is
 * invented to fill a level.
 *
 *   const dim = HM_DIM.create({ mount: stageEl, onExit });
 *   dim.open(rootThing);
 *
 * A "thing": { id, label, kind, color, facts:[[k,v],…], parts: ()=>[thing] | null }
 *   parts === null  →  atomic leaf (no deeper level)
 * ========================================================================== */
(function (root) {
  'use strict';
  const T = 340;                                   // animation duration (ms), matches the CSS transition
  const hasParts = (t) => t && typeof t.parts === 'function';
  const div = (cls) => { const d = document.createElement('div'); if (cls) d.className = cls; return d; };

  function create(opts) {
    opts = opts || {};
    const mount = opts.mount || document.body;
    let overlay, bar, stage, centerEl, partEls = [];
    let focus = null, stack = [], revealed = false, busy = false;

    function open(thing) { if (!overlay) build(); setFocus(thing, []); }

    function build() {
      overlay = div('dim-overlay'); bar = div('dim-bar'); stage = div('dim-stage');
      overlay.appendChild(bar); overlay.appendChild(stage); mount.appendChild(overlay);
      // background click: collapse parts if open, otherwise leave (exit is explicit)
      stage.addEventListener('click', (e) => { if (e.target === stage && revealed) collapse(); });
      document.addEventListener('keydown', onKey);
    }
    function onKey(e) { if (!overlay) return; if (e.key === 'Escape') { revealed ? collapse() : (stack.length ? up() : exit()); } }

    // ── focus a thing (collapsed) ──
    function setFocus(thing, newStack) {
      focus = thing; stack = newStack; revealed = false; clearParts();
      if (centerEl) centerEl.remove();
      centerEl = thingCard(focus, true);
      centerEl.style.opacity = '0'; centerEl.style.transform = 'translate(-50%,-50%) scale(.82)';
      centerEl.addEventListener('click', onCenter);
      stage.appendChild(centerEl);
      requestAnimationFrame(() => { centerEl.style.opacity = '1'; centerEl.style.transform = 'translate(-50%,-50%) scale(1)'; });
      renderBar();
    }
    function onCenter(e) { e.stopPropagation(); if (busy) return; if (!hasParts(focus)) { atomicFlash(); return; } revealed ? collapse() : reveal(); }

    // ── reveal: parts bloom out from the center ──
    function reveal() {
      const parts = (focus.parts() || []).filter(Boolean); if (!parts.length) { atomicFlash(); return; }
      revealed = true; busy = true; centerEl.classList.add('dim-open');
      const W = stage.clientWidth, H = stage.clientHeight, R = Math.min(W, H) * 0.33;
      parts.forEach((p, i) => {
        const el = thingCard(p, false); partEls.push(el); el._thing = p; stage.appendChild(el);
        const ang = -Math.PI / 2 + i / parts.length * Math.PI * 2;       // start at top, go clockwise
        el._tx = Math.cos(ang) * R; el._ty = Math.sin(ang) * R * 0.92;
        el.style.transform = 'translate(-50%,-50%) translate(0,0) scale(.2)'; el.style.opacity = '0';
        el.addEventListener('click', (e) => { e.stopPropagation(); promote(el); });
      });
      requestAnimationFrame(() => partEls.forEach((el) => { el.style.transform = 'translate(-50%,-50%) translate(' + el._tx + 'px,' + el._ty + 'px) scale(1)'; el.style.opacity = '1'; }));
      setTimeout(() => { busy = false; }, T);
    }

    // ── collapse: parts fall back into the center ──
    function collapse(then) {
      if (!partEls.length) { revealed = false; then && then(); return; }
      busy = true; revealed = false; centerEl && centerEl.classList.remove('dim-open');
      partEls.forEach((el) => { el.style.transform = 'translate(-50%,-50%) translate(0,0) scale(.2)'; el.style.opacity = '0'; });
      setTimeout(() => { clearParts(); busy = false; then && then(); }, T);
    }

    // ── promote: a clicked part swallows the view and becomes the new single thing ──
    function promote(el) {
      if (busy) return; busy = true; const part = el._thing;
      partEls.forEach((o) => { if (o === el) { o.style.transform = 'translate(-50%,-50%) translate(0,0) scale(1.5)'; o.classList.add('dim-rise'); } else { o.style.transform = 'translate(-50%,-50%) translate(0,0) scale(.2)'; o.style.opacity = '0'; } });
      if (centerEl) { centerEl.style.opacity = '0'; centerEl.style.transform = 'translate(-50%,-50%) scale(1.3)'; }
      setTimeout(() => { const ns = stack.concat([focus]); clearParts(); busy = false; setFocus(part, ns); }, T);
    }

    function up() { if (!stack.length) return exit(); const parent = stack[stack.length - 1]; collapse(() => setFocus(parent, stack.slice(0, -1))); }
    function jumpTo(i) { const target = stack[i]; collapse(() => setFocus(target, stack.slice(0, i))); }
    function exit() { if (!overlay) return; document.removeEventListener('keydown', onKey); overlay.remove(); overlay = null; partEls = []; centerEl = null; opts.onExit && opts.onExit(); }

    function clearParts() { partEls.forEach((el) => el.remove()); partEls = []; }
    function atomicFlash() { if (!centerEl) return; centerEl.classList.remove('dim-atomic'); void centerEl.offsetWidth; centerEl.classList.add('dim-atomic'); }

    // ── breadcrumb + controls ──
    function renderBar() {
      bar.innerHTML = '';
      const crumbs = stack.concat([focus]);
      crumbs.forEach((t, i) => {
        const c = div('dim-crumb'); c.textContent = t.label; c.style.color = t.color || '#cfe0f2';
        if (i < crumbs.length - 1) { c.classList.add('link'); c.addEventListener('click', () => jumpTo(i)); }
        else c.classList.add('here');
        bar.appendChild(c);
        if (i < crumbs.length - 1) { const sep = div('dim-sep'); sep.textContent = '▸'; bar.appendChild(sep); }
      });
      const sp = div('dim-spacer'); bar.appendChild(sp);
      if (stack.length) { const u = div('dim-btn'); u.textContent = '▲ up'; u.addEventListener('click', up); bar.appendChild(u); }
      const x = div('dim-btn'); x.textContent = '⤢ exit'; x.addEventListener('click', exit); bar.appendChild(x);
    }

    // ── a thing rendered as a card (big = the centered focus, small = a part chip) ──
    function thingCard(thing, big) {
      const el = div('dim-thing ' + (big ? 'dim-center' : 'dim-part'));
      el.style.setProperty('--c', thing.color || '#7cc4ff');
      const kind = div('dim-kind'); kind.textContent = thing.kind || ''; el.appendChild(kind);
      const lab = div('dim-label'); lab.textContent = thing.label; el.appendChild(lab);
      if (big) {
        if (thing.facts && thing.facts.length) { const f = div('dim-facts'); thing.facts.forEach((kv) => { const r = div('dim-row'); const k = div('k'); k.textContent = kv[0]; const v = div('v'); v.textContent = kv[1]; r.appendChild(k); r.appendChild(v); f.appendChild(r); }); el.appendChild(f); }
        const hint = div('dim-hint');
        hint.textContent = hasParts(thing) ? 'click to reveal parts' : 'atomic — a single live value';
        el.appendChild(hint);
      } else {
        const v = (thing.facts && thing.facts[0]) ? thing.facts[0][1] : '';
        if (v) { const sub = div('dim-sub'); sub.textContent = v; el.appendChild(sub); }
        if (hasParts(thing)) { const dot = div('dim-more'); dot.textContent = '⋯'; el.appendChild(dot); }
      }
      return el;
    }

    return { open: open, exit: exit };
  }

  root.HM_DIM = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_DIM;
}(typeof window !== 'undefined' ? window : globalThis));
