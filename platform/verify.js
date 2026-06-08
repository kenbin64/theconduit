/* ============================================================================
 * HydroManifold Platform — Failsafe AI Integrity
 * ----------------------------------------------------------------------------
 * The rule: AI proposes, DETERMINISTIC LOGIC disposes. Every AI output is
 * cross-checked against ground truth built from manifold truth tables, logic
 * gates, regex/schema validation, a decision tree, and a state machine. If the
 * AI disagrees with the deterministic verdict, that is a hallucination and is
 * rejected; sustained disagreement is drift, which trips the failsafe into
 * deterministic-only mode and escalates to human review. This is the guard the
 * dimensional-programming model demands: plausibility is never trusted over
 * provable truth.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ── logic gates ──
  const AND = (a, b) => a && b, OR = (a, b) => a || b, NOT = (a) => !a, XOR = (a, b) => a !== b, NAND = (a, b) => !(a && b);

  // ── manifold truth-table invariants ──
  // Each invariant must hold for any fact set. They encode physics + law that an
  // AI assessment can never legitimately contradict.
  const INVARIANTS = [
    { id: 'INV-PRESSURE-ADVISORY', desc: 'Pressure < 20 psi requires a public advisory (backflow risk).',
      holds: (f) => NOT(AND(f.pressure != null && f.pressure < 20, NOT(f.advisory))) },
    { id: 'INV-TURBIDITY-MCL', desc: 'Turbidity > 0.3 NTU cannot be judged "compliant".',
      holds: (f) => NOT(AND(f.turbidity != null && f.turbidity > 0.3, f.verdict === 'compliant')) },
    { id: 'INV-CHLORINE-MIN', desc: 'Free chlorine < 0.2 mg/L cannot be judged "compliant".',
      holds: (f) => NOT(AND(f.chlorine != null && f.chlorine < 0.2, f.verdict === 'compliant')) },
    { id: 'INV-PUMPTRIP-FLOW', desc: 'A tripped pump cannot report positive flow.',
      holds: (f) => NOT(AND(f.pumpTrip === true, f.flow != null && f.flow > 0)) },
    { id: 'INV-HEALTH-RANGE', desc: 'Health z must be a number in [0,1].',
      holds: (f) => f.z == null || (typeof f.z === 'number' && f.z >= 0 && f.z <= 1) }
  ];

  // Run all invariants over a fact set.
  function checkInvariants(facts) {
    const violations = INVARIANTS.filter((inv) => !inv.holds(facts)).map((inv) => inv.id);
    return { ok: violations.length === 0, violations };
  }

  // ── decision tree: the DETERMINISTIC compliance verdict (ground truth) ──
  function deterministicVerdict(facts) {
    if (facts.turbidity != null && facts.turbidity > 0.3) return 'violation';
    if (facts.chlorine != null && facts.chlorine < 0.2) return 'violation';
    if (facts.pressure != null && facts.pressure < 20) return 'violation';
    return 'compliant';
  }

  // ── cross-check an AI verdict against ground truth (hallucination guard) ──
  function crossCheck(aiVerdict, facts) {
    const truth = deterministicVerdict(facts);
    const inv = checkInvariants(Object.assign({ verdict: aiVerdict }, facts));
    const agree = aiVerdict === truth && inv.ok;
    return { agree, aiVerdict, truth, invariantViolations: inv.violations,
      reason: agree ? 'AI matches deterministic ground truth'
        : (!inv.ok ? 'AI verdict violates manifold invariant(s): ' + inv.violations.join(', ')
          : `AI said "${aiVerdict}" but deterministic logic says "${truth}" — rejected`) };
  }

  // ── regex / schema validation for AI-drafted records ──
  const PATTERNS = {
    citation: /^[\w][\w .§()\/-]{2,}$/,        // a plausible legal citation
    number: /^-?\d+(\.\d+)?$/
  };
  function validateDraft(record, schema) {
    const errors = [];
    schema.forEach((f) => {
      const v = record[f.key];
      if (f.type === 'number' && v != null && v !== '' && !PATTERNS.number.test(String(v))) errors.push(`${f.label} must be numeric`);
      if (f.type === 'select' && v && f.options && !f.options.includes(v)) errors.push(`${f.label} "${v}" not an allowed value`);
    });
    if (record.citation != null && record.citation !== '' && !PATTERNS.citation.test(record.citation)) errors.push('citation format implausible');
    return { ok: errors.length === 0, errors };
  }

  // ── drift state machine: TRUSTED → WATCH → FAILSAFE → HUMAN_REVIEW ──
  function DriftMonitor(opts) {
    opts = opts || {};
    this.window = opts.window || 20;
    this.samples = [];          // recent booleans: did AI agree with truth?
    this.state = 'TRUSTED';
    this.hallucinations = 0;
  }
  DriftMonitor.prototype.record = function (agreed) {
    this.samples.push(agreed ? 1 : 0);
    if (!agreed) this.hallucinations++;
    if (this.samples.length > this.window) this.samples.shift();
    const rate = this.agreementRate();
    // hysteresis: degrade fast, recover slow
    if (rate < 0.6 || this.hallucinations >= 5) this.state = 'HUMAN_REVIEW';
    else if (rate < 0.8) this.state = 'FAILSAFE';
    else if (rate < 0.95) this.state = 'WATCH';
    else if (this.samples.length >= this.window) this.state = 'TRUSTED';
    return this.state;
  };
  DriftMonitor.prototype.agreementRate = function () {
    if (!this.samples.length) return 1;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  };
  DriftMonitor.prototype.report = function () {
    return { state: this.state, agreementRate: this.agreementRate(), hallucinations: this.hallucinations,
      mode: this.state === 'TRUSTED' || this.state === 'WATCH' ? 'AI-assisted (verified)' : 'DETERMINISTIC-ONLY (AI quarantined)' };
  };

  root.HMP_VERIFY = { AND, OR, NOT, XOR, NAND, INVARIANTS, checkInvariants, deterministicVerdict, crossCheck, validateDraft, DriftMonitor };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_VERIFY;
}(typeof window !== 'undefined' ? window : globalThis));
