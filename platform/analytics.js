/* ============================================================================
 * HydroManifold Platform — Analytics (pure, deterministic, testable)
 * ----------------------------------------------------------------------------
 * Descriptive statistics, trend fitting, forecasting (futures planning),
 * ETA-to-threshold predictors, risk scoring, and log/anomaly analysis. All
 * functions are pure and use established, well-understood methods (least-squares
 * linear regression, sample std-dev, weighted risk). No experimental modelling.
 * ========================================================================== */
(function (root) {
  'use strict';

  // descriptive stats
  function stats(a) {
    a = (a || []).filter((v) => typeof v === 'number' && !isNaN(v));
    if (!a.length) return { n: 0 };
    const n = a.length, sorted = a.slice().sort((x, y) => x - y), mean = a.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n);
    return { n, min: sorted[0], max: sorted[n - 1], mean, sd, p95: sorted[Math.floor(0.95 * (n - 1))] };
  }

  // least-squares fit over the index (0..n-1)
  function linearFit(values) {
    const a = (values || []).filter((v) => typeof v === 'number' && !isNaN(v)); const n = a.length;
    if (n < 2) return { slope: 0, intercept: n ? a[0] : 0, n };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += i; sy += a[i]; sxx += i * i; sxy += i * a[i]; }
    const d = n * sxx - sx * sx; const slope = d === 0 ? 0 : (n * sxy - sx * sy) / d;
    return { slope, intercept: (sy - slope * sx) / n, n };
  }

  // forecast value `steps` samples ahead (futures planning)
  function forecast(values, steps) {
    const f = linearFit(values); if (!f.n) return null;
    return f.intercept + f.slope * (f.n - 1 + (steps || 1));
  }

  // steps until the series crosses `threshold` at its current trend (predictor)
  function etaToThreshold(values, threshold) {
    const f = linearFit(values); if (f.n < 2 || f.slope === 0) return { willCross: false, steps: null };
    const cur = f.intercept + f.slope * (f.n - 1); const steps = (threshold - cur) / f.slope;
    return steps > 0 ? { willCross: true, steps, direction: f.slope > 0 ? 'up' : 'down' } : { willCross: false, steps: null };
  }

  function describeTrend(slope, eps) {
    eps = eps || 1e-6; if (slope > eps) return 'rising'; if (slope < -eps) return 'falling'; return 'stable';
  }

  // ── risk assessment ──
  const CRIT_W = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };
  const SEV_W = { low: 0.3, medium: 0.55, high: 0.8, critical: 1 };
  function sev(score) { return score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 22 ? 'medium' : 'low'; }

  // reg = registry; opts.violations = number of live compliance violations
  function riskRegister(reg, opts) {
    opts = opts || {}; const rows = [];
    (reg.list ? reg.list('equipment') : []).forEach((e) => {
      const w = CRIT_W[e.criticality] != null ? CRIT_W[e.criticality] : 0.5;
      const degr = (100 - (parseFloat(e.conditionPct) || 0)) / 100;
      const score = Math.round(w * degr * 100 * (e.status === 'down' ? 1.4 : 1));
      if (score > 0) rows.push({ item: e.tag || e.type, category: 'Asset', score: Math.min(100, score), severity: sev(score), detail: `${e.criticality} criticality · condition ${e.conditionPct}% · ${e.status}` });
    });
    (reg.list ? reg.list('incidents') : []).forEach((i) => {
      if (['resolved', 'closed'].includes(i.status)) return;
      const score = Math.round((SEV_W[i.severity] != null ? SEV_W[i.severity] : 0.5) * 100);
      rows.push({ item: i.type, category: 'Incident', score, severity: sev(score), detail: `${i.severity} · ${i.location || ''} · ${i.status}` });
    });
    if (opts.violations) rows.push({ item: 'Active compliance violations', category: 'Compliance', score: Math.min(100, 60 + opts.violations * 10), severity: 'critical', detail: opts.violations + ' live exceedance(s)' });
    rows.sort((a, b) => b.score - a.score);
    const overall = rows.length ? Math.round(0.6 * rows[0].score + 0.4 * (rows.reduce((s, r) => s + r.score, 0) / rows.length)) : 0;
    return { rows, score: overall, severity: sev(overall) };
  }

  // ── log / anomaly analysis ──
  const ANOMALY_ACTIONS = ['violation', 'failsafe-engaged', 'fault', 'critical', 'alarm', 'tamper', 'breach', 'shutoff', 'drift'];
  function isAnomaly(e) {
    const a = String(e.action || '').toLowerCase(); const d = String(e.detail || '').toLowerCase();
    return ANOMALY_ACTIONS.some((k) => a.includes(k)) || /reject|violation|exceed|critical|tamper|sabotage|breach/.test(d);
  }
  function scanAnomalies(entries) {
    const list = (entries || []).filter(isAnomaly);
    return { list, last: list.length ? list[0] : null, count: list.length };   // entries assumed newest-first
  }
  function countBy(entries, key) {
    const m = {}; (entries || []).forEach((e) => { const k = e[key] || '—'; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map((k) => ({ label: k, value: m[k] })).sort((a, b) => b.value - a.value);
  }
  // bucket newest-first entries into `n` equal sequential buckets (oldest→newest) for a timeline
  function timeline(entries, n) {
    n = n || 12; const arr = (entries || []).slice().reverse(); const out = new Array(n).fill(0);
    if (!arr.length) return out;
    arr.forEach((e, i) => { let b = Math.floor(i / arr.length * n); if (b >= n) b = n - 1; out[b]++; });
    return out;
  }

  root.HMP_ANALYTICS = { stats, linearFit, forecast, etaToThreshold, describeTrend, riskRegister, isAnomaly, scanAnomalies, countBy, timeline, sev };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_ANALYTICS;
}(typeof window !== 'undefined' ? window : globalThis));
