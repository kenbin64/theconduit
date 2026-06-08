/* Platform spine — unit tests (happy + non-happy). Pure, deterministic modules. */
'use strict';
const T = require('./harness');
const SEAL = require('../platform/seal');
const AUD = require('../platform/audit');
const RB = require('../platform/rbac');
const V = require('../platform/verify');
const REG = require('../platform/registry');
const PPL = require('../platform/people');
const DEP = require('../deploy');
const NOTIFY = require('../platform/notify');
const ANL = require('../platform/analytics');
const SCH = require('../platform/schemas');

const store = () => REG.memoryStore();

// ── MANIFOLD SEAL: sign / verify / shape-fold / encrypt ──
T.describe('seal', () => {
  T.it('khash is deterministic and key-sensitive', () => {
    T.eq(SEAL.khash('k', 'abc'), SEAL.khash('k', 'abc'), 'same in→same out');
    T.ne(SEAL.khash('k1', 'abc'), SEAL.khash('k2', 'abc'), 'key changes digest');
    T.ne(SEAL.khash('k', 'abc'), SEAL.khash('k', 'abd'), 'payload changes digest');
  });
  T.it('a sealed record verifies; tampering ANY field breaks it', () => {
    const s = new SEAL.ManifoldSeal({ key: 'depkey' });
    const row = { a: 'turbidity', b: 0.2 };
    const info = s.ingest(row, 'U-1', 'operator', null);
    row._by = 'U-1'; row._role = 'operator'; row._prevShape = info.prevShape; row._sig = info.signature;
    T.ok(s.verify(row, null), 'genuine record verifies');
    const t1 = Object.assign({}, row, { b: 0.9 }); T.not(s.verify(t1, null), 'changed value detected');
    const t2 = Object.assign({}, row, { _by: 'U-9' }); T.not(s.verify(t2, null), 'changed author detected');
  });
  T.it('shape folds forward and chains (changing an early param diverges every later signature)', () => {
    function run(firstVal) {
      const s = new SEAL.ManifoldSeal({ key: 'depkey' });
      const i1 = s.ingest({ v: firstVal }, 'U', 'r', null);
      const i2 = s.ingest({ v: 'second' }, 'U', 'r', null);
      return { shape1: i1.shape, shape2: i2.shape };
    }
    const a = run('first'), b = run('FIRST-CHANGED');
    T.ne(a.shape1, b.shape1, 'first shape diverges when first param changes');
    T.ne(a.shape2, b.shape2, 'and EVERY subsequent shape diverges (chaining/impossible-to-predict)');
  });
  T.it('encrypt/decrypt round-trips and ciphertext is opaque', () => {
    const ct = SEAL.encrypt('secret value', 'k'); T.ok(ct.indexOf('enc:') === 0, 'tagged ciphertext');
    T.ne(ct, 'secret value', 'not plaintext'); T.eq(SEAL.decrypt(ct, 'k'), 'secret value', 'round-trip');
    T.eq(SEAL.decrypt('plain', 'k'), 'plain', 'tolerates plaintext');
  });
  T.it('encryptedStore wraps a base store transparently', () => {
    const es = SEAL.encryptedStore(store(), 'k');
    T.eq(es.get('x'), null, 'empty → null'); es.set('x', 'hello'); T.eq(es.get('x'), 'hello', 'round-trip');
  });
});

// ── AUDIT LOG: hash chain + tamper detection ──
T.describe('audit', () => {
  T.it('append builds a verifiable hash chain', () => {
    const log = new AUD.AuditLog({ store: store(), ns: 't' });
    for (let i = 0; i < 25; i++) log.append('U-1', 'operator', 'view', 'dash', 'look ' + i);
    const v = log.verify(); T.ok(v.ok, 'chain intact'); T.gt(v.count, 25, 'genesis + entries');
  });
  T.it('tampering a PAST entry is detected at its index', () => {
    const log = new AUD.AuditLog({ store: store(), ns: 't' });
    for (let i = 0; i < 10; i++) log.append('U', 'r', 'edit', 'col', 'x' + i);
    log.entries[4].detail = 'forged';            // mutate history
    const v = log.verify(); T.not(v.ok, 'tamper detected'); T.eq(v.brokenAt, 4, 'pinpoints broken link');
  });
  T.it('CSV export has a header and a row per entry', () => {
    const log = new AUD.AuditLog({ store: store(), ns: 't' }); log.append('U', 'r', 'a', 'b', 'c');
    const csv = log.toCSV(); T.ok(/seq,timestamp,actor/.test(csv), 'header'); T.ok(csv.split('\n').length >= 3, 'rows');
  });
});

