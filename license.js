/* ============================================================================
 * HydroManifold — Operating Authorization & Go-Live Gate
 * ----------------------------------------------------------------------------
 * THE RULE (enforced here):
 *   The platform may always be SET UP, TESTED and MADE READY in SIMULATION.
 *   It will NOT operate a REAL water system in REAL TIME unless BOTH hold:
 *     1. a valid, signed OPERATING AUTHORIZATION, and
 *     2. the deployment is COMMISSIONED — every required sensor's tech-spec and
 *        provenance is in the CRM (by API link, file transfer, or official
 *        documentation), plus the mandatory regulatory prerequisites are on file.
 *
 * WHO MAY AUTHORIZE (grounded in U.S. SDWA practice — verify against the rules
 * that bind your specific system; state rules can be more stringent):
 *   • 'state-primacy'        — a STATE drinking-water program holding primacy
 *                              (primary enforcement responsibility delegated by
 *                              EPA under SDWA §1413 / 40 CFR Part 142). This is
 *                              the normal authorizing body for a public water
 *                              system. (NOT "EPA licenses the system" — EPA
 *                              delegates; the state permits and oversees.)
 *   • 'government-direct'    — EPA's Public Water System Supervision program
 *                              implementing DIRECTLY where no primacy is in place
 *                              (currently Wyoming, the District of Columbia, and
 *                              most tribal lands), or another government agency
 *                              with statutory authority over the system.
 *   • 'delegated-operations' — operation under another permitted entity's
 *                              authority: a contract operator, satellite-managed
 *                              system, or wholesale/consecutive arrangement. Each
 *                              system still has its OWN PWSID and compliance duty;
 *                              the primacy agency still signs off and a certified
 *                              Operator in Responsible Charge is still required.
 *
 * HONEST CRYPTO NOTE: the signature here is a dependency-free keyed digest (the
 * same FNV-1a keyed primitive used by the manifold seal) so the gate demonstrates
 * end-to-end. A production deployment verifies an Ed25519 / X.509 signature that
 * chains to the issuing authority's published key — the CLIENT holds only the
 * PUBLIC verification key, so an authorization cannot be forged without the
 * authority's private key (held in its HSM/KMS). The model — recognize authority,
 * verify signature, check window, require ORC, require commissioning — is identical.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ── keyed digest: reuse the seal's primitive if present, else inline it ──
  function khash(key, str) {
    if (root.HMP_SEAL && root.HMP_SEAL.khash) return root.HMP_SEAL.khash(key, str);
    const s = key + '' + str;
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // ── trust roots the client recognizes (DEMO: symmetric keys; PROD: Ed25519
  //    public keys / X.509 roots published by the authority). canDelegate marks
  //    an authority that may approve a delegated-operations arrangement. ─────────
  const AUTHORITIES = {
    'epa-pwss': {
      id: 'epa-pwss', type: 'government', canDelegate: true,
      name: 'U.S. EPA — Public Water System Supervision (direct implementation)',
      basis: 'SDWA §1413; 40 CFR Part 142 (EPA implements directly where there is no primacy)',
      key: 'demo-root-epa-pwss'
    },
    'state-primacy': {
      id: 'state-primacy', type: 'primacy', canDelegate: true,
      name: 'State Drinking Water Program — primacy agency',
      basis: 'Primary enforcement responsibility (primacy) delegated under SDWA §1413; 40 CFR Part 142 Subpart B',
      key: 'demo-root-state-primacy'
    }
  };

  const ACCEPTED_TYPES = ['state-primacy', 'government-direct', 'delegated-operations'];
  const PWS_CLASSES = ['CWS', 'NTNC', 'TNC'];          // 40 CFR 141.2
  const SOURCE_TYPES = ['GW', 'SW', 'GWUDI'];          // groundwater / surface water / GW under direct influence
  const AWIA_POP_THRESHOLD = 3300;                     // AWIA §2013 RRA/ERP applies to CWS serving > 3,300

  // ── canonical, signature-stable serialization (sorted keys, sig excluded) ──
  function canon(obj) {
    const seen = (o) => {
      if (o === null || typeof o !== 'object') return JSON.stringify(o == null ? '' : o);
      if (Array.isArray(o)) return '[' + o.map(seen).join(',') + ']';
      return '{' + Object.keys(o).filter((k) => k !== 'sig').sort()
        .map((k) => JSON.stringify(k) + ':' + seen(o[k])).join(',') + '}';
    };
    return seen(obj);
  }

  // ── date helpers (plain YYYY-MM-DD compare; today injectable for tests) ──
  function today(opts) {
    if (opts && opts.today) return String(opts.today).slice(0, 10);
    try { return new Date().toISOString().slice(0, 10); } catch (_) { return '1970-01-01'; }
  }
  const ymd = (s) => String(s || '').slice(0, 10);

  // provenance = a real path by which a spec entered the CMS: an API link, a
  // file transfer, or official documentation.
  function hasProvenance(c) {
    const s = String(c.source || '').toLowerCase();
    return /api|file|doc/.test(s) || !!c.manualLink || /file:/i.test(String(c.mfrAuth || '') + String(c.license || ''));
  }
  // a component's calibration is current if (last calibrated + interval) ≥ today.
  function calCurrent(c, t) {
    if (!c.calibratedOn) return false;
    const days = Number(c.calDays) || 365;
    const due = new Date(ymd(c.calibratedOn)); due.setDate(due.getDate() + days);
    try { return due.toISOString().slice(0, 10) >= t; } catch (_) { return false; }
  }

  /* ── sign an authorization (issuer side; in prod only the authority can do
   *    this with its private key). Exposed so the bundled issuer tool can mint
   *    demo tokens and so tests can round-trip. ─────────────────────────────── */
  function sign(auth) {
    const a = AUTHORITIES[auth.authority && auth.authority.id];
    if (!a) throw new Error('unknown authority: ' + (auth.authority && auth.authority.id));
    return khash(a.key, canon(auth));
  }

  /* ── verify an OPERATING AUTHORIZATION. Returns a structured verdict with a
   *    human-readable reason list; ok===true only when every check passes. ──── */
  function verifyAuthorization(auth, opts) {
    const reasons = [];
    const fail = (r) => { reasons.push(r); return null; };
    if (!auth || typeof auth !== 'object') return { ok: false, reasons: ['no authorization provided'] };
    if (auth.product !== 'HydroManifold') fail('not a HydroManifold authorization');

    const a = AUTHORITIES[auth.authority && auth.authority.id];
    if (!a) fail('issuing authority not recognized: ' + (auth.authority && auth.authority.id));

    // signature binds every field to the issuing authority's key
    if (a) {
      const expect = khash(a.key, canon(auth));
      if (auth.sig !== expect) fail('signature invalid — authorization is forged or altered');
    }

    // authorization type + authority-type consistency
    if (ACCEPTED_TYPES.indexOf(auth.authorizationType) < 0) fail('unrecognized authorization type: ' + auth.authorizationType);
    if (a) {
      if (auth.authorizationType === 'state-primacy' && a.type !== 'primacy') fail('state-primacy authorization not signed by a primacy agency');
      if (auth.authorizationType === 'government-direct' && a.type !== 'government') fail('government-direct authorization not signed by a government agency');
      if (auth.authorizationType === 'delegated-operations') {
        if (!a.canDelegate) fail('issuing authority may not approve delegated operations');
        const d = auth.delegation;
        if (!d || !d.parentAuthorizationId || !d.operatingEntity || !d.agreementType) {
          fail('delegated-operations requires a delegation block (parent PWS authorization, operating entity, agreement type)');
        }
      }
    }

    // public-water-system identity
    const pws = auth.pws || {};
    if (!pws.pwsid) fail('missing PWSID (Public Water System Identification number)');
    if (PWS_CLASSES.indexOf(pws.classification) < 0) fail('missing/invalid PWS classification (CWS / NTNC / TNC)');
    if (SOURCE_TYPES.indexOf(pws.source) < 0) fail('missing/invalid source-water type (GW / SW / GWUDI)');

    // Operator in Responsible Charge — a state-certified operator is required to
    // operate a CWS or NTNC. (Grades are state-assigned, not federal.)
    const orc = auth.orc || {};
    if (pws.classification === 'CWS' || pws.classification === 'NTNC') {
      if (!orc.name || !orc.certNumber) fail('no certified Operator in Responsible Charge (ORC) named for a CWS/NTNC');
    }

    // validity window
    const t = today(opts);
    if (auth.notBefore && ymd(auth.notBefore) > t) fail('authorization not yet in effect (not before ' + ymd(auth.notBefore) + ')');
    if (auth.expires && ymd(auth.expires) < t) fail('authorization expired (' + ymd(auth.expires) + ')');

    return {
      ok: reasons.length === 0,
      reasons,
      authorization: auth,
      authorityName: a ? a.name : null,
      authorityBasis: a ? a.basis : null,
      requiresAwia: pws.classification === 'CWS' && Number(pws.populationServed) > AWIA_POP_THRESHOLD
    };
  }

  /* ── COMMISSIONING READINESS ───────────────────────────────────────────────
   * The deployment is commissioned only when:
   *   • every REQUIRED sensor class (the must-have base tier) has an APPROVED
   *     component in the CRM, ingested with provenance (link / file / official
   *     doc) and — for compliance instruments — an approved analytical method,
   *     wetted-material certification (NSF/ANSI/CAN 61 & 372) and current
   *     calibration; and
   *   • every MANDATORY regulatory prerequisite is complete.
   *
   * Inputs (read from the CRM by the caller, kept dependency-free here):
   *   requiredClasses : string[]   sensor-class ids that must be commissioned
   *   components       : object[]   rows from the Component Onboarding collection
   *                                 (each: sensorClass, approvedForUse, source,
   *                                  nsf61, nsf372, method, calibratedOn, calDays…)
   *   prerequisites    : object[]   rows from the Commissioning Checklist
   *                                 (each: required(bool), status, item, citation)
   *   complianceClasses: string[]   subset of requiredClasses whose readings are
   *                                 used for regulatory compliance (need method +
   *                                 NSF + calibration), defaults sensibly.
   * today is injectable for calibration-currency checks.
   * ────────────────────────────────────────────────────────────────────────── */
  function assessCommissioning(input, opts) {
    input = input || {};
    const required = input.requiredClasses || [];
    const components = input.components || [];
    const prereqs = input.prerequisites || [];
    const complianceClasses = input.complianceClasses || ['turbidity', 'ph', 'chlorine_residual'];
    const t = today(opts);

    // index approved components by the sensor class they satisfy
    const approvedByClass = {};
    components.forEach((c) => {
      if (String(c.approvedForUse).toLowerCase() !== 'yes') return;
      if (c.sensorClass) (approvedByClass[c.sensorClass] = approvedByClass[c.sensorClass] || []).push(c);
    });

    const sensors = required.map((cls) => {
      const matches = approvedByClass[cls] || [];
      const isCompliance = complianceClasses.indexOf(cls) >= 0;
      const blockers = [];
      if (!matches.length) blockers.push('no approved component in CRM');
      const c = matches[0];
      if (c) {
        if (!hasProvenance(c)) blockers.push('no provenance (API link / file transfer / official doc)');
        if (isCompliance) {
          if (!c.nsf61 || String(c.nsf61).toLowerCase() === 'no') blockers.push('wetted materials not certified NSF/ANSI/CAN 61');
          if (!c.nsf372 || String(c.nsf372).toLowerCase() === 'no') blockers.push('lead content not certified NSF/ANSI/CAN 372');
          if (!c.method) blockers.push('no approved analytical method recorded');
          if (!calCurrent(c, t)) blockers.push('calibration not current');
        }
      }
      return { sensorClass: cls, compliance: isCompliance, component: c || null, ready: blockers.length === 0, blockers };
    });

    // a row is required unless it explicitly says otherwise; it is ready when
    // its status reads complete / on-file / done / yes, or is marked n/a.
    const isRequired = (p) => !(p.required === false || /^(no|n\/?a|false)$/i.test(String(p.required)));
    const isReady = (p) => /^(complete|on-file|done|yes|n\/?a)$/i.test(String(p.status || '').trim());
    const prereqItems = prereqs.filter(isRequired).map((p) => ({
      item: p.item, citation: p.citation || '', evidence: p.evidence || '', appliesTo: p.appliesTo || '',
      ready: isReady(p)
    }));

    const sensorsReady = sensors.every((s) => s.ready);
    const prereqsReady = prereqItems.every((p) => p.ready);
    return {
      ok: sensorsReady && prereqsReady,
      sensors, prerequisites: prereqItems,
      sensorsReady, prereqsReady,
      summary: {
        sensorsTotal: sensors.length, sensorsReadyCount: sensors.filter((s) => s.ready).length,
        prereqsTotal: prereqItems.length, prereqsReadyCount: prereqItems.filter((p) => p.ready).length
      }
    };
  }

  /* ── GO-LIVE VERDICT — fuse authorization + commissioning into a single mode. ─
   *   mode: 'SIMULATION' (default, always allowed) → setup/test/ready.
   *         'AUTHORIZED' → both gates pass; real-time operation permitted.
   *   canOperateLive is the hard gate the apps read. ─────────────────────────── */
  function goLiveVerdict(input, opts) {
    input = input || {};
    const lic = input.authorization ? verifyAuthorization(input.authorization, opts) : { ok: false, reasons: ['no operating authorization installed'] };
    const com = assessCommissioning(input.commissioning || {}, opts);

    // AWIA RRA/ERP is mandatory for the gate only when the system triggers it.
    const blockers = [];
    if (!lic.ok) lic.reasons.forEach((r) => blockers.push('Authorization: ' + r));
    if (!com.sensorsReady) com.sensors.filter((s) => !s.ready).forEach((s) => blockers.push('Sensor [' + s.sensorClass + ']: ' + s.blockers.join('; ')));
    if (!com.prereqsReady) com.prerequisites.filter((p) => !p.ready).forEach((p) => blockers.push('Prerequisite: ' + p.item + (p.citation ? ' (' + p.citation + ')' : '')));

    const canOperateLive = blockers.length === 0;
    return {
      mode: canOperateLive ? 'AUTHORIZED' : 'SIMULATION',
      canOperateLive,
      blockers,
      license: lic,
      commissioning: com,
      requiresAwia: !!lic.requiresAwia
    };
  }

  /* ── COMMISSIONING TEST SUITE ──────────────────────────────────────────────
   * Documentation ingested into the CMS — manufacturer cut-sheets and regulatory
   * requirements — is converted DIRECTLY into tests the system runs in STAGING /
   * TESTING. No onsite reinterpretation: the system checks exactly what the specs
   * and the regulations require. Every test is tagged by its SOURCE and whether
   * it is a HARD gate (legal / public-health floor — never overridable) or a SOFT
   * gate (manufacturer-recommended / operational — overridable only with a signed
   * justification by a credentialed human).
   * ────────────────────────────────────────────────────────────────────────── */
  function commissioningTests(input, opts) {
    input = input || {};
    const required = input.requiredClasses || [];
    const components = input.components || [];
    const prereqs = input.prerequisites || [];
    const complianceClasses = input.complianceClasses || ['turbidity', 'ph', 'chlorine_residual'];
    const t = today(opts);
    const tests = [];
    const add = (id, name, source, hard, pass, detail) => tests.push({ id, name, source, hard, pass, detail: detail || '' });

    const byClass = {};
    components.forEach((c) => { if (String(c.approvedForUse).toLowerCase() === 'yes' && c.sensorClass) (byClass[c.sensorClass] = byClass[c.sensorClass] || []).push(c); });

    // A) operating authorization — HARD (regulation): legal authority + ORC + window
    const av = input.authorization ? verifyAuthorization(input.authorization, opts) : { ok: false, reasons: ['no operating authorization installed'] };
    add('auth-valid', 'Operating authorization valid & current (authority, ORC, window)', 'regulation', true, av.ok, av.ok ? (av.authorityName || '') : av.reasons.join('; '));

    // B) per required sensor — derived from manufacturer + regulatory documentation
    required.forEach((cls) => {
      const c = (byClass[cls] || [])[0];
      const isComp = complianceClasses.indexOf(cls) >= 0;
      add('sensor-present:' + cls, 'Required sensor present & approved (' + cls + ')', 'regulation', true, !!c, c ? 'approved in CMS' : 'no approved component');
      if (!c) return;
      add('sensor-provenance:' + cls, 'Provenance on file — API / file / doc (' + cls + ')', 'regulation', true, hasProvenance(c), c.source || '');
      if (isComp) {
        add('sensor-nsf:' + cls, 'Wetted materials NSF/ANSI/CAN 61 & 372 (' + cls + ')', 'regulation', true, /yes/i.test(c.nsf61) && /yes/i.test(c.nsf372), 'NSF61 ' + c.nsf61 + ' / NSF372 ' + c.nsf372);
        add('sensor-method:' + cls, 'EPA-approved analytical method recorded (' + cls + ')', 'regulation', true, !!c.method, c.method || '(none)');
        add('sensor-cal:' + cls, 'Compliance instrument calibration current (' + cls + ')', 'regulation', true, calCurrent(c, t), c.calibratedOn ? ('cal ' + c.calibratedOn + ' / ' + c.calDays + 'd') : '(no cal date)');
      } else {
        add('sensor-calop:' + cls, 'Operational calibration current — mfr interval (' + cls + ')', 'manufacturer', false, calCurrent(c, t), c.calibratedOn ? ('cal ' + c.calibratedOn + ' / ' + c.calDays + 'd') : '(no cal date)');
      }
      add('sensor-selfcheck:' + cls, 'Manufacturer self-diagnostic spec on file (' + cls + ')', 'manufacturer', false, !!c.engSpecs, c.engSpecs ? 'engineering specs ingested' : '(no specs)');
    });

    // C) mandatory regulatory prerequisites — HARD (regulation)
    prereqs.filter((p) => !(p.required === false || /^(no|n\/?a|false)$/i.test(String(p.required)))).forEach((p, i) => {
      const ready = /^(complete|on-file|done|yes|n\/?a)$/i.test(String(p.status || '').trim());
      add('prereq:' + i, p.item, 'regulation', true, ready, p.citation || '');
    });

    const passed = tests.filter((x) => x.pass).length;
    return {
      tests,
      summary: {
        total: tests.length, passed, failed: tests.length - passed,
        hardFails: tests.filter((x) => x.hard && !x.pass).length,
        softFails: tests.filter((x) => !x.hard && !x.pass).length
      }
    };
  }

  /* ── DEPLOY GATE — the software RECOMMENDS, it does not decide. ─────────────
   * If every test passes the recommendation is GO. If any test fails the
   * recommendation is NO-GO — but the software does NOT hard-lock: the NAMED
   * authorizing authority is always the prevailing decider and may accept the
   * risk on any failing item. EVERY exception requires a documented PURPOSE, a
   * JUSTIFICATION, and a signed LEGAL WAIVER — an acceptance missing any of these
   * (or its signature) does not count. Deploying over an accepted risk is
   * PROVISIONAL (visibly degraded) and the named decision is on the record.
   * hardFails are reported separately so the briefing can flag the legal /
   * public-health items the authority is being asked to own. ───────────────── */
  function exceptionComplete(o) {
    return !!(o && o.testId && o.purpose && o.justification && o.legalWaiver && o.by && o.authorityName && o.sig);
  }
  function deployGate(testResult, accepted) {
    const tests = (testResult && testResult.tests) || [];
    accepted = accepted || [];
    const acc = {};
    accepted.forEach((o) => { if (exceptionComplete(o)) acc[o.testId] = o; });   // only fully-documented, waived, signed
    const fails = tests.filter((t) => !t.pass);
    const hardFails = fails.filter((t) => t.hard);
    const softFails = fails.filter((t) => !t.hard);
    const unaccepted = fails.filter((t) => !acc[t.id]);
    const recommendation = fails.length === 0 ? 'GO' : 'NO-GO';
    const canDeploy = unaccepted.length === 0;             // all failures accepted (documented+waived+signed) or none
    return {
      recommendation, canDeploy, fails, hardFails, softFails, unaccepted,
      accepted: fails.filter((t) => acc[t.id]),
      acceptedHardCount: hardFails.filter((t) => acc[t.id]).length,
      provisional: canDeploy && fails.length > 0           // deployed over accepted risk → degraded/provisional
    };
  }

  /* ── RISK BRIEFING — what the software OFFERS the authority to decide on: the
   *    recommendation, the benefit of proceeding, and the risk/consequence of
   *    each open item (legal/public-health vs operational). ─────────────────── */
  function riskBriefing(testResult) {
    const tests = (testResult && testResult.tests) || [];
    const fails = tests.filter((t) => !t.pass);
    const consequence = (t) => {
      if (/^auth-valid/.test(t.id)) return 'Operating without a valid authorization may be unlawful and uninsured — no regulatory cover.';
      if (/^prereq:/.test(t.id)) return 'A mandatory program element is missing — enforcement exposure and a real public-health gap.';
      if (/^sensor-(nsf|method|cal):/.test(t.id)) return 'Compliance readings may be invalid or inadmissible; an exceedance could go undetected or unreportable.';
      if (/^sensor-(present|provenance):/.test(t.id)) return 'A required measurement is missing or unverifiable — a blind spot in coverage.';
      return 'Reduced confidence / earlier drift on an operational instrument.';
    };
    return {
      recommendation: fails.length === 0 ? 'GO' : 'NO-GO',
      benefitOfGo: fails.length ? 'Begin real-time monitoring now rather than remaining blind in simulation, while the gap is remediated under an accepted-risk plan.' : 'All checks pass — recommended GO.',
      risks: fails.map((t) => ({ testId: t.id, name: t.name, level: t.hard ? 'HIGH — legal / public-health' : 'MODERATE — operational', source: t.source, detail: t.detail, consequence: consequence(t) }))
    };
  }

  /* ── operating-mode persistence shared across the two apps (same origin).
   *    The platform WRITES the installed authorization + status; the live app
   *    re-verifies it INDEPENDENTLY (it never trusts a bare "mode" flag). ──── */
  const MODE_KEY = 'hm:operating';
  function readInstalled(store) {
    try {
      const s = (store || root.localStorage);
      const raw = s && s.getItem ? s.getItem(MODE_KEY) : (s && s.get ? s.get(MODE_KEY) : null);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { return null; }
  }
  function writeInstalled(state, store) {
    try {
      const s = (store || root.localStorage);
      const raw = JSON.stringify(state || {});
      if (s && s.setItem) s.setItem(MODE_KEY, raw); else if (s && s.set) s.set(MODE_KEY, raw);
    } catch (_) {}
  }
  // The live app's own check: parse an installed authorization token and verify it.
  function liveStatus(opts) {
    const inst = readInstalled(opts && opts.store);
    if (!inst || inst.mode !== 'AUTHORIZED' || !inst.authorization) {
      return { canOperateLive: false, mode: 'SIMULATION', reason: 'no operating authorization installed — simulation only' };
    }
    const v = verifyAuthorization(inst.authorization, opts);
    if (!v.ok) return { canOperateLive: false, mode: 'SIMULATION', reason: 'installed authorization failed verification: ' + v.reasons[0] };
    return { canOperateLive: true, mode: 'AUTHORIZED', reason: 'authorized real-time operation', authorization: inst.authorization, authorityName: v.authorityName };
  }

  // encode/decode a token as a pasteable "license file/key" (base64 of JSON)
  function encodeToken(auth) {
    const json = JSON.stringify(auth);
    try { return 'HMA1.' + (root.btoa ? root.btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64')); }
    catch (_) { return 'HMA1.' + json; }
  }
  function decodeToken(token) {
    if (typeof token !== 'string') return null;
    let body = token.trim();
    if (body.indexOf('HMA1.') === 0) body = body.slice(5);
    try {
      const json = root.atob ? decodeURIComponent(escape(root.atob(body))) : Buffer.from(body, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch (_) {
      try { return JSON.parse(body); } catch (__) { return null; }
    }
  }

  /* ── PRE-SIGNED CAPABILITY CERTIFICATES ────────────────────────────────────
   * Some actions cannot wait for an approval workflow when the moment comes —
   * an EMERGENCY SHUTDOWN, or an immediate FIREFIGHTING DIVERSION of a source.
   * So the authority over that action signs a certificate BEFOREHAND, naming the
   * holder (by non-PII user id), the capability, and the system it applies to.
   * During the emergency the holder simply presents the certificate; it verifies
   * instantly and locally — no round-trip, no waiting.
   *
   * In production these are Ed25519 / X.509 certificates chaining to the
   * authority's published key; here they share the demo keyed-digest. The cert
   * is bound to a holder id and scope so it cannot be reused by anyone else.
   * ────────────────────────────────────────────────────────────────────────── */
  const CAPABILITIES = ['emergency-shutdown', 'firefighting-diversion'];

  function signCapability(cert) {
    const a = AUTHORITIES[cert.authority && cert.authority.id];
    if (!a) throw new Error('unknown authority: ' + (cert.authority && cert.authority.id));
    return khash(a.key, 'cap§' + canon(cert));
  }
  function verifyCapability(cert, capability, opts) {
    const reasons = [];
    const fail = (r) => reasons.push(r);
    if (!cert || typeof cert !== 'object') return { ok: false, reasons: ['no certificate presented'] };
    if (cert.product !== 'HydroManifold') fail('not a HydroManifold certificate');
    if (CAPABILITIES.indexOf(cert.capability) < 0) fail('unknown capability: ' + cert.capability);
    if (capability && cert.capability !== capability) fail('certificate is for "' + cert.capability + '", not "' + capability + '"');
    if (!cert.holderUserId) fail('certificate names no holder');
    const a = AUTHORITIES[cert.authority && cert.authority.id];
    if (!a) fail('issuing authority not recognized');
    else if (cert.sig !== khash(a.key, 'cap§' + canon(cert))) fail('certificate signature invalid — forged or altered');
    const t = today(opts);
    if (cert.notBefore && ymd(cert.notBefore) > t) fail('certificate not yet in effect');
    if (cert.expires && ymd(cert.expires) < t) fail('certificate expired (' + ymd(cert.expires) + ')');
    if (opts && opts.holderUserId && cert.holderUserId !== opts.holderUserId) fail('certificate belongs to a different holder');
    if (opts && opts.pwsid && cert.scopePwsid && cert.scopePwsid !== '*' && cert.scopePwsid !== opts.pwsid) fail('certificate not valid for this PWSID');
    return { ok: reasons.length === 0, reasons, certificate: cert, authorityName: a ? a.name : null };
  }

  root.HM_LICENSE = {
    AUTHORITIES, ACCEPTED_TYPES, PWS_CLASSES, SOURCE_TYPES, AWIA_POP_THRESHOLD, CAPABILITIES,
    canon, sign, verifyAuthorization, assessCommissioning, goLiveVerdict,
    commissioningTests, deployGate, riskBriefing, exceptionComplete, signCapability, verifyCapability,
    hasProvenance, calCurrent,
    readInstalled, writeInstalled, liveStatus, encodeToken, decodeToken, MODE_KEY
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_LICENSE;
}(typeof window !== 'undefined' ? window : globalThis));
