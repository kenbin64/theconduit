/* ============================================================================
 * The Conduit / HydroManifold — In-browser test runner (live)
 * ----------------------------------------------------------------------------
 * A SELECTIVE but representative subset of the full harness, runnable in the
 * browser against the real loaded modules (window.HM_*). Streams results live
 * (async, yielding between tests) so the page can show pass/fail in real time.
 * The FULL suite (123 checks incl. heavy stress/scale) runs in CI via
 * `node tests/run.js`; this is the demo-weight live edition.
 *   window.HM_TESTS = { run, benchmarks, geometry, integrity }
 * ========================================================================== */
(function (root) {
  'use strict';
  const W = root;

  // ── tiny assertions ──
  function ok(c, m) { if (!c) throw new Error(m || 'expected truthy'); }
  function not(c, m) { if (c) throw new Error(m || 'expected falsy'); }
  function eq(a, b, m) { if (a !== b) throw new Error((m || 'eq') + ' (got ' + a + ', want ' + b + ')'); }
  function ne(a, b, m) { if (a === b) throw new Error((m || 'ne') + ' (both ' + a + ')'); }
  function approx(a, b, t, m) { if (Math.abs(a - b) > (t == null ? 1e-6 : t)) throw new Error((m || 'approx') + ' (got ' + a + ', ~' + b + ')'); }
  function gt(a, b, m) { if (!(a > b)) throw new Error((m || 'gt') + ' (' + a + ' !> ' + b + ')'); }
  function lt(a, b, m) { if (!(a < b)) throw new Error((m || 'lt') + ' (' + a + ' !< ' + b + ')'); }
  function lte(a, b, m) { if (!(a <= b)) throw new Error((m || 'lte') + ' (' + a + ' !<= ' + b + ')'); }
  function inRange(v, lo, hi, m) { if (!(v >= lo && v <= hi)) throw new Error((m || 'range') + ' (' + v + ' not ' + lo + '..' + hi + ')'); }

  const M = W.HM_MANIFOLD, S = W.HM_SENSORS, TOP = W.HM_TOPOLOGY, E = W.HM_ENGINE, LIC = W.HM_LICENSE, DEP = W.HM_DEPLOY,
    SEAL = W.HMP_SEAL, AUD = W.HMP_AUDIT, RB = W.HMP_RBAC, V = W.HMP_VERIFY, REG = W.HMP_REGISTRY, PPL = W.HMP_PEOPLE,
    NOTIFY = W.HM_NOTIFY, ANL = W.HMP_ANALYTICS, SCH = W.HMP_SCHEMAS;
  const warm = (sim, n) => { for (let i = 0; i < (n || 150); i++) sim.tick(16); };
  const sampleAuth = () => { const a = { product: 'HydroManifold', schemaVersion: 1, authorizationId: 'ST-1', authorizationType: 'state-primacy', authority: { id: 'state-primacy', name: 'State DDW', type: 'primacy' }, pws: { pwsid: 'UT18025', name: 'NE Zone', classification: 'CWS', source: 'GW', populationServed: 42000, connections: 12750 }, orc: { name: 'J. Rivera', certNumber: 'UT-IV-1' }, issued: '2026-01-15', notBefore: '2026-02-01', expires: '2029-01-31' }; a.sig = LIC.sign(a); return a; };
  const TODAY = '2026-06-08';

  // ── curated suites ──
  const SUITES = [];
  function suite(name, fn) { const tests = []; fn((n, f) => tests.push({ name: n, fn: f })); SUITES.push({ name: name, tests: tests }); }

  suite('Manifold health (z = x·y)', (it) => {
    it('bounded, symmetric, monotonic', () => { for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) inRange(M.health(i / 10, j / 10), 0, 1); approx(M.health(0.6, 0.4), M.health(0.4, 0.6), 1e-12); gt(M.health(0.5, 0.6), M.health(0.5, 0.4)); });
    it('a failing axis COLLAPSES the score (not averaged)', () => { approx(M.health(1, 0), 0, 1e-12); lt(M.health(1, 0.02), 0.05, 'z≈0.02 where an average would read 0.5'); eq(M.statusForHealth(M.health(1, 0.02)).tier, 'critical'); ne(M.statusForHealth(0.51).tier, 'critical'); });
    it('status tiers + color spectrum', () => { eq(M.statusForHealth(0.95).tier, 'healthy'); eq(M.statusForHealth(0.1).tier, 'critical'); ok(/^hsl\(/.test(M.colorForHealth(0.7))); gt(M.hueForHealth(1), M.hueForHealth(0)); });
  });

  suite('Geometry & combinatorics', (it) => {
    it('z = x·y² penalizes & is ~2× more sensitive than linear', () => { [0.3, 0.5, 0.8].forEach((y) => lt(1 * y * y, y)); const dy = 1e-4, dQ = (1 - (1 - dy) * (1 - dy)) / dy, dL = (1 - (1 - dy)) / dy; approx(dQ / dL, 2, 1e-2); });
    it('coupling C(n,2)=n(n-1)/2 is O(n²): doubling size >2× the coupling', () => { const p = (n) => n * (n - 1) / 2; eq(p(10), 45); [10, 50, 200].forEach((n) => { gt(p(2 * n), 2 * p(n)); approx(p(2 * n) / p(n), 4, 0.3); }); });
    it('series reliability R = ∏Rᵢ ≤ weakest link & ≤ average', () => { const R = [0.99, 0.95, 0.8, 0.999], pr = R.reduce((a, b) => a * b, 1); lte(pr, Math.min.apply(null, R)); lt(pr, R.reduce((a, b) => a + b) / R.length); approx([0.99, 0, 0.99].reduce((a, b) => a * b, 1), 0, 1e-12); });
  });

  suite('TPMS minimal-surface proof', (it) => {
    const TP = 2 * Math.PI;
    const surf = { P: (x, y, z) => Math.cos(x) + Math.cos(y) + Math.cos(z), D: (x, y, z) => Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.sin(x) * Math.cos(y) * Math.cos(z) + Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.cos(x) * Math.cos(y) * Math.sin(z), G: (x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x) };
    it('Schwarz P / D & Gyroid are triply periodic (period 2π)', () => { Object.keys(surf).forEach((k) => { const f = surf[k]; for (let s = 0; s < 8; s++) { const x = s * 0.5, y = s * 0.37, z = s * 0.91; approx(f(x + TP, y, z), f(x, y, z), 1e-9); approx(f(x, y + TP, z), f(x, y, z), 1e-9); approx(f(x, y, z + TP), f(x, y, z), 1e-9); } }); });
    it('mean curvature |H| ≈ 0 on the surface (they are MINIMAL)', () => { Object.keys(surf).forEach((k) => { const r = meanH(surf[k], 0, TP, 20); gt(r.samples, 30); lt(r.meanH, 0.22, k + ' |H|=' + r.meanH.toFixed(3)); }); });
    it('discriminates: a sphere is NOT minimal (|H|≈1)', () => { const sp = meanH((x, y, z) => x * x + y * y + z * z - 1, -1.4, 1.4, 28); gt(sp.meanH, 0.7); gt(sp.meanH / meanH(surf.G, 0, TP, 20).meanH, 4); });
  });

  suite('Operating authorization & go-live gate', (it) => {
    it('valid authorization verifies; forged is rejected', () => { const a = sampleAuth(); ok(LIC.verifyAuthorization(a, { today: TODAY }).ok); const f = JSON.parse(JSON.stringify(a)); f.pws.populationServed = 1; not(LIC.verifyAuthorization(f, { today: TODAY }).ok); });
    it('expired & ORC-less authorizations rejected', () => { not(LIC.verifyAuthorization(sampleAuth(), { today: '2030-01-01' }).ok); const n = sampleAuth(); delete n.orc; n.sig = LIC.sign(n); not(LIC.verifyAuthorization(n, { today: TODAY }).ok); });
    it('go-live: GO when commissioned; NO-GO blocks deploy', () => { const req = S.defaultSensors(), comp = SCH.COLLECTIONS.find((c) => c.id === 'components').seed, prq = SCH.COLLECTIONS.find((c) => c.id === 'commissioning').seed; const b = { authorization: sampleAuth(), requiredClasses: req, complianceClasses: ['turbidity', 'ph', 'chlorine_residual'], components: comp, prerequisites: prq }; const g = LIC.deployGate(LIC.commissioningTests(b, { today: TODAY }), []); ok(g.canDeploy && g.recommendation === 'GO'); const g2 = LIC.deployGate(LIC.commissioningTests(Object.assign({}, b, { authorization: null }), { today: TODAY }), []); not(g2.canDeploy); });
    it('exception needs purpose + justification + legal waiver', () => { const req = S.defaultSensors(), comp = SCH.COLLECTIONS.find((c) => c.id === 'components').seed.map((c) => c.sensorClass === 'turbidity' ? Object.assign({}, c, { method: '' }) : c), prq = SCH.COLLECTIONS.find((c) => c.id === 'commissioning').seed; const tr = LIC.commissioningTests({ authorization: sampleAuth(), requiredClasses: req, complianceClasses: ['turbidity', 'ph', 'chlorine_residual'], components: comp, prerequisites: prq }, { today: TODAY }); not(LIC.deployGate(tr, [{ testId: 'sensor-method:turbidity', by: 'U', justification: 'x' }]).canDeploy, 'incomplete exception rejected'); const full = { testId: 'sensor-method:turbidity', by: 'U-1', authorityName: 'Admin', role: 'administrator', purpose: 'maintain monitoring', justification: 'verified manually; recal scheduled', legalWaiver: 'WAIVER-1', sig: 'x' }; ok(LIC.deployGate(tr, [full]).canDeploy && LIC.deployGate(tr, [full]).provisional); });
  });

  suite('Tamper-evident spine (seal · audit)', (it) => {
    it('sealed record verifies; any tamper detected', () => { const s = new SEAL.ManifoldSeal({ key: 'k' }); const r = { citation: '40 CFR 141.72', threshold: 0.2 }; const info = s.ingest(r, 'U', 'compliance_officer', null); r._by = 'U'; r._role = 'compliance_officer'; r._prevShape = info.prevShape; r._sig = info.signature; ok(s.verify(r, null)); not(s.verify(Object.assign({}, r, { threshold: 0 }), null)); });
    it('shape-fold chains: change one early param → every later shape diverges', () => { const run = (v) => { const s = new SEAL.ManifoldSeal({ key: 'k' }); return [s.ingest({ v: v }, 'U', 'r', null).shape, s.ingest({ v: 'b' }, 'U', 'r', null).shape, s.ingest({ v: 'c' }, 'U', 'r', null).shape]; }; const a = run('genesis'), b = run('TAMPER'); ne(a[0], b[0]); ne(a[1], b[1]); ne(a[2], b[2]); });
    it('audit hash chain verifies; past-entry tamper is pinpointed', () => { const log = new AUD.AuditLog({ store: REG.memoryStore(), ns: 't' }); for (let i = 0; i < 30; i++) log.append('U', 'r', 'view', 'd', 'e' + i); ok(log.verify().ok); log.entries[12].detail = 'forged'; const vv = log.verify(); not(vv.ok); eq(vv.brokenAt, 12); });
  });

  suite('RBAC & failsafe AI', (it) => {
    it('least privilege + zero-trust', () => { ok(RB.can('administrator', 'edit', 'regulations')); not(RB.can('operator', 'edit', 'regulations')); ok(RB.capable('security_officer', 'security.classified')); not(RB.capable('operator', 'security.classified')); });
    it('deterministic ground truth + hallucination block', () => { eq(V.deterministicVerdict({ turbidity: 0.1, chlorine: 1, pressure: 60 }), 'compliant'); eq(V.deterministicVerdict({ turbidity: 5 }), 'violation'); not(V.crossCheck('compliant', { turbidity: 5, chlorine: 1, pressure: 60 }).agree, 'AI lie rejected'); });
    it('drift monitor quarantines AI after sustained hallucination', () => { const d = new V.DriftMonitor(); for (let i = 0; i < 7; i++) d.record(false); eq(d.report().state, 'HUMAN_REVIEW'); ok(/DETERMINISTIC-ONLY/.test(d.report().mode)); });
  });

  suite('Live engine — fault & recovery', (it) => {
    it('leak degrades health and raises an alarm', () => { const sim = new E.Simulator(TOP.buildTopology('township'), { speed: 200 }); warm(sim, 150); const st = sim.stations.find((s) => s.def.nominal.leak != null); const z0 = st.health.z, n0 = sim.alarmLog.length; sim.injectFault(st.id, 'leak'); warm(sim, 200); lt(st.health.z, z0); gt(sim.alarmLog.length, n0); });
    it('catastrophe collapses the system, then clearing recovers it', () => { const sim = new E.Simulator(TOP.buildTopology('city'), { speed: 200 }); warm(sim, 150); const base = sim.aggregate().z; gt(base, 0.8); sim.injectFault(sim.stations.find((s) => s.def.nominal.flow != null && s.def.nominal.pressure != null).id, 'break'); warm(sim, 220); lt(sim.aggregate().z, base - 0.2, 'worst-point dominates'); sim.clearFaults(); warm(sim, 600); gt(sim.aggregate().z, 0.75, 'recovered'); });
    it('pump trip zeroes flow & motor current', () => { const sim = new E.Simulator(TOP.buildTopology('township'), { speed: 200 }); warm(sim, 120); const st = sim.stations.find((s) => s.def.nominal.current != null); sim.injectFault(st.id, 'pump_trip'); warm(sim, 120); approx(st.readings.current.value, 0, 0.01); if (st.readings.flow) approx(st.readings.flow.value, 0, 0.01); });
  });

  suite('Deploy states · alerts · notifications', (it) => {
    it('connection-state rollup (GREEN/AMBER/RED/BLACK)', () => { eq(DEP.handshake({ ready: true }), 'GREEN'); eq(DEP.systemState(['GREEN', 'GREEN']), 'GREEN'); eq(DEP.systemState(['GREEN', 'RED']), 'AMBER'); eq(DEP.systemState(['GREEN'], { shutdown: true }), 'BLACK'); });
    it('alert routing by severity threshold; PII-free dispatch', () => { const ros = [{ userId: 'U-A', role: 'operator', status: 'active', alertChannel: 'email+SMS', alertMin: 'warning', email: 'mailto:a', mobile: '+1' }, { userId: 'U-B', role: 'x', status: 'active', alertChannel: 'email', alertMin: 'critical', email: 'mailto:b' }]; eq(PPL.alertRoster(ros, 'warning').length, 1); eq(PPL.alertRoster(ros, 'critical').length, 2); const sum = PPL.dispatchSummary(PPL.alertRoster(ros, 'critical'), 'critical'); ok(/U-A/.test(sum)); not(/mailto/.test(sum)); });
    it('notification rendering: SMS ≤160, webhook valid JSON; idempotent', () => { const ev = { eventType: 'offline', supply: 'X', pwsid: 'U', severity: 'critical', at: 't' }, rec = { party: 'Fire', type: 'fire station', channel: 'email', contact: 'mailto:f' }; lte(NOTIFY.render(ev, rec, 'sms').body.length, 160); eq(JSON.parse(NOTIFY.render(ev, rec, 'webhook').body).supply, 'X'); eq(NOTIFY.notify(ev, [rec]).deliveries[0].messageId, NOTIFY.notify(ev, [rec]).deliveries[0].messageId); });
  });

  suite('Analytics (established methods)', (it) => {
    it('least-squares recovers a known line; forecast & ETA', () => { const f = ANL.linearFit([3, 5, 7, 9]); approx(f.slope, 2, 1e-9); approx(f.intercept, 3, 1e-9); approx(ANL.forecast([3, 5, 7, 9], 1), 11, 1e-9); ok(ANL.etaToThreshold([3, 5, 7, 9], 13).willCross); });
    it('descriptive stats + anomaly flags', () => { const s = ANL.stats([1, 2, 3, 4]); approx(s.mean, 2.5, 1e-9); approx(s.sd, Math.sqrt(1.25), 1e-9); ok(ANL.isAnomaly({ action: 'violation', detail: '' })); not(ANL.isAnomaly({ action: 'view', detail: 'looked' })); });
  });

  // ── geometry helper: mean |H| on the level set ──
  function meanH(f, lo, hi, N) {
    const s = (hi - lo) / N, h = 1e-3; let sum = 0, c = 0;
    const H = (x, y, z) => { const f0 = f(x, y, z); const fx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h), fy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h), fz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h); const fxx = (f(x + h, y, z) - 2 * f0 + f(x - h, y, z)) / (h * h), fyy = (f(x, y + h, z) - 2 * f0 + f(x, y - h, z)) / (h * h), fzz = (f(x, y, z + h) - 2 * f0 + f(x, y, z - h)) / (h * h); const fxy = (f(x + h, y + h, z) - f(x + h, y - h, z) - f(x - h, y + h, z) + f(x - h, y - h, z)) / (4 * h * h), fxz = (f(x + h, y, z + h) - f(x + h, y, z - h) - f(x - h, y, z + h) + f(x - h, y, z - h)) / (4 * h * h), fyz = (f(x, y + h, z + h) - f(x, y + h, z - h) - f(x, y - h, z + h) + f(x, y - h, z - h)) / (4 * h * h); const g2 = fx * fx + fy * fy + fz * fz; if (g2 < 1e-9) return null; return (fx * fx * (fyy + fzz) + fy * fy * (fxx + fzz) + fz * fz * (fxx + fyy) - 2 * (fx * fy * fxy + fx * fz * fxz + fy * fz * fyz)) / (2 * Math.pow(g2, 1.5)); };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const x = lo + i * s, y = lo + j * s, z = lo + k * s, fv = f(x, y, z); const fx = (f(x + h, y, z) - f(x - h, y, z)) / (2 * h), fy = (f(x, y + h, z) - f(x, y - h, z)) / (2 * h), fz = (f(x, y, z + h) - f(x, y, z - h)) / (2 * h); const gn = Math.sqrt(fx * fx + fy * fy + fz * fz); if (gn < 0.2) continue; if (Math.abs(fv) / gn > 0.04) continue; const hh = H(x, y, z); if (hh == null || !isFinite(hh)) continue; sum += Math.abs(hh); c++; }
    return { meanH: c ? sum / c : NaN, samples: c };
  }

  // ── runner (async, streams events for a live UI) ──
  const yield_ = () => new Promise((r) => setTimeout(r, 0));
  async function run(onEvent) {
    let pass = 0, fail = 0; const t0 = (root.performance || Date).now();
    for (const s of SUITES) {
      onEvent && onEvent({ type: 'suite', name: s.name });
      for (const t of s.tests) {
        const tt = (root.performance || Date).now(); let okk = true, detail = '';
        try { t.fn(); } catch (e) { okk = false; detail = (e && e.message) || String(e); }
        okk ? pass++ : fail++;
        onEvent && onEvent({ type: 'test', suite: s.name, name: t.name, pass: okk, detail: detail, ms: (root.performance || Date).now() - tt });
        await yield_();
      }
    }
    const out = { type: 'done', pass: pass, fail: fail, ms: (root.performance || Date).now() - t0 };
    onEvent && onEvent(out); return out;
  }

  // ── benchmarks (async, streams each result) ──
  async function benchmarks(onEvent) {
    const now = () => (root.performance || Date).now();
    const run1 = (label, n, fn) => { const a = now(); fn(); const sec = (now() - a) / 1000; const r = { label: label, n: n, ms: (now() - a), ops: Math.round(n / Math.max(sec, 1e-9)) }; onEvent && onEvent(r); return r; };
    const out = [];
    { const sim = new E.Simulator(TOP.buildTopology('township'), { speed: 200 }); warm(sim, 100); out.push(run1('Engine ticks', 1000, () => { for (let i = 0; i < 1000; i++) sim.tick(16); })); } await yield_();
    { const log = new AUD.AuditLog({ store: REG.memoryStore(), ns: 'b' }); out.push(run1('Audit append+persist (O(1))', 20000, () => { for (let i = 0; i < 20000; i++) log.append('U', 'r', 'view', 'd', 'e' + i); log.flush(); })); } await yield_();
    { const s = new SEAL.ManifoldSeal({ key: 'k' }); out.push(run1('Manifold seal ingest', 5000, () => { for (let i = 0; i < 5000; i++) s.ingest({ i: i }, 'U', 'r', null); })); } await yield_();
    out.push(run1('Health z=x·y eval', 1000000, () => { let s = 0; for (let i = 0; i < 1000000; i++) s += M.health((i % 100) / 100, ((i * 7) % 100) / 100); if (s < 0) throw 0; })); await yield_();
    { const req = S.defaultSensors(), comp = SCH.COLLECTIONS.find((c) => c.id === 'components').seed, prq = SCH.COLLECTIONS.find((c) => c.id === 'commissioning').seed, b = { authorization: sampleAuth(), requiredClasses: req, complianceClasses: ['turbidity', 'ph', 'chlorine_residual'], components: comp, prerequisites: prq }; out.push(run1('Go-live gate eval', 1000, () => { for (let i = 0; i < 1000; i++) LIC.deployGate(LIC.commissioningTests(b, { today: TODAY }), []); })); } await yield_();
    return out;
  }

  function geometry() {
    const TP = 2 * Math.PI;
    return [
      { name: 'Schwarz P', meanH: meanH((x, y, z) => Math.cos(x) + Math.cos(y) + Math.cos(z), 0, TP, 20).meanH, minimal: true },
      { name: 'Schwarz D', meanH: meanH((x, y, z) => Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.sin(x) * Math.cos(y) * Math.cos(z) + Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.cos(x) * Math.cos(y) * Math.sin(z), 0, TP, 20).meanH, minimal: true },
      { name: 'Gyroid', meanH: meanH((x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x), 0, TP, 20).meanH, minimal: true },
      { name: 'Sphere (control)', meanH: meanH((x, y, z) => x * x + y * y + z * z - 1, -1.4, 1.4, 28).meanH, minimal: false }
    ];
  }

  function integrity() {
    const run = (v) => { const s = new SEAL.ManifoldSeal({ key: 'k' }); return ['p1', 'p2', 'p3', 'p4'].map((p, i) => s.ingest({ v: i === 0 ? v : p }, 'U', 'r', null).shape); };
    const a = run('genesis'), b = run('TAMPERED');
    const log = new AUD.AuditLog({ store: REG.memoryStore(), ns: 'i' }); for (let i = 0; i < 40; i++) log.append('U', 'r', 'view', 'reg', 'e' + i); const okv = log.verify();
    const t = new AUD.AuditLog({ store: REG.memoryStore(), ns: 'i2' }); for (let i = 0; i < 40; i++) t.append('U', 'r', 'view', 'reg', 'e' + i); t.entries[20].detail = 'forged'; const bad = t.verify();
    return { shapesA: a, shapesB: b, auditHead: okv.head, auditOk: okv.ok, brokenAt: bad.brokenAt };
  }

  root.HM_TESTS = { run: run, benchmarks: benchmarks, geometry: geometry, integrity: integrity, suiteCount: SUITES.length, testCount: SUITES.reduce((n, s) => n + s.tests.length, 0) };
}(typeof window !== 'undefined' ? window : this));
