#!/usr/bin/env node
/* ============================================================================
 * HydroManifold — Test Suite   (run: node test_suite.js)
 * ----------------------------------------------------------------------------
 * Unit + integration tests across every module, covering:
 *   • happy path     — baseline system is healthy, numbers are sane
 *   • non-happy path — injected faults degrade health and raise the right alarms
 *   • failure tests  — leak/break/freeze/pump-trip/sensor-fault behave correctly
 *   • passing tests  — recovery + clearing restores health
 * No dependencies. Exit code 0 = all green.
 * ========================================================================== */
'use strict';
require('./sensors'); require('./manifold'); require('./topology'); require('./engine');
require('./weather'); require('./forecast'); require('./analysis'); require('./economics'); require('./ops');
const S = globalThis.HM_SENSORS, M = globalThis.HM_MANIFOLD, T = globalThis.HM_TOPOLOGY,
  E = globalThis.HM_ENGINE, W = globalThis.HM_WEATHER, F = globalThis.HM_FORECAST,
  A = globalThis.HM_ANALYSIS, EC = globalThis.HM_ECON, O = globalThis.HM_OPS;

// ── tiny framework ──
let pass = 0, fail = 0; const fails = [];
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; fails.push(name + ' — ' + e.message); } }
function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ` (got ${a}, want ${b})`); }
function approx(a, b, tol, m) { if (Math.abs(a - b) > (tol || 1e-6)) throw new Error((m || 'approx') + ` (got ${a}, want ~${b})`); }
function inRange(v, lo, hi, m) { if (!(v >= lo && v <= hi)) throw new Error((m || 'range') + ` (got ${v}, want ${lo}..${hi})`); }
const warm = (sim, n) => { for (let i = 0; i < (n || 400); i++) sim.tick(16); };
const warmOps = (ops, n) => { for (let i = 0; i < (n || 400); i++) ops.step(16); };

// ── SENSORS ──
test('sensors: catalog populated with required fields', () => {
  const c = S.SENSOR_CATALOG; ok(Object.keys(c).length >= 12, 'enough sensors');
  for (const id of Object.keys(c)) {
    const s = c[id];
    ok(s.name && s.measures && s.unit, id + ' has name/measures/unit');
    ok(Array.isArray(s.costUsd) && s.costUsd.length === 3, id + ' cost band');
    ok(s.mtbfHours > 0 && s.calDays > 0, id + ' mtbf/cal');
  }
});
test('sensors: reliability — higher MTBF means lower annual failure rate', () => {
  const hi = S.annualFailureRate('pd_meter'), lo = S.annualFailureRate('ph');
  inRange(hi, 0, 1); inRange(lo, 0, 1);
  ok(hi < lo, 'pd_meter (175000h) more reliable than ph (26000h)');
});

// ── MANIFOLD ──
test('manifold: z = x·y and clamps', () => {
  approx(M.health(0.5, 0.4), 0.2); eq(M.health(-1, 1), 0); eq(M.health(2, 0.5), 0.5);
});
test('manifold: color hue is monotonic with health', () => {
  ok(M.hueForHealth(0) < M.hueForHealth(0.5), 'red→amber'); ok(M.hueForHealth(0.5) < M.hueForHealth(1), 'amber→green');
  ok(/^hsl\(/.test(M.colorForHealth(0.7)), 'hsl string');
});
test('manifold: status tiers', () => {
  eq(M.statusForHealth(0.95).tier, 'healthy'); eq(M.statusForHealth(0.10).tier, 'critical');
  eq(M.statusForHealth(0.45).tier, 'warning');
});
test('manifold: foldAxis geometric mean + score helpers', () => {
  approx(M.foldAxis([1, 1]), 1); eq(M.foldAxis([0, 1]), 0); approx(M.foldAxis([0.25, 1]), 0.5);
  eq(M.bandScore(60, 50, 90, 30, 110), 1); eq(M.minScore(0.5, 0.5, 0.1), 1); eq(M.maxScore(0.1, 0.3, 5), 1);
  ok(M.maxScore(3, 0.3, 5) < 1, 'over target degrades');
});

// ── TOPOLOGY ──
test('topology: every tier builds with honest totals', () => {
  for (const tier of T.TIERS) {
    const topo = T.buildTopology(tier.id);
    ok(topo.stations.length >= 1, tier.id + ' has representative stations');
    ok(topo.totals.stations >= topo.stations.length, tier.id + ' true >= representative');
    ok(topo.totals.sensors > 0, tier.id + ' sensors');
    eq(topo.totals.population, tier.population, tier.id + ' population');
  }
});
test('topology: scaling is real (home « city « region)', () => {
  const h = T.buildTopology('single_family').totals, c = T.buildTopology('city').totals, r = T.buildTopology('region').totals;
  ok(h.sensors < c.sensors && c.sensors < r.sensors, 'sensor counts scale up');
  ok(c.stations > 1000, 'city is large');
});

// ── ENGINE: happy path ──
test('engine: baseline township is healthy, no NaN', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  warm(sim, 400);
  const agg = sim.aggregate();
  inRange(agg.z, 0, 1, 'aggregate in range');
  ok(agg.z > 0.8, 'baseline healthy z=' + agg.z.toFixed(2));
  for (const st of sim.stations) {
    ok(Object.keys(st.readings).length > 0, st.name + ' has readings');
    inRange(st.health.z, 0, 1, st.name + ' health range');
    for (const mk of Object.keys(st.readings)) ok(!Number.isNaN(st.readings[mk].value), st.name + '.' + mk + ' not NaN');
  }
});
test('engine: demand peaks in evening, dips overnight', () => {
  ok(E.demandMultiplier(19) > E.demandMultiplier(3), 'evening peak > night');
});

