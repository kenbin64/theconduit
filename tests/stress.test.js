/* ============================================================================
 * Stress & scale — large topologies, long runs, load on the tamper-evident
 * spine, performance bounds, and mass simultaneous failure.
 * ============================================================================ */
'use strict';
const T = require('./harness');
require('../sensors'); require('../manifold'); require('../topology'); require('../engine');
const E = globalThis.HM_ENGINE, TOP = globalThis.HM_TOPOLOGY;
const SEAL = require('../platform/seal');
const AUD = require('../platform/audit');
const REG = require('../platform/registry');

const ms = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };

// ── SCALE: seed→bloom keeps representative stations bounded at any true size ──
T.describe('stress: scale (seed → bloom)', () => {
  T.it('region is millions of sensors but renders a bounded representative set', () => {
    const region = TOP.buildTopology('region').totals;
    T.gt(region.sensors, 1e6, 'true scale is in the millions (' + region.sensors.toLocaleString() + ' sensors)');
    T.lt(TOP.buildTopology('region').stations.length, 500, 'representative stations stay bounded (no million divs)');
    const home = TOP.buildTopology('single_family').totals, city = TOP.buildTopology('city').totals;
    T.ok(home.sensors < city.sensors && city.sensors < region.sensors, 'monotone scaling home « city « region');
  });
});

// ── LONG RUN: a city simulated for thousands of ticks stays sane ──
T.describe('stress: long-run stability', () => {
  T.it('5000 ticks: no NaN, health stays in [0,1], aggregate stable', () => {
    const sim = new E.Simulator(TOP.buildTopology('city'), { speed: 300 });
    let worst = 1, ok = true;
    for (let i = 0; i < 5000; i++) {
      sim.tick(16);
      if (i % 250 === 0) {
        const z = sim.aggregate().z; if (Number.isNaN(z) || z < 0 || z > 1) ok = false; worst = Math.min(worst, z);
        for (const st of sim.stations) for (const k of Object.keys(st.readings)) if (Number.isNaN(st.readings[k].value)) ok = false;
      }
    }
    T.ok(ok, 'no NaN / out-of-range across the whole run'); T.gt(worst, 0.5, 'undisturbed system never silently degrades');
  });
});

// ── LOAD: tamper-evident audit chain under thousands of events ──
T.describe('stress: audit chain under load', () => {
  T.it('5000 events still form one verifiable chain, and detection still pinpoints tampering', () => {
    const log = new AUD.AuditLog({ store: REG.memoryStore(), ns: 'load' });
    const t = ms(() => { for (let i = 0; i < 5000; i++) log.append('U-' + (i % 7), 'operator', 'view', 'dash', 'event ' + i); });
    T.ok(log.verify().ok, 'chain intact at 5000 events');
    T.lt(t, 4000, 'append throughput is reasonable (' + t.toFixed(0) + 'ms for 5000)');
    log.entries[2500].detail = 'forged'; const v = log.verify(); T.not(v.ok, 'tamper still caught'); T.eq(v.brokenAt, 2500, 'still pinpoints it');
  });
});

// ── LOAD: manifold seal over thousands of ingested parameters ──
T.describe('stress: seal under load', () => {
  T.it('2000 sealed parameters all verify and the shape keeps folding', () => {
    const seal = new SEAL.ManifoldSeal({ key: 'k' });
    const rows = [];
    for (let i = 0; i < 2000; i++) {
      const r = { idx: i, v: 'param-' + i };
      const info = seal.ingest(r, 'U-1', 'engineer', null);
      r._by = 'U-1'; r._role = 'engineer'; r._prevShape = info.prevShape; r._sig = info.signature; rows.push(r);
    }
    let bad = 0; for (const r of rows) if (!seal.verify(r, null)) bad++;
    T.eq(bad, 0, 'all 2000 verify'); T.ok(/^[0-9a-f]{8}$/.test(seal.shape), 'shape is a well-formed digest');
  });
});

// ── MASS FAILURE: inject a fault into EVERY station at once ──
T.describe('stress: mass simultaneous failure', () => {
  T.it('faulting every station does not crash the engine; aggregate stays finite and collapses', () => {
    const sim = new E.Simulator(TOP.buildTopology('city'), { speed: 200 });
    for (let i = 0; i < 100; i++) sim.tick(16);
    const types = ['leak', 'break', 'freeze', 'pump_trip', 'sensor', 'quality'];
    sim.stations.forEach((s, i) => sim.injectFault(s.id, types[i % types.length]));
    for (let i = 0; i < 300; i++) sim.tick(16);
    const z = sim.aggregate().z;
    T.ok(!Number.isNaN(z) && z >= 0 && z <= 1, 'aggregate finite & bounded under total failure');
    T.lt(z, 0.6, 'system correctly reads degraded (' + z.toFixed(2) + ')');
    for (const st of sim.stations) for (const k of Object.keys(st.readings)) T.ok(!Number.isNaN(st.readings[k].value), st.name + '.' + k + ' finite');
  });
});

module.exports = true;
