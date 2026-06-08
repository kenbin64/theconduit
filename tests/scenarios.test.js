/* ============================================================================
 * Real-world scenarios — catastrophic failure, recovery, and resilience
 * ============================================================================ */
'use strict';
const T = require('./harness');
require('../sensors'); require('../manifold'); require('../topology'); require('../engine');
require('../weather'); require('../forecast'); require('../analysis'); require('../economics'); require('../ops');
const E = globalThis.HM_ENGINE, TOP = globalThis.HM_TOPOLOGY, A = globalThis.HM_ANALYSIS;
const V = require('../platform/verify');
const SEAL = require('../platform/seal');
const AUD = require('../platform/audit');
const REG = require('../platform/registry');
const LIC = require('../license');
const SCH = require('../platform/schemas');
const { samples } = require('../tools/issue-authorization');

const warm = (sim, n) => { for (let i = 0; i < (n || 300); i++) sim.tick(16); };

// ── CATASTROPHE: simultaneous break + pump-trip + quality upset, then recovery ──
T.describe('scenario: catastrophic multi-fault + recovery', () => {
  T.it('healthy → triple catastrophe collapses the system → clearing recovers it', () => {
    const sim = new E.Simulator(TOP.buildTopology('city'), { speed: 200 });
    warm(sim, 180);
    const base = sim.aggregate().z; T.gt(base, 0.8, 'baseline healthy (' + base.toFixed(2) + ')');
    const alarmsBefore = sim.alarmLog.length;

    sim.injectFault(sim.stations.find((s) => s.def.nominal.flow != null && s.def.nominal.pressure != null).id, 'break');
    const pump = sim.stations.find((s) => s.type === 'pump'); if (pump) sim.injectFault(pump.id, 'pump_trip');
    const q = sim.stations.find((s) => s.def.nominal.chlorine != null || s.def.nominal.turbidity != null); if (q) sim.injectFault(q.id, 'quality');
    warm(sim, 300);

    T.lt(sim.aggregate().z, base, 'system health dropped');
    T.gt(sim.alarmLog.length, alarmsBefore, 'alarms raised');
    const a = A.analyze(sim);
    T.ok(a.leaks.length > 0 || a.outages.length > 0, 'failures localized');
    T.ok(a.recovery.length > 0 && a.recovery[0].steps.length > 0, 'recovery plan generated');

    sim.clearFaults(); warm(sim, 700);
    T.gt(sim.aggregate().z, 0.75, 'system recovers to healthy after clearing (' + sim.aggregate().z.toFixed(2) + ')');
  });
});

// ── WORST-POINT DOMINANCE: one failing station drags the whole system ──
T.describe('scenario: worst-point dominates (no hiding behind healthy peers)', () => {
  T.it('a single critical station collapses the system aggregate (multiply, not average)', () => {
    const sim = new E.Simulator(TOP.buildTopology('city'), { speed: 200 });
    warm(sim, 150);
    const base = sim.aggregate().z; T.gt(base, 0.8);
    sim.injectFault(sim.stations.find((s) => s.def.nominal.flow != null && s.def.nominal.pressure != null).id, 'break');
    warm(sim, 250);
    // an AVERAGE over many healthy stations would barely move; worst-point dominance moves it a lot
    T.lt(sim.aggregate().z, base - 0.2, 'one break meaningfully drags the whole system (' + sim.aggregate().z.toFixed(2) + ')');
  });
});

// ── RESILIENCE: failsafe AI quarantine is sticky until a human clears it ──
T.describe('scenario: failsafe AI quarantine (resilience)', () => {
  T.it('sustained hallucination quarantines AI; agreements alone do NOT silently clear it; only a human reset does', () => {
    const drift = new V.DriftMonitor();
    const violation = { turbidity: 5, chlorine: 1, pressure: 60 };
    for (let i = 0; i < 8; i++) { const cc = V.crossCheck('compliant', violation); T.not(cc.agree, 'each lie caught'); drift.record(cc.agree); }
    T.eq(drift.report().state, 'HUMAN_REVIEW', 'quarantined to deterministic-only');

    const good = { turbidity: 0.1, chlorine: 1, pressure: 60 };
    for (let i = 0; i < 40; i++) drift.record(V.crossCheck('compliant', good).agree);   // AI now behaves
    T.eq(drift.report().state, 'HUMAN_REVIEW', 'stays quarantined (≥5 hallucinations on record) — no silent recovery');

    drift.state = 'TRUSTED'; drift.samples = []; drift.hallucinations = 0;              // credentialed human override
    for (let i = 0; i < 25; i++) drift.record(true);
    T.eq(drift.report().state, 'TRUSTED', 'restored only after human review');
  });
});

// ── RESILIENCE: tamper-evidence end-to-end (seal + audit) ──
T.describe('scenario: tamper-evidence (seal + audit)', () => {
  T.it('any change to a sealed record OR a past audit entry is detected', () => {
    const seal = new SEAL.ManifoldSeal({ key: 'k' });
    const rec = { citation: '40 CFR 141.72', threshold: 0.2 };
    const info = seal.ingest(rec, 'U-1', 'compliance_officer', null);
    rec._by = 'U-1'; rec._role = 'compliance_officer'; rec._prevShape = info.prevShape; rec._sig = info.signature;
    T.ok(seal.verify(rec, null), 'sealed record verifies');
    const forged = Object.assign({}, rec, { threshold: 0.0 }); T.not(seal.verify(forged, null), 'altered limit detected');

    const log = new AUD.AuditLog({ store: REG.memoryStore(), ns: 's' });
    for (let i = 0; i < 30; i++) log.append('U-1', 'compliance_officer', i === 10 ? 'violation' : 'view', 'regulations', 'e' + i);
    T.ok(log.verify().ok, 'chain intact');
    log.entries[15].action = 'view-altered'; T.not(log.verify().ok, 'history tamper detected');
  });
});

// ── RESILIENCE: the operate-gate refuses on a missing prerequisite ──
T.describe('scenario: go-live gate withstands a missing prerequisite', () => {
  const REQUIRED = globalThis.HM_SENSORS.defaultSensors();
  const components = SCH.COLLECTIONS.find((c) => c.id === 'components').seed;
  const prereqs = () => JSON.parse(JSON.stringify(SCH.COLLECTIONS.find((c) => c.id === 'commissioning').seed));
  const TODAY = '2026-06-08';
  T.it('AUTHORIZED with full commissioning; BLOCKED if a mandatory prerequisite lapses; restored when fixed', () => {
    const bundle = (pr) => ({ authorization: samples.statePrimacy, requiredClasses: REQUIRED, complianceClasses: ['turbidity', 'ph', 'chlorine_residual'], components, prerequisites: pr });
    let g = LIC.deployGate(LIC.commissioningTests(bundle(prereqs()), { today: TODAY }), []);
    T.ok(g.canDeploy && g.recommendation === 'GO', 'go-live authorized when fully commissioned');

    const lapsed = prereqs(); lapsed[0].status = 'pending';            // sample siting plan lapses
    g = LIC.deployGate(LIC.commissioningTests(bundle(lapsed), { today: TODAY }), []);
    T.not(g.canDeploy, 'blocked — a mandatory prerequisite is open'); T.eq(g.recommendation, 'NO-GO');

    lapsed[0].status = 'on-file';                                      // remediated
    g = LIC.deployGate(LIC.commissioningTests(bundle(lapsed), { today: TODAY }), []);
    T.ok(g.canDeploy, 'restored once remediated');
  });
});

module.exports = true;