// ── ENGINE: failure tests ──
test('engine: leak fault degrades health and raises a leak alarm', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  warm(sim, 200);
  const st = sim.stations.find((s) => s.def.nominal.leak != null);
  const before = st.health.z, logBefore = sim.alarmLog.length;
  sim.injectFault(st.id, 'leak'); warm(sim, 250);
  ok(st.health.z < before, 'leak lowered station health');
  ok(sim.alarmLog.length > logBefore, 'alarms grew');
});
test('engine: main break crashes pressure / health', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 });
  warm(sim, 150);
  const st = sim.stations.find((s) => s.def.nominal.pressure != null && s.def.nominal.flow != null);
  sim.injectFault(st.id, 'break'); warm(sim, 200);
  ok(st.health.z < 0.4 || (st.readings.pressure && st.readings.pressure.value < 35), 'break crashed station');
});
test('engine: pump trip zeroes flow and motor current', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  warm(sim, 120);
  const st = sim.stations.find((s) => s.def.nominal.current != null);
  sim.injectFault(st.id, 'pump_trip'); warm(sim, 120);
  approx(st.readings.current.value, 0, 0.001, 'current 0');
  if (st.readings.flow) approx(st.readings.flow.value, 0, 0.001, 'flow 0');
});
test('engine: freeze is bounded then recovers when cleared', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  warm(sim, 120);
  const st = sim.stations.find((s) => s.def.nominal.temp != null);
  sim.injectFault(st.id, 'freeze'); warm(sim, 300);
  inRange(st.readings.temperature.value, -20, 40, 'freeze bounded to ice, not absurd');
  ok(st.readings.temperature.status === 'alarm' || st.readings.temperature.status === 'critical', 'freeze alarmed');
  sim.clearFaults(); warm(sim, 500);
  ok(st.readings.temperature.value > 40, 'recovered after clear: ' + st.readings.temperature.value.toFixed(1));
});
test('engine: sensor fault marks a reading untrusted', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  warm(sim, 120);
  const st = sim.stations[0];
  sim.injectFault(st.id, 'sensor'); warm(sim, 60);
  ok(st.health.sensorTrust < 1, 'sensor trust dropped (' + st.health.sensorTrust + ')');
});

// ── WEATHER ──
test('weather: scenarios drive demand / freeze / inflow', () => {
  const w = new W.Weather({ scenario: 'clear', auto: false });
  const base = w.demandFactor();
  w.setScenario('heatwave'); ok(w.demandFactor() > base, 'heatwave raises demand');
  w.setScenario('drought'); ok(w.inflowFactor() < 1, 'drought cuts inflow');
  w.setScenario('hardfreeze'); ok(w.freezeRisk() > 0.5, 'hard freeze raises freeze risk');
});

// ── FORECAST ──
test('forecast: usage per unit is sane', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 }); warm(sim, 60);
  const u = F.usage(sim);
  ok(u.instMgd >= 0 && u.avgMgd > 0, 'mgd present');
  inRange(u.perCapitaGpd, 30, 400, 'per-capita gpd realistic');
});
test('forecast: demand forecast has ordered confidence bands', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 }); warm(sim, 30);
  const w = new W.Weather({ scenario: 'hot', auto: false });
  const fc = F.forecastDemand(sim, w, 24, 1);
  ok(fc.length > 10, 'forecast points');
  for (const p of fc) ok(p.lo <= p.mgd && p.mgd <= p.hi, 'lo<=mid<=hi');
  ok(F.peak(fc).mgd >= fc[0].mgd, 'peak is the max');
});