// ── RBAC: default-deny, least privilege, zero-trust ──
T.describe('rbac', () => {
  T.it('administrator can do everything (*)', () => { T.ok(RB.can('administrator', 'edit', 'regulations')); T.ok(RB.capable('administrator', 'security.classified')); });
  T.it('least privilege: operator may edit incidents but NOT regulations', () => { T.ok(RB.can('operator', 'edit', 'incidents')); T.not(RB.can('operator', 'edit', 'regulations')); });
  T.it('view:* wildcard grants read across collections', () => { T.ok(RB.can('compliance_officer', 'view', 'equipment')); });
  T.it('default deny for unknown role/capability', () => { T.not(RB.has('nobody', '*')); T.not(RB.capable('finance', 'security.classified')); });
  T.it('zero-trust: only security officer / admin hold security.classified', () => { T.ok(RB.capable('security_officer', 'security.classified')); T.not(RB.capable('operator', 'security.classified')); });
});

// ── FAILSAFE AI: invariants, ground truth, drift quarantine ──
T.describe('failsafe-verify', () => {
  T.it('logic gates', () => { T.ok(V.AND(1, 1)); T.not(V.AND(1, 0)); T.ok(V.OR(0, 1)); T.ok(V.XOR(1, 0)); T.ok(V.NAND(1, 0)); T.not(V.NOT(1)); });
  T.it('deterministic verdict is ground truth', () => {
    T.eq(V.deterministicVerdict({ turbidity: 0.1, chlorine: 1, pressure: 60 }), 'compliant');
    T.eq(V.deterministicVerdict({ turbidity: 5 }), 'violation', 'turbidity MCL');
    T.eq(V.deterministicVerdict({ chlorine: 0.05 }), 'violation', 'chlorine min');
    T.eq(V.deterministicVerdict({ pressure: 10 }), 'violation', 'min pressure');
  });
  T.it('cross-check AGREES with truth and BLOCKS a hallucination', () => {
    const good = { turbidity: 0.1, chlorine: 1, pressure: 60 };
    T.ok(V.crossCheck('compliant', good).agree, 'AI matches truth → agree');
    const bad = { turbidity: 5, chlorine: 1, pressure: 60 };
    const cc = V.crossCheck('compliant', bad);                 // AI lies "compliant" on a violation
    T.not(cc.agree, 'hallucination rejected'); T.eq(cc.truth, 'violation');
  });
  T.it('invariants catch low-pressure-without-advisory', () => {
    T.ok(V.checkInvariants({ pressure: 60, advisory: false }).ok, 'normal ok');
    T.not(V.checkInvariants({ pressure: 10, advisory: false }).ok, 'low pressure needs advisory');
  });
  T.it('drift monitor quarantines AI after sustained disagreement', () => {
    const d = new V.DriftMonitor();
    for (let i = 0; i < 6; i++) d.record(false);              // sustained hallucination
    const r = d.report(); T.eq(r.state, 'HUMAN_REVIEW'); T.ok(/DETERMINISTIC-ONLY/.test(r.mode), 'AI quarantined');
  });
});

// ── REGISTRY: schema-driven CRUD ──
T.describe('registry', () => {
  const def = { id: 'widgets', name: 'Widgets', group: 'G', schema: [{ key: 'name', label: 'Name' }, { key: 'qty', label: 'Qty', type: 'number' }], seed: [{ name: 'a', qty: 1 }] };
  T.it('define seeds, add/update/remove/search/count work', () => {
    const r = new REG.Registry({ ns: 'tr', store: store() }); r.define(def);
    T.eq(r.count('widgets'), 1, 'seeded');
    const row = r.add('widgets', { name: 'beta', qty: 2 }); T.eq(r.count('widgets'), 2);
    r.update('widgets', row._id, { qty: 9 }); T.eq(r.get('widgets', row._id).qty, 9, 'updated');
    T.eq(r.search('widgets', 'beta').length, 1, 'search');
    r.remove('widgets', row._id); T.eq(r.count('widgets'), 1, 'removed');
    T.ok(/name,qty|Name,Qty/.test(r.toCSV('widgets').split('\n')[0]), 'csv header');
  });
  T.it('onChange fires for every mutation (audit hook point)', () => {
    let n = 0; const r = new REG.Registry({ ns: 'tr2', store: store(), onChange: () => n++ }); r.define(def);
    r.add('widgets', { name: 'x' }); T.gt(n, 0, 'onChange called');
  });
});

