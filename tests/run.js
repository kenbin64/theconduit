#!/usr/bin/env node
/* ============================================================================
 * The Conduit / HydroManifold — master test runner
 * ----------------------------------------------------------------------------
 * Runs everything and returns one verdict:
 *   • harness suites: platform unit, geometry/science proofs, scenarios, stress
 *   • the existing engine suite (test_suite.js)
 *   • the license / go-live gate suite (tools/test-license.js)
 * Exit code 0 = all green.   Run:  node tests/run.js
 * ========================================================================== */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const T = require('./harness');

// ── harness suites (execute on require) ──
require('./unit-platform.test');
require('./geometry.test');
require('./scenarios.test');
require('./stress.test');
const harnessFail = T.report('Harness suites — platform · geometry · scenarios · stress');
const h = T.stats();

// ── existing standalone suites ──
function runStandalone(cmd, label) {
  let out = '';
  try { out = execSync('node ' + cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }); }
  catch (e) { out = String((e.stdout || '') + (e.stderr || '')); }
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  const pass = m ? +m[1] : 0, fail = m ? +m[2] : 1;
  console.log('\n' + label + '  —  ' + pass + ' passed, ' + fail + ' failed  ' + (fail ? '✗' : '✓'));
  if (!m) console.log(out.slice(-600));
  return { pass, fail };
}
const eng = runStandalone('test_suite.js', 'Engine suite (test_suite.js)');
const lic = runStandalone('tools/test-license.js', 'License / go-live gate (tools/test-license.js)');

const totalPass = h.pass + eng.pass + lic.pass;
const totalFail = harnessFail + eng.fail + lic.fail;
console.log('\n' + '═'.repeat(64));
console.log('  GRAND TOTAL:  ' + totalPass + ' passed, ' + totalFail + ' failed   ' + (totalFail ? '❌' : '✅ all green'));
console.log('═'.repeat(64));
process.exit(totalFail ? 1 : 0);
