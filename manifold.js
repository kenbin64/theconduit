/* ============================================================================
 * HydroManifold — Manifold Health Model  (z = x · y)
 * ----------------------------------------------------------------------------
 * Every monitored station collapses its sensor stack onto ONE health scalar
 * using the manifold primitive z = x · y, where:
 *
 *   x = SUPPLY ADEQUACY   — is there enough water, at the right pressure,
 *                           with adequate reserves?  (capacity / flow / pressure / level)
 *   y = INTEGRITY & QUALITY — is the water safe and the asset intact?
 *                           (no leak/break/freeze, quality in spec, sensors trustworthy)
 *
 *   z = x · y  ∈ [0,1]     — overall station health.
 *
 * Why MULTIPLY (not average): a station with perfect pressure but contaminated
 * water is NOT healthy; a main with great water quality but an active leak is
 * NOT healthy. A single failing axis must collapse the whole. A sum would let
 * a strong axis mask a failing one — exactly the bug you don't want in water.
 * The product is the honest physics.
 *
 * z then maps to a color spectrum (red→amber→green) and to operator status
 * tiers with real alarm semantics. This is the "z=x·y color spectrum health
 * check" rendered everywhere in the UI.
 * ========================================================================== */
(function (root) {
  'use strict';

  const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;

  // Fold a set of sub-scores (each 0..1, 1=good) into one axis. We use the
  // geometric mean so the weakest sub-score dominates — same logic as z=x·y,
  // applied within an axis.
  function foldAxis(scores) {
    const vals = scores.filter((v) => typeof v === 'number');
    if (!vals.length) return 1;
    let prod = 1;
    for (const v of vals) prod *= clamp01(v);
    return Math.pow(prod, 1 / vals.length);
  }

  // The manifold primitive.
  function health(x, y) { return clamp01(x) * clamp01(y); }

  // z (health 0..1) → operator status tier with real alarm meaning.
  const STATUS = [
    { min: 0.80, tier: 'healthy',  label: 'Healthy',   severity: 0 },
    { min: 0.55, tier: 'watch',    label: 'Watch',     severity: 1 },
    { min: 0.35, tier: 'warning',  label: 'Warning',   severity: 2 },
    { min: 0.18, tier: 'alarm',    label: 'Alarm',     severity: 3 },
    { min: 0.00, tier: 'critical', label: 'CRITICAL',  severity: 4 },
  ];
  function statusForHealth(z) {
    z = clamp01(z);
    for (const s of STATUS) if (z >= s.min) return s;
    return STATUS[STATUS.length - 1];
  }

  // z → color. Red (0, critical) → amber (~0.5) → green (1, healthy).
  // Hue 0°=red, 130°=green; we bias the curve so "warning" reads amber, not
  // a deceptively-greenish yellow.
  function colorForHealth(z) {
    z = clamp01(z);
    const hue = 130 * Math.pow(z, 1.15);       // 0→red, 1→green, amber in the middle
    const sat = 90;
    const light = 38 + 14 * z;                 // brighter as it gets healthier
    return `hsl(${hue.toFixed(0)}, ${sat}%, ${light.toFixed(0)}%)`;
  }

  // Same spectrum, returned as the raw hue so the UI can glow LEDs etc.
  function hueForHealth(z) { return 130 * Math.pow(clamp01(z), 1.15); }

  // Normalizers — turn a raw reading into a 0..1 "goodness" against a healthy
  // band. Used to build the x and y axes from real sensor values.
  //
  // bandScore: 1 inside [good-lo, good-hi], falling to 0 at the alarm limits.
  function bandScore(value, goodLo, goodHi, alarmLo, alarmHi) {
    if (value >= goodLo && value <= goodHi) return 1;
    if (value < goodLo) return clamp01((value - alarmLo) / (goodLo - alarmLo));
    return clamp01((alarmHi - value) / (alarmHi - goodHi));
  }
  // minScore: 1 at/above target, 0 at the floor (e.g., chlorine residual, reserves).
  function minScore(value, target, floor) {
    if (value >= target) return 1;
    return clamp01((value - floor) / (target - floor));
  }
  // maxScore: 1 at/below target, 0 at the ceiling (e.g., turbidity, vibration).
  function maxScore(value, target, ceiling) {
    if (value <= target) return 1;
    return clamp01((ceiling - value) / (ceiling - target));
  }

  root.HM_MANIFOLD = {
    health, foldAxis, statusForHealth, colorForHealth, hueForHealth,
    bandScore, minScore, maxScore, clamp01, STATUS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_MANIFOLD;

}(typeof window !== 'undefined' ? window : globalThis));
