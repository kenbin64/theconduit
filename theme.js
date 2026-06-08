/* ============================================================================
 * HydroManifold — Theming (it's YOUR build)
 * ----------------------------------------------------------------------------
 * The demo's look is just ONE example. Everything in HydroManifold is yours to
 * shape: the water authority enters its own content, and the interface is yours
 * to theme. This applies a chosen palette to the shared CSS variables both apps
 * use, supports a custom accent color, and remembers the choice. Pick a built-in
 * theme or set your own accent — no rebuild, no redeploy.
 * ========================================================================== */
(function (root) {
  'use strict';

  // Each theme overrides the shared CSS variables; everything else is derived.
  const THEMES = {
    'control-room': { label: 'Control Room (dark)', vars: { '--bg': '#070b12', '--panel': '#0e1622', '--panel2': '#121d2c', '--edge': '#1f2e42', '--txt': '#d8e6f5', '--muted': '#7f93ab', '--accent': '#3fd0ff', '--gridline': '#13202f', '--grid': '#13202f', '--topbar': '#0b1422' } },
    'midnight':     { label: 'Midnight (violet)', vars: { '--bg': '#0a0a14', '--panel': '#131325', '--panel2': '#1a1a30', '--edge': '#2a2a46', '--txt': '#e4e2f7', '--muted': '#9890b5', '--accent': '#9b8cff', '--gridline': '#1c1c33', '--grid': '#1c1c33', '--topbar': '#12122a' } },
    'slate':        { label: 'Slate (teal)', vars: { '--bg': '#0f1216', '--panel': '#181c22', '--panel2': '#1f242c', '--edge': '#2e353f', '--txt': '#dde3ea', '--muted': '#8b97a5', '--accent': '#5fd0c0', '--gridline': '#1d2229', '--grid': '#1d2229', '--topbar': '#161a20' } },
    'utility':      { label: 'Utility (blue)', vars: { '--bg': '#08111d', '--panel': '#0f1c2e', '--panel2': '#15263b', '--edge': '#25405c', '--txt': '#dce8f6', '--muted': '#7d93ab', '--accent': '#2e9bdf', '--gridline': '#11202f', '--grid': '#11202f', '--topbar': '#0c1a2c' } },
    'light':        { label: 'Daylight (light)', vars: { '--bg': '#eef2f7', '--panel': '#ffffff', '--panel2': '#f3f7fc', '--edge': '#d2dde9', '--txt': '#14202c', '--muted': '#5a6b7d', '--accent': '#0a7ea4', '--gridline': '#e3eaf2', '--grid': '#e3eaf2', '--topbar': '#ffffff' } },
    'high-contrast':{ label: 'High contrast (a11y)', vars: { '--bg': '#000000', '--panel': '#0a0a0a', '--panel2': '#141414', '--edge': '#555555', '--txt': '#ffffff', '--muted': '#cfcfcf', '--accent': '#ffd400', '--gridline': '#333333', '--grid': '#333333', '--topbar': '#000000' } }
  };

  const LS_THEME = 'hm:theme', LS_ACCENT = 'hm:accent';

  function ls(get, key, val) {
    try { if (get) return root.localStorage.getItem(key); root.localStorage.setItem(key, val); } catch (_) { return null; }
  }
  function get() { return { name: ls(true, LS_THEME) || 'control-room', accent: ls(true, LS_ACCENT) || '' }; }

  function apply(name, accent) {
    const t = THEMES[name] || THEMES['control-room'];
    const el = root.document && root.document.documentElement; if (!el) return;
    Object.keys(t.vars).forEach((k) => el.style.setProperty(k, t.vars[k]));
    if (accent) el.style.setProperty('--accent', accent);
  }
  function set(name) { ls(false, LS_THEME, name); const g = get(); apply(name, g.accent); }
  function setAccent(hex) { ls(false, LS_ACCENT, hex); const g = get(); apply(g.name, hex); }
  function init() { const g = get(); apply(g.name, g.accent); }

  // Wire a <select> (theme) and an <input type="color"> (accent).
  function mount(sel, color) {
    const g = get();
    if (sel) {
      sel.innerHTML = Object.keys(THEMES).map((k) => '<option value="' + k + '">' + THEMES[k].label + '</option>').join('');
      sel.value = g.name; sel.addEventListener('change', () => { set(sel.value); if (color) color.value = THEMES[sel.value].vars['--accent']; });
    }
    if (color) { color.value = g.accent || THEMES[g.name].vars['--accent']; color.addEventListener('input', () => setAccent(color.value)); }
  }

  // ── white-label branding ──────────────────────────────────────────────────
  // The authority may rename the product and set its own logo. The ONE thing
  // that cannot be removed is the "Powered by Butterflyfx Manifold" attribution
  // (rendered statically in the page and not editable here).
  const LS_BRAND = 'hm:brandName', LS_LOGO = 'hm:brandLogo';
  function getBrand() { return { name: ls(true, LS_BRAND) || 'HydroManifold', logo: ls(true, LS_LOGO) || '' }; }
  function setBrand(name, logo) {
    if (name != null) ls(false, LS_BRAND, name);
    if (logo != null) ls(false, LS_LOGO, logo);
    applyBrand();
  }
  function applyBrand() {
    const b = getBrand();
    const el = root.document && root.document.getElementById('brandname');
    if (el) el.textContent = (b.logo ? b.logo + ' ' : '') + b.name;
    try { if (root.document) root.document.title = b.name; } catch (_) {}
  }

  init(); applyBrand();   // apply the saved theme + brand immediately on load
  root.HM_THEME = { THEMES, apply, set, setAccent, get, mount, init, getBrand, setBrand, applyBrand };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_THEME;
}(typeof window !== 'undefined' ? window : globalThis));
