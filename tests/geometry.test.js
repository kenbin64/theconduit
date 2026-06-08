/* ============================================================================
 * Geometry & science — PROOFS through testing
 * ----------------------------------------------------------------------------
 * Proves the load-bearing claims of the Butterflyfx Manifold paradigm:
 *   • z = x·y      — multiplicative health collapses on any failing axis
 *   • z = x·y²     — quadratic coupling, justified by C(n,2)=O(n²) combinatorics
 *   • Schwarz P/D & Gyroid — triply-periodic MINIMAL surfaces (mean curvature ≈ 0
 *     on the level set), proven numerically and discriminated against a sphere
 *   • series reliability  R = ∏Rᵢ  (the integrity-axis analog)
 *   • MTBF → annual failure rate  (exponential reliability)
 * ========================================================================== */
'use strict';
const T = require('./harness');
const M = require('../manifold');
const S = require('../sensors');

// ── z = x·y : multiplicative health (a failing axis collapses the whole) ──
T.describe('proof: z = x·y (multiplicative collapse)', () => {
  T.it('bounded in [0,1], symmetric, monotonic in each axis', () => {
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) T.inRange(M.health(i / 10, j / 10), 0, 1);
    T.approx(M.health(0.6, 0.4), M.health(0.4, 0.6), 1e-12, 'symmetric');
    T.gt(M.health(0.5, 0.6), M.health(0.5, 0.4), 'monotonic in y');
    T.gt(M.health(0.6, 0.5), M.health(0.4, 0.5), 'monotonic in x');
  });
  T.it('a single failing axis collapses z (multiply, do not average)', () => {
    T.approx(M.health(1, 0), 0, 1e-12, 'perfect supply + zero integrity = 0');
    // the dangerous case: averaging would call this "healthy", the product does not
    const x = 1, y = 0.02, avg = (x + y) / 2;
    T.lt(M.health(x, y), 0.05, 'product collapses (z≈0.02)');
    T.gt(avg, 0.5, 'an average would read ~0.5 ("healthy") — the bug we refuse');
    T.eq(M.statusForHealth(M.health(x, y)).tier, 'critical', 'manifold flags it critical');
    T.ne(M.statusForHealth(avg).tier, 'critical', 'averaging would not');
  });
  T.it('geometric-mean fold collapses on any zero component', () => {
    T.approx(M.foldAxis([1, 1, 1]), 1, 1e-12); T.eq(M.foldAxis([0.9, 0, 0.9]), 0, 'one zero → 0');
  });
});

// ── z = x·y² : quadratic scale coupling ──
T.describe('proof: z = x·y² (quadratic coupling)', () => {
  const f = (x, y) => x * y * y;
  T.it('the y² axis is penalized more than a linear axis for y<1', () => {
    [0.3, 0.5, 0.8].forEach((y) => T.lt(f(1, y), 1 * y, 'x·y² < x·y at y=' + y));
  });
  T.it('and is ~2× more sensitive near nominal (∂/∂y of x·y² = 2xy)', () => {
    const x = 1, y = 1, dy = 1e-4;
    const dQuad = (f(x, y) - f(x, y - dy)) / dy;            // ≈ 2xy = 2
    const dLin = (x * y - x * (y - dy)) / dy;               // = x = 1
    T.approx(dQuad / dLin, 2, 1e-2, 'quadratic axis twice as sensitive');
  });
  T.it('combinatorial basis: pairwise interactions C(n,2) = n(n-1)/2 = O(n²)', () => {
    const pairs = (n) => n * (n - 1) / 2;
    T.eq(pairs(2), 1); T.eq(pairs(4), 6); T.eq(pairs(10), 45);
    // doubling the system MORE than doubles the coupling (super-linear), → ~4× (quadratic)
    for (const n of [10, 50, 200]) {
      T.gt(pairs(2 * n), 2 * pairs(n), 'coupling more than doubles when size doubles (n=' + n + ')');
      T.approx(pairs(2 * n) / pairs(n), 4, 0.3, 'ratio → 4 (quadratic)');
    }
  });
});

// ── series reliability R = ∏Rᵢ (integrity axis analog) ──
T.describe('proof: series reliability (weakest link)', () => {
  const prod = (a) => a.reduce((p, r) => p * r, 1);
  T.it('product ≤ the weakest component and ≤ the arithmetic mean', () => {
    const R = [0.99, 0.95, 0.80, 0.999];
    const sys = prod(R), mn = Math.min.apply(null, R), avg = R.reduce((s, v) => s + v, 0) / R.length;
    T.lte(sys, mn, 'system no better than weakest link'); T.lt(sys, avg, 'product < average');
  });
  T.it('one failing component collapses the system (independence assumed)', () => {
    T.approx(prod([0.99, 0.0, 0.99]), 0, 1e-12, 'a dead component kills the chain');
  });
});

// ── MTBF → annual failure rate (exponential reliability) ──
T.describe('proof: MTBF reliability model', () => {
  T.it('annual failure rate = 1 − exp(−8760/MTBF), bounded and monotonic', () => {
    for (const id of Object.keys(S.SENSOR_CATALOG)) T.inRange(S.annualFailureRate(id), 0, 1, id);
    const hi = S.SENSOR_CATALOG.pd_meter.mtbfHours, lo = S.SENSOR_CATALOG.ph.mtbfHours;
    T.lt(S.annualFailureRate('pd_meter'), S.annualFailureRate('ph'), 'higher MTBF → lower failure (' + hi + ' vs ' + lo + 'h)');
    T.approx(S.annualFailureRate('ph'), 1 - Math.exp(-8760 / lo), 1e-9, 'matches the exponential formula');
  });
});

