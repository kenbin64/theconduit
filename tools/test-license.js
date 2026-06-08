/* Node test for the operating-authorization & go-live gate. Run: node tools/test-license.js */
const HM = require('../license.js');
const { samples } = require('./issue-authorization.js');
const TODAY = '2026-06-08';
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };

// ── authorization verification ──
ok('valid state-primacy authorization verifies', HM.verifyAuthorization(samples.statePrimacy, { today: TODAY }).ok);
ok('valid EPA-direct authorization verifies', HM.verifyAuthorization(samples.govDirect, { today: TODAY }).ok);
ok('valid delegated-operations authorization verifies', HM.verifyAuthorization(samples.delegated, { today: TODAY }).ok);
ok('FORGED (tampered) authorization is rejected', !HM.verifyAuthorization(samples.forged, { today: TODAY }).ok);
ok('forged failure cites a bad signature', HM.verifyAuthorization(samples.forged, { today: TODAY }).reasons.some((r) => /signature/.test(r)));

// expired / not-yet-effective
ok('expired authorization is rejected', !HM.verifyAuthorization(samples.statePrimacy, { today: '2030-01-01' }).ok);
ok('not-yet-effective authorization is rejected', !HM.verifyAuthorization(samples.statePrimacy, { today: '2026-01-01' }).ok);

// missing ORC on a CWS
const noOrc = JSON.parse(JSON.stringify(samples.statePrimacy)); delete noOrc.orc; noOrc.sig = HM.sign(noOrc);
ok('CWS without a certified ORC is rejected', !HM.verifyAuthorization(noOrc, { today: TODAY }).ok);

// unrecognized authority
const rogue = JSON.parse(JSON.stringify(samples.statePrimacy)); rogue.authority = { id: 'acme-corp', name: 'Acme', type: 'private' };
ok('authorization from an unrecognized authority is rejected', !HM.verifyAuthorization(rogue, { today: TODAY }).ok);

// AWIA flag (CWS > 3,300)
ok('AWIA RRA/ERP flagged for CWS > 3,300', HM.verifyAuthorization(samples.statePrimacy, { today: TODAY }).requiresAwia === true);
ok('AWIA not flagged for small NTNC', HM.verifyAuthorization(samples.delegated, { today: TODAY }).requiresAwia === false);

// ── commissioning readiness ──
const REQUIRED = ['pressure_transducer', 'mag_flow', 'pd_meter', 'radar_level', 'turbidity', 'ph', 'chlorine_residual', 'temperature_rtd'];
function fullComponents() {
  return REQUIRED.map((cls) => ({
    name: cls, sensorClass: cls, approvedForUse: 'yes', source: 'document',
    manualLink: 'https://mfr.example/' + cls, engSpecs: 'range, accuracy, protocol',
    nsf61: 'yes', nsf372: 'yes', method: 'EPA-approved', calibratedOn: '2026-05-01', calDays: 365
  }));
}
const prereqsComplete = [
  { item: 'Sample siting plan (RTCR)', citation: '40 CFR Part 141 Subpart Y', status: 'on-file', required: true },
  { item: 'Certified compliance laboratory', citation: '40 CFR 141.74', status: 'complete', required: true },
  { item: 'AWIA RRA + ERP certified', citation: 'AWIA §2013 / SDWA §1433', status: 'complete', required: true }
];

let com = HM.assessCommissioning({ requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsComplete }, { today: TODAY });
ok('fully commissioned deployment is ready', com.ok);

// drop one sensor → not ready
const missingOne = fullComponents().filter((c) => c.sensorClass !== 'turbidity');
com = HM.assessCommissioning({ requiredClasses: REQUIRED, components: missingOne, prerequisites: prereqsComplete }, { today: TODAY });
ok('missing a required sensor blocks commissioning', !com.ok && com.sensors.find((s) => s.sensorClass === 'turbidity').blockers.length > 0);

// stale calibration on a compliance sensor → not ready
const stale = fullComponents().map((c) => c.sensorClass === 'chlorine_residual' ? Object.assign({}, c, { calibratedOn: '2024-01-01' }) : c);
com = HM.assessCommissioning({ requiredClasses: REQUIRED, components: stale, prerequisites: prereqsComplete }, { today: TODAY });
ok('stale calibration on a compliance sensor blocks commissioning', !com.ok);

// missing NSF/method on a compliance sensor → not ready
const noNsf = fullComponents().map((c) => c.sensorClass === 'ph' ? Object.assign({}, c, { nsf61: 'no' }) : c);
com = HM.assessCommissioning({ requiredClasses: REQUIRED, components: noNsf, prerequisites: prereqsComplete }, { today: TODAY });
ok('compliance sensor without NSF/ANSI 61 blocks commissioning', !com.ok);

// incomplete prerequisite → not ready
const prereqsBad = prereqsComplete.map((p, i) => i === 0 ? Object.assign({}, p, { status: 'pending' }) : p);
com = HM.assessCommissioning({ requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsBad }, { today: TODAY });
ok('incomplete mandatory prerequisite blocks commissioning', !com.ok);

// ── go-live verdict (the hard gate the apps read) ──
let v = HM.goLiveVerdict({ authorization: samples.statePrimacy, commissioning: { requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsComplete } }, { today: TODAY });
ok('go-live AUTHORIZED when license valid AND fully commissioned', v.canOperateLive && v.mode === 'AUTHORIZED');

v = HM.goLiveVerdict({ authorization: samples.forged, commissioning: { requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsComplete } }, { today: TODAY });
ok('go-live BLOCKED on forged authorization even if fully commissioned', !v.canOperateLive && v.mode === 'SIMULATION');

