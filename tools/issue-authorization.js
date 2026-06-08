/* ============================================================================
 * HydroManifold — Operating-Authorization Issuer (authority side)
 * ----------------------------------------------------------------------------
 * Mints a signed OPERATING AUTHORIZATION token. In production this runs ONLY at
 * the issuing authority (state primacy agency / EPA direct-implementation
 * program), where the signing PRIVATE key lives in an HSM/KMS — the platform
 * client never holds it and therefore cannot forge a token. Here it shares the
 * demo keyed-digest primitive so the gate can be exercised end-to-end.
 *
 * Usage:
 *   node tools/issue-authorization.js                 # prints three sample tokens
 *   node tools/issue-authorization.js > samples.txt
 * ========================================================================== */
const HM = require('../license.js');

function issue(spec) {
  const auth = Object.assign({ product: 'HydroManifold', schemaVersion: 1 }, spec);
  auth.sig = HM.sign(auth);                 // authority signs every field
  return auth;
}

// 1) Normal case — a community system authorized by its STATE primacy agency,
//    with a state-certified Operator in Responsible Charge.
const statePrimacy = issue({
  authorizationId: 'ST-DDW-2026-04417',
  authorizationType: 'state-primacy',
  authority: { id: 'state-primacy', name: 'State Division of Drinking Water', type: 'primacy' },
  pws: { pwsid: 'UT18025', name: 'Weber Basin — NE Pressure Zone', classification: 'CWS', source: 'GW', populationServed: 42000, connections: 12750 },
  orc: { name: 'J. Rivera', certNumber: 'UT-DIST-IV-10293', grade: 'Distribution IV', state: 'UT' },
  scope: { realtime: true, control: false },
  grants: { sensorTiers: ['must'] },
  issued: '2026-01-15', notBefore: '2026-02-01', expires: '2029-01-31'
});

// 2) EPA direct implementation — where there is no state primacy (e.g., a system
//    on tribal land or in a non-primacy jurisdiction).
const govDirect = issue({
  authorizationId: 'EPA-R8-2026-0091',
  authorizationType: 'government-direct',
  authority: { id: 'epa-pwss', name: 'U.S. EPA Region 8 — PWSS', type: 'government' },
  pws: { pwsid: 'WY5600123', name: 'High Plains Tribal Utility', classification: 'CWS', source: 'SW', populationServed: 5200, connections: 1600 },
  orc: { name: 'M. Whitefeather', certNumber: 'EPA-OP-3381', grade: 'Treatment III', state: 'WY' },
  scope: { realtime: true, control: false },
  grants: { sensorTiers: ['must'] },
  issued: '2026-03-01', notBefore: '2026-03-01', expires: '2028-03-01'
});

// 3) Delegated operations — a CONTRACT OPERATOR running a permitted system on the
//    PWSID-holder's behalf, approved by the primacy agency.
const delegated = issue({
  authorizationId: 'ST-DDW-2026-04418-OPS',
  authorizationType: 'delegated-operations',
  authority: { id: 'state-primacy', name: 'State Division of Drinking Water', type: 'primacy' },
  pws: { pwsid: 'UT18099', name: 'Cedar Bench Water District', classification: 'NTNC', source: 'GWUDI', populationServed: 900, connections: 310 },
  orc: { name: 'S. Okafor', certNumber: 'UT-TRT-III-22107', grade: 'Treatment III', state: 'UT' },
  delegation: { parentAuthorizationId: 'ST-DDW-2024-01990', operatingEntity: 'Basin Operations LLC (contract operator)', agreementType: 'contract-operations', agreementRef: 'CO-2026-77' },
  scope: { realtime: true, control: false },
  grants: { sensorTiers: ['must', 'nice'] },
  issued: '2026-02-10', notBefore: '2026-02-10', expires: '2027-02-10'
});

// 4) A FORGED token — right shape, tampered population, stale signature. The gate
//    must reject this. Provided so the demo can show rejection.
const forged = JSON.parse(JSON.stringify(statePrimacy));
forged.pws.populationServed = 1;             // altered after signing → signature no longer matches

const samples = { statePrimacy, govDirect, delegated, forged };
if (require.main === module) {                 // only print when run directly
  for (const [name, auth] of Object.entries(samples)) {
    console.log('# ' + name);
    console.log(HM.encodeToken(auth));
    console.log('');
  }
}
module.exports = { issue, samples };
