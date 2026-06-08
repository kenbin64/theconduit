/* ============================================================================
 * HydroManifold Platform — AI assist (guarded)
 * Drafts records from plain language and produces assessments, but NOTHING the
 * AI emits is trusted until verify.js cross-checks it. A real LLM can be wired
 * in at draftRecord(); the guardrail (validateDraft + crossCheck + DriftMonitor)
 * stays identical regardless of the model behind it.
 * ========================================================================== */
(function (root) {
  'use strict';
  const V = root.HMP_VERIFY;

  // Heuristic NL → record. (Swap this body for an LLM call; the verifier around
  // it does not change — that is the whole point of the failsafe design.)
  function draftRecord(colId, schema, text) {
    const t = (text || '').toLowerCase();
    const rec = { source: 'AI-assist' };
    const num = (text.match(/-?\d+(\.\d+)?/) || [])[0];
    schema.forEach((f) => {
      if (f.key === 'title' || f.key === 'requirement' || f.key === 'desc' || f.key === 'notes') rec[f.key] = text;
      else if (f.key === 'threshold' && num != null) rec[f.key] = parseFloat(num);
      else if (f.key === 'level') rec[f.key] = /federal|epa|cfr|sdwa/.test(t) ? 'Federal' : /state/.test(t) ? 'State' : /city|local|muni/.test(t) ? 'Local/City' : 'State';
      else if (f.key === 'parameter') rec[f.key] = ['turbidity', 'chlorine', 'pressure', 'ph', 'temperature'].find((p) => t.includes(p)) || 'none';
      else if (f.key === 'op') rec[f.key] = t.includes('at least') || t.includes('min') || t.includes('≥') || t.includes('>=') ? '>=' : t.includes('≤') || t.includes('max') || t.includes('<=') || t.includes('not exceed') ? '<=' : 'n/a';
      else if (f.key === 'unit') rec[f.key] = (text.match(/\b(NTU|mg\/L|psi|pH|°F|ppt|ppb)\b/i) || [''])[0];
      else if (f.key === 'status') rec[f.key] = 'pending';
      else if (f.key === 'citation') rec[f.key] = (text.match(/\b\d+\s*CFR\s*[\d.]+\b/i) || ['AI-DRAFT'])[0];
    });
    const validation = V.validateDraft(rec, schema);
    return { record: rec, validation, accepted: validation.ok };
  }

  // AI compliance assessment. In normal mode it mirrors ground truth; pass
  // {hallucinate:true} to force a wrong "all compliant" to demonstrate the
  // failsafe catching it.
  function assess(facts, opts) {
    if (opts && opts.hallucinate) return 'compliant';
    return V.deterministicVerdict(facts);   // a real model would reason; we then verify it
  }

  root.HMP_AI = { draftRecord, assess };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_AI;
}(typeof window !== 'undefined' ? window : globalThis));
