/* ============================================================================
 * HydroManifold Platform — Compliance engine
 * Evaluates the regulation CMS against a live monitoring snapshot. Regulations
 * are data (from the registry); this turns them into real-time compliant /
 * violation verdicts and feeds the audit log + dashboard.
 * ========================================================================== */
(function (root) {
  'use strict';

  // Worst-case value per parameter across all monitored stations (compliance is
  // judged at the weakest point in the system, which is the honest test).
  function snapshot(sim) {
    const s = { turbidity: 0, chlorine: Infinity, pressure: Infinity, ph: null, temperature: Infinity };
    (sim ? sim.stations : []).forEach((st) => {
      const r = st.readings || {};
      if (r.turbidity) s.turbidity = Math.max(s.turbidity, r.turbidity.value);
      if (r.chlorine) s.chlorine = Math.min(s.chlorine, r.chlorine.value);
      if (r.pressure) s.pressure = Math.min(s.pressure, r.pressure.value);
      if (r.ph) s.ph = r.ph.value;
      if (r.temperature) s.temperature = Math.min(s.temperature, r.temperature.value);
    });
    ['chlorine', 'pressure', 'temperature'].forEach((k) => { if (s[k] === Infinity) s[k] = null; });
    return s;
  }

  function evaluateReg(reg, snap) {
    if (reg.status !== 'active') return { state: 'inactive' };
    if (!reg.parameter || reg.parameter === 'none' || reg.op === 'n/a') return { state: 'manual', msg: 'Procedural / attested' };
    const v = snap[reg.parameter];
    if (v == null) return { state: 'no-data' };
    let ok;
    switch (reg.op) {
      case '<=': ok = v <= reg.threshold; break;
      case '>=': ok = v >= reg.threshold; break;
      case '=': ok = Math.abs(v - reg.threshold) < 1e-6; break;
      case 'range': ok = v >= reg.threshold; break;   // simplified low-bound of a range
      default: ok = true;
    }
    return { state: ok ? 'compliant' : 'violation', value: v, unit: reg.unit };
  }

  function evaluateAll(regs, snap) { return regs.map((r) => Object.assign({ reg: r }, evaluateReg(r, snap))); }

  function summary(results) {
    const c = { compliant: 0, violation: 0, manual: 0, nodata: 0 };
    results.forEach((r) => {
      if (r.state === 'compliant') c.compliant++; else if (r.state === 'violation') c.violation++;
      else if (r.state === 'manual') c.manual++; else if (r.state === 'no-data') c.nodata++;
    });
    const denom = c.compliant + c.violation || 1;
    c.rate = c.compliant / denom;
    return c;
  }

  root.HMP_COMPLIANCE = { snapshot, evaluateReg, evaluateAll, summary };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_COMPLIANCE;
}(typeof window !== 'undefined' ? window : globalThis));
