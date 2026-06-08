/* ============================================================================
 * HydroManifold Platform — Audit Log (tamper-evident)
 * ----------------------------------------------------------------------------
 * Government/industry-grade event logging: append-only and HASH-CHAINED, so any
 * after-the-fact edit to a past entry breaks the chain and is detectable
 * (verify()). Every record covers who (actor/role), what (action/target), when,
 * and detail. CSV export for regulators / legal discovery / FOIA.
 * ========================================================================== */
(function (root) {
  'use strict';

  function fnv(str) {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function AuditLog(opts) {
    opts = opts || {};
    this.store = opts.store; this.key = (opts.ns || 'hmp') + ':audit';
    this.entries = this._load();
    if (!this.entries.length) this._appendRaw('SYSTEM', 'system', 'genesis', '-', 'Audit chain initialized');
    this.cap = opts.cap || 5000;
  }

  AuditLog.prototype._now = function () {
    try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (_) { return 'now'; }
  };
  AuditLog.prototype._load = function () {
    try { const v = this.store && this.store.get(this.key); return v ? JSON.parse(v) : []; } catch (_) { return []; }
  };
  AuditLog.prototype._save = function () {
    try { if (this.store) this.store.set(this.key, JSON.stringify(this.entries.slice(-this.cap))); } catch (_) {}
  };
  AuditLog.prototype._appendRaw = function (actor, role, action, target, detail) {
    const prev = this.entries.length ? this.entries[this.entries.length - 1] : null;
    const seq = prev ? prev.seq + 1 : 0;
    const ts = this._now();
    const prevHash = prev ? prev.hash : '00000000';
    const payload = [seq, ts, actor, role, action, target, detail, prevHash].join('|');
    const hash = fnv(payload);
    const e = { seq, ts, actor, role, action, target, detail, prevHash, hash };
    this.entries.push(e);
    return e;
  };

  AuditLog.prototype.append = function (actor, role, action, target, detail) {
    const e = this._appendRaw(actor || 'system', role || '-', action, target || '-', detail || '');
    this._save();
    return e;
  };

  // Recompute the chain; report the first index that fails (tamper detection).
  AuditLog.prototype.verify = function () {
    let prevHash = '00000000';
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      const payload = [e.seq, e.ts, e.actor, e.role, e.action, e.target, e.detail, prevHash].join('|');
      if (fnv(payload) !== e.hash || e.prevHash !== prevHash) return { ok: false, brokenAt: i };
      prevHash = e.hash;
    }
    return { ok: true, count: this.entries.length, head: this.entries.length ? this.entries[this.entries.length - 1].hash : '00000000' };
  };

  AuditLog.prototype.recent = function (n) { return this.entries.slice(-(n || 100)).reverse(); };
  AuditLog.prototype.toCSV = function () {
    const head = 'seq,timestamp,actor,role,action,target,detail,prevHash,hash';
    const body = this.entries.map((e) =>
      [e.seq, e.ts, q(e.actor), q(e.role), q(e.action), q(e.target), q(e.detail), e.prevHash, e.hash].join(',')).join('\n');
    return head + '\n' + body + '\n';
  };
  function q(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  root.HMP_AUDIT = { AuditLog, fnv };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_AUDIT;
}(typeof window !== 'undefined' ? window : globalThis));