// ── PEOPLE: non-PII identity + alert routing ──
T.describe('people', () => {
  const roster = [
    { userId: 'U-A', name: 'Al', role: 'operator', access: 'enabled', status: 'active', email: 'mailto:a@x', mobile: '+1', alertChannel: 'email+SMS', alertMin: 'warning' },
    { userId: 'U-B', name: 'Bo', role: 'compliance_officer', access: 'enabled', status: 'active', email: 'mailto:b@x', alertChannel: 'email', alertMin: 'critical' }
  ];
  T.it('acting id resolves from roster by role; derives a non-PII id otherwise', () => {
    T.eq(PPL.actingUserId(roster, 'operator'), 'U-A');
    T.ok(/^U-/.test(PPL.actingUserId(roster, 'ghost')), 'derived non-PII id');
  });
  T.it('alert roster honors per-person severity thresholds', () => {
    T.eq(PPL.alertRoster(roster, 'warning').length, 1, 'only U-A wants warnings');
    T.eq(PPL.alertRoster(roster, 'critical').length, 2, 'both want criticals');
  });
  T.it('dispatch summary is PII-free (user-ids only, no names/emails)', () => {
    const sum = PPL.dispatchSummary(PPL.alertRoster(roster, 'critical'), 'critical');
    T.ok(/U-A/.test(sum) && /U-B/.test(sum), 'has ids'); T.not(/Al|Bo|@x/.test(sum), 'no PII');
  });
});

// ── DEPLOY: connection-state machine ──
T.describe('deploy', () => {
  T.it('handshake: ready node → GREEN, unready → RED', () => {
    T.eq(DEP.handshake({ ready: true }), 'GREEN'); T.eq(DEP.handshake({ ready: false }), 'RED');
  });
  T.it('systemState rollup: BLACK dominates; all-green→GREEN; mixed→AMBER', () => {
    T.eq(DEP.systemState(['GREEN', 'GREEN']), 'GREEN');
    T.eq(DEP.systemState(['GREEN', 'RED']), 'AMBER', 'partial = still establishing');
    T.eq(DEP.systemState(['GREEN'], { shutdown: true }), 'BLACK', 'shutdown dominates');
    T.eq(DEP.systemState([]), 'RED', 'nothing connected');
  });
  T.it('planDeployment only includes approved sensors + connected feeds', () => {
    const nodes = DEP.planDeployment({
      components: [{ name: 'ok', sensorClass: 'ph', approvedForUse: 'yes', source: 'file' }, { name: 'no', approvedForUse: 'pending' }],
      feeds: [{ name: 'EPA', provider: 'gov', status: 'connected' }, { name: 'down', status: 'disconnected' }]
    });
    T.eq(nodes.length, 3, '1 sensor + 2 feeds (both feeds listed, status drives readiness)');
    T.ok(nodes.find((n) => n.kind === 'sensor' && n.ready), 'approved sensor ready');
  });
});

