/* ============================================================================
 * HydroManifold Platform — Reports
 * Composes regulator / management / legal reports from the registry, compliance
 * engine, analytics and the audit log. Every report is CSV-exportable (FOIA /
 * discovery). Callers may choose WHICH columns are included; live kinds
 * (sensor-stats, risk, forecast) receive precomputed rows via ctx.
 * ========================================================================== */
(function (root) {
  'use strict';

  const DEFS = {
    compliance: { title: 'Regulatory Compliance Report', cols: ['citation', 'requirement', 'level', 'parameter', 'status', 'value'] },
    incidents: { title: 'Incident & Threat Report', cols: ['type', 'severity', 'location', 'status', 'reported', 'mitigation'] },
    billing: { title: 'Billing & Collections Report', cols: ['account', 'customer', 'class', 'usageKgal', 'balance', 'status'] },
    assets: { title: 'Asset Condition Report', cols: ['tag', 'type', 'condition', 'criticality', 'status', 'nextService'] },
    'sensor-stats': { title: 'Sensor Statistics Report', cols: ['parameter', 'unit', 'n', 'min', 'mean', 'p95', 'max', 'sd'] },
    risk: { title: 'Risk Assessment Report', cols: ['item', 'category', 'score', 'severity', 'detail'] },
    forecast: { title: 'Forecast / Futures Planning Report', cols: ['metric', 'current', 'trend', 'projected', 'eta'] },
    'audit-foia': { title: 'Audit Trail (FOIA / eDiscovery export)', cols: ['seq', 'ts', 'actor', 'role', 'action', 'target', 'detail'] },
    'legal-discovery': { title: 'Legal Discovery / Investigation Export', cols: ['seq', 'ts', 'actor', 'role', 'action', 'target', 'detail'] }
  };

  function build(kind, ctx) {
    ctx = ctx || {}; const reg = ctx.registry; const now = stamp(); const def = DEFS[kind] || { title: 'Report', cols: [] };
    let rows = [];
    if (kind === 'compliance') rows = (ctx.complianceResults || []).map((r) => ({ citation: r.reg.citation, requirement: r.reg.title, level: r.reg.level, parameter: r.reg.parameter, status: r.state, value: r.value != null ? r.value + ' ' + (r.unit || '') : '—' }));
    else if (kind === 'incidents') rows = reg.list('incidents').map((r) => ({ type: r.type, severity: r.severity, location: r.location, status: r.status, reported: r.reported, mitigation: r.mitigation }));
    else if (kind === 'billing') rows = reg.list('accounts').map((r) => ({ account: r.account, customer: r.customer, class: r.class, usageKgal: r.usageKgal, balance: r.balance, status: r.status }));
    else if (kind === 'assets') rows = reg.list('equipment').map((r) => ({ tag: r.tag, type: r.type, condition: r.conditionPct + '%', criticality: r.criticality, status: r.status, nextService: r.nextService }));
    else if (kind === 'sensor-stats') rows = ctx.sensorStats || [];
    else if (kind === 'risk') rows = ctx.risk || [];
    else if (kind === 'forecast') rows = ctx.forecast || [];
    else if (kind === 'audit-foia' || kind === 'legal-discovery') rows = (ctx.audit ? ctx.audit.recent(500) : []).map((e) => ({ seq: e.seq, ts: e.ts, actor: e.actor, role: e.role, action: e.action, target: e.target, detail: e.detail }));

    // "What is included": optional column subset (preserve defined order).
    let cols = def.cols.slice();
    if (ctx.include && ctx.include.length) cols = cols.filter((c) => ctx.include.indexOf(c) >= 0);
    return pack(def.title, now, cols, rows, kind);
  }

  function columnsFor(kind) { return (DEFS[kind] || { cols: [] }).cols.slice(); }
  function titleFor(kind) { return (DEFS[kind] || { title: 'Report' }).title; }

  function pack(title, generated, columns, rows, kind) {
    const head = columns.join(',');
    const body = rows.map((r) => columns.map((c) => csv(r[c])).join(',')).join('\n');
    return { title, generated, columns, rows, kind, csv: head + '\n' + body + '\n' };
  }
  function csv(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function stamp() { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (_) { return 'now'; } }

  root.HMP_REPORTS = { build, columnsFor, titleFor, KINDS: Object.keys(DEFS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_REPORTS;
}(typeof window !== 'undefined' ? window : globalThis));