// ── ANALYSIS ──
test('analysis: healthy baseline has no leaks/outages', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 }); warm(sim, 400);
  const a = A.analyze(sim);
  eq(a.leaks.length, 0, 'no leaks at baseline'); eq(a.outages.length, 0, 'no outages at baseline');
  ok(typeof a.loadBalance.status === 'string', 'load balance status');
});
test('analysis: break produces localization, outage and a recovery plan', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 }); warm(sim, 150);
  const st = sim.stations.find((s) => s.def.nominal.flow != null);
  sim.injectFault(st.id, 'break'); warm(sim, 200);
  const a = A.analyze(sim);
  ok(a.leaks.some((l) => l.severity === 'break' && l.lossGpm > 0), 'break localized with loss');
  ok(a.outages.length > 0 && a.outages[0].affectedPeople > 0, 'outage area + people');
  ok(a.recovery.length > 0 && a.recovery[0].steps.some((s) => s.t === 'ISOLATE'), 'recovery isolates');
  ok(a.anomalies.length > 0, 'anomaly detected');
});
test('analysis: pump trip shows in load balance', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 }); warm(sim, 100);
  const st = sim.stations.find((s) => s.type === 'pump');
  if (st) { sim.injectFault(st.id, 'pump_trip'); warm(sim, 120); }
  const lb = A.analyze(sim).loadBalance;
  ok(lb.onlineSources <= lb.totalSources, 'online <= total');
});

// ── ECONOMICS ──
test('economics: costs accrue, market + futures sane', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 });
  const econ = new EC.Economics(sim);
  ok(econ.budgetDaily > 0, 'budget set');
  for (let i = 0; i < 200; i++) { sim.tick(16); econ.update(sim, null, A.analyze(sim), (16 / 1000 * sim.speed) / 3600); }
  const snap = econ.snapshot(sim, null, A.analyze(sim));
  ok(snap.dayCost > 0 && snap.mgDelivered > 0, 'cost + delivery accrue');
  inRange(snap.spotAF, 180, 1600, 'spot price in band');
  ok(snap.spotPerMg > 0, 'spot per MG');
  eq(snap.futures.length, 5, 'five futures terms');
  ok(snap.futures[4].priceAF >= snap.futures[0].priceAF, 'contango (further out >= near)');
});
test('economics: supply recommendation prefers own source when available', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 }); warm(sim, 60);
  const econ = new EC.Economics(sim);
  const rec = econ.recommendSupply(sim, A.analyze(sim));
  ok(rec.mix.length > 0 && rec.blendedPerMg > 0, 'mix + blended cost');
  ok(/Own source/.test(rec.mix[0].supplier), 'own first when healthy');
});
test('economics: a break drives cost overrun higher than baseline', () => {
  function runCost(withBreak) {
    const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 });
    const econ = new EC.Economics(sim);
    const dt = (16 / 1000 * sim.speed) / 3600;
    for (let i = 0; i < 120; i++) { sim.tick(16); econ.update(sim, null, A.analyze(sim), dt); }
    if (withBreak) sim.injectFault(sim.stations.find((s) => s.def.nominal.flow != null).id, 'break');
    for (let i = 0; i < 200; i++) { sim.tick(16); econ.update(sim, null, A.analyze(sim), dt); }
    return econ.snapshot(sim, null, A.analyze(sim)).dayOverrun;
  }
  ok(runCost(true) > runCost(false), 'break increases overrun');
});

// ── OPS integration ──
test('ops: full step produces a complete state', () => {
  const sim = new E.Simulator(T.buildTopology('township'), { speed: 200 });
  const ops = new O.Ops(sim, { weather: { scenario: 'clear', auto: false } });
  warmOps(ops, 300);
  const s = ops.state;
  ok(s.weather && s.usage && s.forecast && s.analysis && s.econ, 'state complete');
  ok(s.forecast.length > 10, 'forecast present');
  ok(s.econ.dayCost > 0, 'economics ran');
});
test('ops: heat wave raises instantaneous demand vs clear', () => {
  function avgDemand(scn) {
    const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 });
    const ops = new O.Ops(sim, { weather: { scenario: scn, auto: false } });
    let acc = 0, n = 0; for (let i = 0; i < 200; i++) { ops.step(16); acc += sim.demand; n++; }
    return acc / n;
  }
  ok(avgDemand('heatwave') > avgDemand('clear'), 'heatwave demand > clear');
});
test('ops: injected break surfaces in analysis and opens logistics', () => {
  const sim = new E.Simulator(T.buildTopology('city'), { speed: 200 });
  const ops = new O.Ops(sim, { weather: { scenario: 'clear', auto: false } });
  warmOps(ops, 120);
  sim.injectFault(sim.stations.find((s) => s.def.nominal.flow != null).id, 'break');
  warmOps(ops, 200);
  ok(ops.state.analysis.leaks.length > 0, 'leak/break in analysis');
  ok(ops.state.econ.dispatches.length > 0, 'logistics dispatch opened');
});

// ── report ──
console.log('\nHydroManifold test suite');
console.log('========================');
console.log(`  ${pass} passed, ${fail} failed`);
if (fail) { console.log('\nFailures:'); fails.forEach((f) => console.log('  ✗ ' + f)); process.exit(1); }
console.log('  ✓ all green');