// ── NOTIFY: message rendering + transport ──
T.describe('notify', () => {
  const ev = { eventType: 'taken offline', supply: 'NE Reservoir', pwsid: 'UT18025', severity: 'critical', at: '2026-06-08 14:00' };
  const rec = { party: 'Fire', type: 'fire station', channel: 'email', basis: 'fire-flow', contact: 'mailto:fire@x' };
  T.it('channel mapping', () => { T.eq(NOTIFY.channelOf('email'), 'email'); T.eq(NOTIFY.channelOf('API / webhook'), 'webhook'); T.eq(NOTIFY.channelOf('SMS'), 'sms'); T.eq(NOTIFY.channelOf('EAS / IPAWS'), 'eas'); });
  T.it('SMS rendering stays within 160 chars; webhook is valid JSON', () => {
    T.lte(NOTIFY.render(ev, rec, 'sms').body.length, 160, 'sms length');
    const wh = JSON.parse(NOTIFY.render(ev, rec, 'webhook').body); T.eq(wh.supply, 'NE Reservoir', 'webhook payload');
  });
  T.it('simulated transport delivers with a receipt; idempotency key is stable', () => {
    const r = NOTIFY.notify(ev, [rec]); T.eq(r.deliveries.length, 1); T.eq(r.deliveries[0].status, 'delivered'); T.ok(r.simulated);
    const r2 = NOTIFY.notify(ev, [rec]); T.eq(r.deliveries[0].messageId, r2.deliveries[0].messageId, 'idempotent');
  });
  T.it('unconfigured real transport fails gracefully (no throw, status failed)', () => {
    NOTIFY.configure({ transport: new NOTIFY.HttpRelayTransport({ endpoint: null }) });
    const r = NOTIFY.notify(ev, [rec]); T.eq(r.deliveries[0].status, 'failed');
    NOTIFY.configure({ transport: new NOTIFY.SimulatedTransport() });   // restore
  });
});

// ── ANALYTICS: established methods only (least-squares, sample σ) ──
T.describe('analytics', () => {
  T.it('least-squares fit recovers a known line exactly', () => {
    const f = ANL.linearFit([3, 5, 7, 9]);                    // y = 3 + 2i
    T.approx(f.slope, 2, 1e-9); T.approx(f.intercept, 3, 1e-9);
  });
  T.it('forecast extrapolates the trend; ETA-to-threshold predicts crossings', () => {
    T.approx(ANL.forecast([3, 5, 7, 9], 1), 11, 1e-9);
    const e = ANL.etaToThreshold([3, 5, 7, 9], 13); T.ok(e.willCross); T.approx(e.steps, 2, 1e-9);
  });
  T.it('descriptive stats (mean, σ, p95)', () => {
    const s = ANL.stats([1, 2, 3, 4]); T.approx(s.mean, 2.5, 1e-9); T.approx(s.sd, Math.sqrt(1.25), 1e-9); T.eq(s.n, 4);
  });
  T.it('anomaly detection flags safety-critical log actions', () => {
    T.ok(ANL.isAnomaly({ action: 'violation', detail: '' })); T.ok(ANL.isAnomaly({ action: 'view', detail: 'tamper detected' })); T.not(ANL.isAnomaly({ action: 'view', detail: 'looked' }));
  });
});

// ── SCHEMAS: the free-form spine carries the mandated defaults ──
T.describe('schemas', () => {
  T.it('every collection is well-formed (id, name, schema)', () => {
    SCH.COLLECTIONS.forEach((c) => { T.ok(c.id && c.name && Array.isArray(c.schema) && c.schema.length, c.id + ' shape'); });
  });
  T.it('the mandated collections exist (commissioning, components, emergency, notifications)', () => {
    const ids = SCH.COLLECTIONS.map((c) => c.id);
    ['regulations', 'components', 'commissioning', 'emergency_auth', 'notify_external', 'personnel'].forEach((id) => T.ok(ids.indexOf(id) >= 0, id + ' present'));
  });
  T.it('the 8 must-have sensors are pre-loaded by default', () => {
    const comp = SCH.COLLECTIONS.find((c) => c.id === 'components').seed;
    const classes = comp.map((c) => c.sensorClass);
    ['pressure_transducer', 'mag_flow', 'pd_meter', 'radar_level', 'turbidity', 'ph', 'chlorine_residual', 'temperature_rtd'].forEach((k) => T.ok(classes.indexOf(k) >= 0, k + ' seeded'));
  });
  T.it('mandatory notification recipients include fire + regulator + farms', () => {
    const r = SCH.COLLECTIONS.find((c) => c.id === 'notify_external').seed.filter((x) => x.mandatory === 'yes').map((x) => x.type);
    T.ok(r.indexOf('fire station') >= 0 && r.indexOf('regulator (primacy)') >= 0 && r.indexOf('agricultural / farms') >= 0, 'fire+regulator+farms mandatory');
  });
});

module.exports = true;