v = HM.goLiveVerdict({ authorization: samples.statePrimacy, commissioning: { requiredClasses: REQUIRED, components: missingOne, prerequisites: prereqsComplete } }, { today: TODAY });
ok('go-live BLOCKED when valid license but commissioning incomplete', !v.canOperateLive);

v = HM.goLiveVerdict({ commissioning: { requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsComplete } }, { today: TODAY });
ok('go-live BLOCKED with no authorization installed at all', !v.canOperateLive && v.blockers.some((b) => /no operating authorization/.test(b)));

// ── commissioning test suite + advisory deploy gate (named-authority decides) ──
let tr = HM.commissioningTests({ authorization: samples.statePrimacy, requiredClasses: REQUIRED, components: fullComponents(), prerequisites: prereqsComplete }, { today: TODAY });
ok('all tests pass on a clean, fully-documented deployment', tr.summary.failed === 0);
ok('recommendation GO when all tests pass', HM.deployGate(tr).recommendation === 'GO' && HM.deployGate(tr).canDeploy);

// a fully-documented, waived, signed exception (purpose + justification + legal waiver)
function exception(testId) { const o = { testId, by: 'U-1A44', authorityName: 'A. Admin', role: 'administrator', purpose: 'maintain monitoring during remediation', justification: 'verified manually; recal scheduled within 7 days', legalWaiver: 'WAIVER-2026-0012 (counsel approved)', at: '2026-06-08' }; o.sig = 'deadbeef'; return o; }

// a HARD failure (missing compliance method): software does NOT block absolutely —
// it recommends NO-GO; the NAMED authority may accept the risk (with full docs).
const noMethod = fullComponents().map((c) => c.sensorClass === 'turbidity' ? Object.assign({}, c, { method: '' }) : c);
tr = HM.commissioningTests({ authorization: samples.statePrimacy, requiredClasses: REQUIRED, components: noMethod, prerequisites: prereqsComplete }, { today: TODAY });
let gate = HM.deployGate(tr, []);
ok('hard failure → recommendation NO-GO and deploy not yet permitted', gate.recommendation === 'NO-GO' && !gate.canDeploy && gate.hardFails.length > 0);
gate = HM.deployGate(tr, [exception('sensor-method:turbidity')]);
ok('named authority accepting the risk (documented+waived+signed) permits a PROVISIONAL deploy — no absolute lock', gate.canDeploy && gate.provisional && gate.acceptedHardCount === 1);

// an exception MISSING the legal waiver does NOT count
const noWaiver = exception('sensor-method:turbidity'); delete noWaiver.legalWaiver;
ok('exception without a legal waiver is rejected', !HM.deployGate(tr, [noWaiver]).canDeploy);
const noPurpose = exception('sensor-method:turbidity'); delete noPurpose.purpose;
ok('exception without a documented purpose is rejected', !HM.deployGate(tr, [noPurpose]).canDeploy);

// risk briefing offers the authority a per-item risk assessment + benefit
const rb = HM.riskBriefing(tr);
ok('risk briefing recommends NO-GO and lists each open risk with a level', rb.recommendation === 'NO-GO' && rb.risks.length > 0 && /HIGH|MODERATE/.test(rb.risks[0].level) && !!rb.benefitOfGo);

// a SOFT failure (stale OPERATIONAL calibration) likewise needs a documented exception
const staleOp = fullComponents().map((c) => c.sensorClass === 'pressure_transducer' ? Object.assign({}, c, { calibratedOn: '2020-01-01' }) : c);
tr = HM.commissioningTests({ authorization: samples.statePrimacy, requiredClasses: REQUIRED, components: staleOp, prerequisites: prereqsComplete }, { today: TODAY });
ok('SOFT failure (operational cal) present, no hard fails', tr.summary.softFails > 0 && tr.summary.hardFails === 0);
ok('deploy not permitted until the soft failure is accepted', !HM.deployGate(tr).canDeploy);
gate = HM.deployGate(tr, [exception('sensor-calop:pressure_transducer')]);
ok('documented+waived+signed exception enables a PROVISIONAL deploy', gate.canDeploy && gate.provisional);

// ── capability certificates (pre-signed) ──
const escCert = (function () { const c = { product: 'HydroManifold', capability: 'emergency-shutdown', holderUserId: 'U-7F3A', holderRole: 'operator', scopePwsid: 'UT18025', authority: { id: 'state-primacy' }, issued: '2026-02-01', notBefore: '2026-02-01', expires: '2027-02-01' }; c.sig = HM.signCapability(c); return c; })();
ok('valid emergency-shutdown certificate verifies for its holder', HM.verifyCapability(escCert, 'emergency-shutdown', { today: TODAY, holderUserId: 'U-7F3A', pwsid: 'UT18025' }).ok);
ok('emergency-shutdown certificate rejected for a different holder', !HM.verifyCapability(escCert, 'emergency-shutdown', { today: TODAY, holderUserId: 'U-9999' }).ok);
ok('emergency-shutdown certificate rejected for the wrong capability', !HM.verifyCapability(escCert, 'firefighting-diversion', { today: TODAY, holderUserId: 'U-7F3A' }).ok);
const tamperedCert = Object.assign({}, escCert, { scopePwsid: '*' });
ok('tampered certificate is rejected', !HM.verifyCapability(tamperedCert, 'emergency-shutdown', { today: TODAY, holderUserId: 'U-7F3A' }).ok);

// ── token round-trip ──
const tok = HM.encodeToken(samples.statePrimacy);
ok('token encodes with HMA1 prefix', tok.indexOf('HMA1.') === 0);
ok('token decodes back to a verifying authorization', HM.verifyAuthorization(HM.decodeToken(tok), { today: TODAY }).ok);

console.log((fail === 0 ? '\n✅ ' : '\n❌ ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