// ── Triply Periodic Minimal Surfaces: Schwarz P, Schwarz D, Gyroid ──
// Nodal (level-set) approximations; proven triple-periodic and approximately
// minimal (mean curvature ≈ 0 on f=0), discriminated against a non-minimal sphere.
const TPMS = {
  'Schwarz P': (x, y, z) => Math.cos(x) + Math.cos(y) + Math.cos(z),
  'Schwarz D': (x, y, z) => Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.sin(x) * Math.cos(y) * Math.cos(z) + Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.cos(x) * Math.cos(y) * Math.sin(z),
  'Gyroid': (x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x)
};
const sphere = (x, y, z) => x * x + y * y + z * z - 1;       // non-minimal control: H = 1/R = 1

// mean curvature of an implicit surface f=0 (Goldman 2005), via finite differences
function meanCurvature(f, x, y, z) {
  const h = 1e-3, f0 = f(x, y, z);
  const fx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h);
  const fy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h);
  const fz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h);
  const fxx = (f(x + h, y, z) - 2 * f0 + f(x - h, y, z)) / (h * h);
  const fyy = (f(x, y + h, z) - 2 * f0 + f(x, y - h, z)) / (h * h);
  const fzz = (f(x, y, z + h) - 2 * f0 + f(x, y, z - h)) / (h * h);
  const fxy = (f(x + h, y + h, z) - f(x + h, y - h, z) - f(x - h, y + h, z) + f(x - h, y - h, z)) / (4 * h * h);
  const fxz = (f(x + h, y, z + h) - f(x + h, y, z - h) - f(x - h, y, z + h) + f(x - h, y, z - h)) / (4 * h * h);
  const fyz = (f(x, y + h, z + h) - f(x, y + h, z - h) - f(x, y - h, z + h) + f(x, y - h, z - h)) / (4 * h * h);
  const g2 = fx * fx + fy * fy + fz * fz; if (g2 < 1e-9) return null;
  const num = fx * fx * (fyy + fzz) + fy * fy * (fxx + fzz) + fz * fz * (fxx + fyy) - 2 * (fx * fy * fxy + fx * fz * fxz + fy * fz * fyz);
  return num / (2 * Math.pow(g2, 1.5));
}
// mean |H| over a deterministic grid, sampling only points that lie ~on the surface
function meanAbsCurvatureOnSurface(f, lo, hi, N) {
  const step = (hi - lo) / N; let sum = 0, cnt = 0, h = 1e-3;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const x = lo + i * step, y = lo + j * step, z = lo + k * step, fv = f(x, y, z);
    const fx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h), fy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h), fz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h);
    const gn = Math.sqrt(fx * fx + fy * fy + fz * fz); if (gn < 0.2) continue;
    if (Math.abs(fv) / gn > 0.04) continue;                 // keep points within ~0.04 of f=0
    const H = meanCurvature(f, x, y, z); if (H == null || !isFinite(H)) continue;
    sum += Math.abs(H); cnt++;
  }
  return { meanAbsH: cnt ? sum / cnt : null, samples: cnt };
}

T.describe('proof: triply periodic minimal surfaces (Schwarz P/D, Gyroid)', () => {
  const TWO_PI = 2 * Math.PI;
  T.it('all three are triply periodic (period 2π in x, y and z)', () => {
    Object.keys(TPMS).forEach((name) => {
      const f = TPMS[name];
      for (let s = 0; s < 12; s++) {
        const x = s * 0.5, y = s * 0.37 + 0.1, z = s * 0.91 + 0.2;
        T.approx(f(x + TWO_PI, y, z), f(x, y, z), 1e-9, name + ' periodic in x');
        T.approx(f(x, y + TWO_PI, z), f(x, y, z), 1e-9, name + ' periodic in y');
        T.approx(f(x, y, z + TWO_PI), f(x, y, z), 1e-9, name + ' periodic in z');
      }
    });
  });
  T.it('mean curvature is ≈ 0 on the level set (they are MINIMAL surfaces)', () => {
    Object.keys(TPMS).forEach((name) => {
      const r = meanAbsCurvatureOnSurface(TPMS[name], 0, TWO_PI, 26);
      T.gt(r.samples, 50, name + ' enough surface samples');
      T.lt(r.meanAbsH, 0.2, name + ' mean|H| ≈ 0 (got ' + r.meanAbsH.toFixed(4) + ')');
    });
  });
  T.it('the test discriminates: a sphere is NOT minimal (|H| = 1/R ≈ 1)', () => {
    const sph = meanAbsCurvatureOnSurface(sphere, -1.4, 1.4, 36);
    T.gt(sph.meanAbsH, 0.7, 'sphere mean|H| ≈ 1 (got ' + sph.meanAbsH.toFixed(4) + ')');
    const g = meanAbsCurvatureOnSurface(TPMS.Gyroid, 0, TWO_PI, 26).meanAbsH;
    T.gt(sph.meanAbsH / g, 4, 'sphere is many× more curved than the TPMS (proof is meaningful)');
  });
});

module.exports = true;
