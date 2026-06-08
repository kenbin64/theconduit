/* ============================================================================
 * HydroManifold Platform — Registry engine
 * ----------------------------------------------------------------------------
 * The extensible spine of the product. No single system can hard-code every
 * jurisdiction's regulations, every equipment type, every policy — so nothing
 * is hard-coded. A "collection" is defined by a SCHEMA (fields + types) and the
 * engine gives it CRUD, persistence, search, and CSV export for free. Add a new
 * schema → a new fully-functional module appears. That is how the platform has
 * the *capacity to hold it all* and scales to any size without reinvention.
 *
 * Persistence is pluggable (localStorage in the browser, in-memory under test).
 * Every mutation fires onChange so RBAC + the audit log can wrap it.
 * ========================================================================== */
(function (root) {
  'use strict';

  function memoryStore() {
    const m = {};
    return { get: (k) => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; } };
  }
  function defaultStore() {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch (_) {}
    return memoryStore();
  }

  function Registry(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.ns = opts.ns || 'hmp';
    this.onChange = opts.onChange || function () {};
    this.signer = opts.signer || null;   // (registry, colId, action, row) → stamps _sig/_shape (manifold seal)
    this.collections = {};      // id → definition
    this._seq = 0;
  }

  // def: { id, name, icon, group, schema:[{key,label,type,options?,unit?}], seed:[], rbac:{view:[],edit:[]}, compliance?:bool, desc? }
  Registry.prototype.define = function (def) {
    this.collections[def.id] = def;
    const saved = this._read(def.id);
    if (saved && Array.isArray(saved)) def.rows = saved;
    else {
      def.rows = (def.seed || []).map((r) => this._stamp(def, Object.assign({}, r)));
      if (this.signer) def.rows.forEach((r) => this.signer(this, def.id, 'seed', r));   // seal seed parameters
      this._write(def);
    }
    return def;
  };

  Registry.prototype.col = function (id) { return this.collections[id]; };
  Registry.prototype.all = function () { return Object.keys(this.collections).map((id) => this.collections[id]); };
  Registry.prototype.list = function (id) { const c = this.collections[id]; return c ? c.rows.slice() : []; };
  Registry.prototype.get = function (id, rid) { const c = this.collections[id]; return c && c.rows.find((r) => r._id === rid); };

  Registry.prototype.add = function (id, row) {
    const c = this.collections[id]; if (!c) return null;
    const r = this._stamp(c, Object.assign({}, row));
    if (this.signer) this.signer(this, id, 'create', r);   // sign + fold manifold shape
    c.rows.unshift(r); this._write(c); this.onChange(id, 'create', r);
    return r;
  };
  Registry.prototype.update = function (id, rid, patch) {
    const c = this.collections[id]; if (!c) return null;
    const r = c.rows.find((x) => x._id === rid); if (!r) return null;
    Object.assign(r, patch); r._updated = this._now();
    if (this.signer) this.signer(this, id, 'update', r);   // re-sign + re-fold manifold shape
    this._write(c); this.onChange(id, 'update', r);
    return r;
  };
  Registry.prototype.remove = function (id, rid) {
    const c = this.collections[id]; if (!c) return false;
    const i = c.rows.findIndex((x) => x._id === rid); if (i < 0) return false;
    const [r] = c.rows.splice(i, 1); this._write(c); this.onChange(id, 'delete', r);
    return true;
  };

  Registry.prototype.search = function (id, q) {
    const rows = this.list(id); if (!q) return rows;
    const t = String(q).toLowerCase();
    return rows.filter((r) => Object.keys(r).some((k) => k[0] !== '_' && String(r[k]).toLowerCase().includes(t)));
  };

  Registry.prototype.toCSV = function (id) {
    const c = this.collections[id]; if (!c) return '';
    const cols = c.schema.map((f) => f.key);
    const head = cols.map((k) => csv(c.schema.find((f) => f.key === k).label)).join(',');
    const body = c.rows.map((r) => cols.map((k) => csv(r[k])).join(',')).join('\n');
    return head + '\n' + body + '\n';
  };

  // counts + a couple of stats for the dashboard
  Registry.prototype.count = function (id) { const c = this.collections[id]; return c ? c.rows.length : 0; };

  // ── internals ──
  Registry.prototype._key = function (id) { return this.ns + ':' + id; };
  Registry.prototype._read = function (id) {
    try { const v = this.store.get(this._key(id)); return v ? JSON.parse(v) : null; } catch (_) { return null; }
  };
  Registry.prototype._write = function (c) {
    try { this.store.set(this._key(c.id), JSON.stringify(c.rows)); } catch (_) {}
  };
  Registry.prototype._now = function () {
    try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (_) { return 'now'; }
  };
  Registry.prototype._stamp = function (c, r) {
    if (!r._id) r._id = c.id + '-' + (++this._seq) + '-' + Math.floor(Math.random() * 1e4);
    if (!r._created) r._created = this._now();
    return r;
  };

  function csv(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  root.HMP_REGISTRY = { Registry, memoryStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_REGISTRY;
}(typeof window !== 'undefined' ? window : globalThis));
