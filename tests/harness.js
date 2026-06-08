/* ============================================================================
 * The Conduit / HydroManifold — Test Harness
 * ----------------------------------------------------------------------------
 * A tiny, dependency-free test framework shared by every suite. Suites call
 * describe()/it() at require time, accumulating into a shared singleton; the
 * runner then prints a report and returns the failure count. Rich assertions so
 * tests read as proofs, not just smoke checks.
 * ========================================================================== */
'use strict';

const state = { suite: '', pass: 0, fail: 0, fails: [], suites: {} };

function describe(name, fn) {
  state.suite = name;
  state.suites[name] = state.suites[name] || { pass: 0, fail: 0 };
  fn();
}
function it(name, fn) {
  const s = state.suite;
  try { fn(); state.pass++; state.suites[s].pass++; }
  catch (e) { state.fail++; state.suites[s].fail++; state.fails.push(s + ' › ' + name + ' — ' + (e && e.message || e)); }
}

// ── assertions ──
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function not(c, m) { if (c) throw new Error(m || 'expected falsy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ' (got ' + fmt(a) + ', want ' + fmt(b) + ')'); }
function ne(a, b, m) { if (a === b) throw new Error((m || 'ne') + ' (both ' + fmt(a) + ')'); }
function approx(a, b, tol, m) { if (Math.abs(a - b) > (tol == null ? 1e-6 : tol)) throw new Error((m || 'approx') + ' (got ' + fmt(a) + ', want ~' + fmt(b) + ')'); }
function gt(a, b, m) { if (!(a > b)) throw new Error((m || 'gt') + ' (' + fmt(a) + ' !> ' + fmt(b) + ')'); }
function gte(a, b, m) { if (!(a >= b)) throw new Error((m || 'gte') + ' (' + fmt(a) + ' !>= ' + fmt(b) + ')'); }
function lt(a, b, m) { if (!(a < b)) throw new Error((m || 'lt') + ' (' + fmt(a) + ' !< ' + fmt(b) + ')'); }
function lte(a, b, m) { if (!(a <= b)) throw new Error((m || 'lte') + ' (' + fmt(a) + ' !<= ' + fmt(b) + ')'); }
function inRange(v, lo, hi, m) { if (!(v >= lo && v <= hi)) throw new Error((m || 'range') + ' (got ' + fmt(v) + ', want ' + lo + '..' + hi + ')'); }
function throws(fn, m) { let t = false; try { fn(); } catch (_) { t = true; } if (!t) throw new Error(m || 'expected throw'); }
function fmt(v) { return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(4)) : (typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v)); }

function report(title) {
  console.log('\n' + (title || 'Suite') + '  —  ' + state.pass + ' passed, ' + state.fail + ' failed');
  Object.keys(state.suites).forEach((s) => {
    const r = state.suites[s];
    console.log('  ' + (r.fail ? '✗' : '✓') + ' ' + s + ' (' + r.pass + '/' + (r.pass + r.fail) + ')');
  });
  if (state.fail) { console.log('\n  Failures:'); state.fails.forEach((f) => console.log('   ✗ ' + f)); }
  return state.fail;
}
function stats() { return { pass: state.pass, fail: state.fail }; }

module.exports = { describe, it, ok, not, eq, ne, approx, gt, gte, lt, lte, inRange, throws, report, stats };
