/* ============================================================================
 * HydroManifold — Operations Center controller
 * Wires the schema-driven registry + RBAC + tamper-evident audit + live
 * monitoring + compliance + failsafe-AI into one admin platform. The registry's
 * schema-driven design means ONE generic renderer serves every domain.
 * ========================================================================== */
(function () {
  'use strict';
  const REG = window.HMP_REGISTRY, RB = window.HMP_RBAC, AUD = window.HMP_AUDIT, SCH = window.HMP_SCHEMAS,
    CMP = window.HMP_COMPLIANCE, V = window.HMP_VERIFY, AI = window.HMP_AI, RPT = window.HMP_REPORTS, SEAL = window.HMP_SEAL,
    CHARTS = window.HMP_CHARTS, ANL = window.HMP_ANALYTICS,
    ENG = window.HM_ENGINE, TOP = window.HM_TOPOLOGY, MAN = window.HM_MANIFOLD,
    LIC = window.HM_LICENSE, DEP = window.HM_DEPLOY, PPL = window.HMP_PEOPLE, SENS = window.HM_SENSORS, NOTIFY = window.HM_NOTIFY;
  // Identifying mark / logo placed on governed documents.
  const LOGO = '<svg width="22" height="22" viewBox="0 0 24 24" style="vertical-align:middle"><path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z" fill="#3fd0ff" opacity=".85"/><text x="12" y="17" font-size="7" fill="#04141d" text-anchor="middle" font-family="ui-monospace,monospace" font-weight="700">z·</text></svg>';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let role = 'administrator', user = 'admin', view = 'dashboard', activeCol = null, search = '';
  const KEY = 'theconduit-hm-seal';                              // deployment key (demo; prod: HSM/KMS)
  // The seal/registry stores use a { get, set } interface; localStorage exposes
  // getItem/setItem, so adapt it (and fall back to in-memory if storage is
  // blocked, e.g. some file:// or private-mode contexts).
  const baseStore = (function () {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.getItem('__hm_probe__');                  // throws where storage is blocked → fall back
        return { get: function (k) { return localStorage.getItem(k); }, set: function (k, v) { localStorage.setItem(k, v); } };
      }
    } catch (_) {}
    return REG.memoryStore();
  })();
  const store = SEAL.encryptedStore(baseStore, KEY);            // every parameter encrypted at rest
  const seal = new SEAL.ManifoldSeal({ key: KEY, shape: store.get('hmpv3:shape') || undefined });
  // Sign + authenticate + fold the manifold shape for every parameter ingested.
  function sealSigner(registry, colId, action, row) {
    const c = registry.col(colId);
    const info = seal.ingest(row, user, role, c ? c.schema : null);
    row._by = user; row._role = role; row._prevShape = info.prevShape; row._sig = info.signature; row._shape = info.shape;
    try { store.set('hmpv3:shape', seal.shape); } catch (_) {}
  }
  const audit = new AUD.AuditLog({ store: store, ns: 'hmpv3' });
  const reg = new REG.Registry({ ns: 'hmpv3', store: store, signer: sealSigner, onChange: (col, action, row) => audit.append(user, role, action, col, describeRow(reg.col(col), row) + ' · shape ' + seal.shape) });
  SCH.COLLECTIONS.forEach((c) => reg.define(c));
  function verifyIntegrity(colId) {
    let total = 0, bad = 0; (colId ? [reg.col(colId)] : reg.all()).forEach((c) => c && c.rows.forEach((r) => { total++; if (!seal.verify(r, c.schema)) bad++; }));
    return { total: total, bad: bad, ok: bad === 0 };
  }
  // ── non-PII identity: every actor is logged by a user-id, never by name ──
  function refreshIdentity() { user = PPL.actingUserId(reg.list('personnel'), role); }
  refreshIdentity();

  // ── operating state: STAGING/TESTING (simulation) → DEPLOY → AUTHORIZED (live)
  //    → EMERGENCY SHUTDOWN. Real-time operation is locked until deploy. ─────────
  const sound = new PPL.Sound();
  let op = { mode: 'SIMULATION', authorization: null, deployed: false, provisional: false, shutdown: false, nodes: [], conn: {}, accepted: [], decision: null, notices: [] };
  (function restoreOp() {
    const inst = LIC.readInstalled(baseStore);
    if (inst && inst.authorization) { op.authorization = inst.authorization; op.mode = inst.mode || 'SIMULATION'; op.deployed = inst.mode === 'AUTHORIZED'; op.provisional = !!inst.provisional; op.shutdown = inst.mode === 'SHUTDOWN'; }
  })();
  function pwsid() { return (op.authorization && op.authorization.pws && op.authorization.pws.pwsid) || null; }
  function canDeployRole() { return RB.capable(role, '*') || RB.can(role, 'edit', 'commissioning'); }

  // Build the go-live evaluation bundle straight from CMS content.
  function goliveBundle() {
    const required = SENS && SENS.defaultSensors ? SENS.defaultSensors()
      : ['pressure_transducer', 'mag_flow', 'pd_meter', 'radar_level', 'turbidity', 'ph', 'chlorine_residual', 'temperature_rtd'];
    return {
      authorization: op.authorization, requiredClasses: required,
      complianceClasses: ['turbidity', 'ph', 'chlorine_residual'],
      components: reg.list('components'), prerequisites: reg.list('commissioning'), feeds: reg.list('data_feeds')
    };
  }
  // Derive a holder-bound capability certificate from a pre-authorization row. The
  // row IS the beforehand pre-authorization; the signature is deterministic over
  // its fields, so it verifies instantly during the emergency.
  function certFor(row) {
    const cap = row.capability;
    const cert = {
      product: 'HydroManifold', capability: cap, holderUserId: row.userId, holderRole: row.role || '',
      scopePwsid: cap === 'emergency-shutdown' ? (row.scope || '*') : '*',
      scopeSource: cap === 'firefighting-diversion' ? (row.scope || '') : '',
      certId: row.certId || '', authority: { id: row.authority }, issued: row.issued || '', notBefore: row.issued || '', expires: row.expires || ''
    };
    cert.sig = LIC.signCapability(cert); return cert;
  }

  // Install a pasted, signed operating authorization (after verification).
  function installAuthorization(token) {
    const auth = LIC.decodeToken(token);
    if (!auth) return { ok: false, msg: 'Could not parse the authorization token.' };
    const v = LIC.verifyAuthorization(auth, {});
    if (!v.ok) { audit.append(user, role, 'auth-rejected', 'golive', 'Authorization rejected: ' + v.reasons.join('; ')); return { ok: false, msg: 'Rejected — ' + v.reasons.join('; ') }; }
    op.authorization = auth;
    audit.append(user, role, 'auth-installed', 'golive', 'Operating authorization installed · ' + v.authorityName + ' · PWSID ' + (auth.pws || {}).pwsid + ' · type ' + auth.authorizationType);
    return { ok: true, verdict: v };
  }
  function uninstallAuthorization() {
    op.authorization = null; op.deployed = false; op.mode = 'SIMULATION'; op.shutdown = false; op.nodes = []; op.conn = {};
    LIC.writeInstalled({ mode: 'SIMULATION' }, baseStore);
    audit.append(user, role, 'auth-removed', 'golive', 'Operating authorization removed — returned to SIMULATION');
  }

  // The software recommends; the NAMED authorizing authority decides. The
  // authorizing authority is the certified Operator in Responsible Charge named
  // on the installed authorization, or an Administrator (change authority).
  function isAuthorizingAuthority() {
    if (RB.capable(role, '*')) return true;
    const orc = op.authorization && op.authorization.orc;
    if (!orc) return false;
    const p = reg.list('personnel').find((x) => x.name === orc.name);
    return !!(p && p.userId === user);
  }
  function authorityDisplayName() {
    const orc = op.authorization && op.authorization.orc;
    if (orc) { const p = reg.list('personnel').find((x) => x.name === orc.name); if (p && p.userId === user) return orc.name + ' (ORC, ' + (orc.certNumber || '') + ')'; }
    const me = reg.list('personnel').find((x) => x.userId === user);
    return (me ? me.name : user) + ' · ' + RB.ROLES[role].label;
  }

  // Record the authorizing authority's GO decision accepting the open risks.
  // EVERY exception requires a documented PURPOSE, a JUSTIFICATION, and a signed
  // LEGAL WAIVER. The decision is sealed and logged BY NAME (a go/no-go decision
  // is owned by a named authority — not anonymized like routine access).
  function recordGoDecision(open, purpose, justification, legalWaiver) {
    if (!isAuthorizingAuthority()) { alert('Only the named authorizing authority (Operator in Responsible Charge or Administrator) may record a go/no-go decision.'); return false; }
    if (!purpose || purpose.trim().length < 6) { alert('A documented PURPOSE is required for every exception.'); return false; }
    if (!justification || justification.trim().length < 12) { alert('A JUSTIFICATION is required for every exception.'); return false; }
    if (!legalWaiver || legalWaiver.trim().length < 4) { alert('A signed LEGAL WAIVER reference is required for every exception.'); return false; }
    const name = authorityDisplayName();
    op.accepted = open.map((id) => {
      const o = { testId: id, by: user, authorityName: name, role, purpose: purpose.trim(), justification: justification.trim(), legalWaiver: legalWaiver.trim(), at: nowStamp() };
      o.sig = SEAL.khash(KEY, LIC.canon(o)); return o;
    });
    op.decision = { decision: 'GO', by: user, authorityName: name, role, purpose: purpose.trim(), justification: justification.trim(), legalWaiver: legalWaiver.trim(), at: nowStamp(), accepted: open.slice() };
    audit.append(user, role, 'GO-decision', 'golive', 'AUTHORIZED GO over ' + open.length + ' open risk(s) by ' + name + ' · purpose: ' + purpose.trim().slice(0, 50) + ' · waiver ' + legalWaiver.trim() + ' · PROVISIONAL');
    return true;
  }
  function recordNoGo() {
    if (!isAuthorizingAuthority()) { alert('Only the named authorizing authority may record a go/no-go decision.'); return false; }
    op.accepted = []; op.decision = { decision: 'NO-GO', by: user, authorityName: authorityDisplayName(), role, at: nowStamp() };
    audit.append(user, role, 'NO-GO-decision', 'golive', 'NO-GO recorded by ' + op.decision.authorityName + ' — deployment withheld');
    if (op.deployed && !op.shutdown) emergencyShutdown();   // a NO-GO on a live system → halt
    return true;
  }

  // DEPLOY — only when the recommendation is GO, or the authorizing authority has
  // accepted every open risk (documented purpose + justification + legal waiver). Ingests
  // the CMS, finds applicable nodes, hand-shakes each (AMBER → GREEN/RED), and
  // begins active monitoring. Writes the shared operating state for the live app.
  function deploy() {
    const b = goliveBundle();
    const gate = LIC.deployGate(LIC.commissioningTests(b, {}), op.accepted);
    if (!gate.canDeploy) { alert('Deploy not permitted — recommendation is NO-GO and the open risks have not been accepted by the authorizing authority (with purpose, justification & legal waiver).'); return; }
    op.shutdown = false; op.provisional = gate.provisional;
    op.nodes = DEP.planDeployment(b); op.conn = {};
    op.nodes.forEach((n) => op.conn[n.id] = DEP.CONN.AMBER.key);     // establishing
    audit.append(user, role, 'deploy-begin', 'golive', 'Deploy initiated — ingested CMS, handshaking ' + op.nodes.length + ' node(s)' + (gate.provisional ? ' · PROVISIONAL (authority GO over ' + gate.accepted.length + ' risk)' : ''));
    if (view === 'golive') renderGoLive();
    op.nodes.forEach((n, i) => setTimeout(() => {
      op.conn[n.id] = DEP.handshake(n);
      if (i === op.nodes.length - 1) finishDeploy();
      if (view === 'golive') renderGoLive();
    }, 300 + i * 220));
  }
  function finishDeploy() {
    op.deployed = true; op.mode = 'AUTHORIZED';
    const connected = op.nodes.filter((n) => op.conn[n.id] === DEP.CONN.GREEN.key).length;
    LIC.writeInstalled({ mode: 'AUTHORIZED', provisional: op.provisional, authorization: op.authorization, pwsid: pwsid(), deployedAt: nowStamp() }, baseStore);
    audit.append(user, role, 'deploy-complete', 'golive', 'Active monitoring begun · PWSID ' + pwsid() + ' · ' + connected + '/' + op.nodes.length + ' connected' + (op.provisional ? ' · PROVISIONAL operation (authority GO + legal waiver on record)' : ''));
    if (sound) sound.beep('alarm');
  }

  // MANDATORY NOTIFICATION — any supply shut down / drained / offline / reduced
  // (planned or unplanned) generates a non-optional notice to fire authorities,
  // the regulator, and affected agricultural & downstream users, logged
  // immutably (hash-chained audit) so it is provable that they were told. This is
  // a simulation: it computes & records the dispatch, it does not send real
  // messages. Returns the recipients notified.
  function notifySupplyEvent(eventType, supplyName, detail) {
    const mandatory = reg.list('notify_external').filter((r) => String(r.mandatory).toLowerCase() === 'yes');
    const ev = { eventType, supply: supplyName, pwsid: pwsid(), status: detail || '', detail: detail || '', severity: 'critical', at: nowStamp(), from: 'HydroManifold Operations Center' };
    // dispatch through the pluggable transport (SIMULATED by default; real SMTP/
    // SMS/webhook/IPAWS drops in via HM_NOTIFY.configure — same call site).
    const result = NOTIFY.notify(ev, mandatory);
    const chSummary = Object.keys(result.byChannelStatus).map((k) => result.byChannelStatus[k] + '×' + k).join(', ');
    audit.append(user, role, 'MANDATORY-NOTICE', 'notify_external',
      eventType + ' · ' + supplyName + ' — dispatched ' + result.deliveries.length + ' notice(s) [' + chSummary + ']' + (result.simulated ? ' (SIMULATED)' : '') + (detail ? ' · ' + detail : ''));
    op.notices = [{ at: ev.at, eventType, supply: supplyName, detail: detail || '', count: result.deliveries.length, simulated: result.simulated, deliveries: result.deliveries }].concat(op.notices).slice(0, 20);
    if (sound) sound.beep('critical');
    return result;
  }
  // Change a supply's availability and fire the mandatory notice. statusVerb is
  // the human event ('shut down' / 'drained' / 'taken offline' / 'planned reduction').
  function setSupplyAvailability(supplyId, newStatus, statusVerb) {
    const row = reg.get('water_supplies', supplyId); if (!row) return;
    reg.update('water_supplies', supplyId, { status: newStatus });
    if (newStatus !== 'in-service') notifySupplyEvent('supply ' + statusVerb, row.name, 'status → ' + newStatus);
    else audit.append(user, role, 'supply-restored', 'water_supplies', row.name + ' returned to service');
    renderGoLive();
  }

  // EMERGENCY SHUTDOWN — instant, but only for a holder of a pre-signed
  // emergency-shutdown certificate scoped to this system. No approval delay.
  function emergencyShutdown() {
    const row = reg.list('emergency_auth').find((r) => r.capability === 'emergency-shutdown' && r.userId === user && String(r.status).toLowerCase() === 'active' && (r.scope === '*' || r.scope === pwsid()));
    if (!row) { audit.append(user, role, 'shutdown-denied', 'golive', 'No pre-signed emergency-shutdown certificate for ' + user); alert('DENIED — you hold no pre-signed emergency-shutdown certificate for this system.\n\nEmergency-shutdown authority is pre-authorized beforehand in “Emergency Authorizations”.'); return; }
    const vr = LIC.verifyCapability(certFor(row), 'emergency-shutdown', { holderUserId: user, pwsid: pwsid() });
    if (!vr.ok) { audit.append(user, role, 'shutdown-denied', 'golive', 'Certificate failed: ' + vr.reasons.join('; ')); alert('DENIED — certificate failed verification:\n' + vr.reasons.join('; ')); return; }
    op.shutdown = true; op.mode = 'SHUTDOWN';
    Object.keys(op.conn).forEach((k) => op.conn[k] = DEP.CONN.BLACK.key);
    LIC.writeInstalled({ mode: 'SHUTDOWN', authorization: op.authorization, shutdownBy: user, at: nowStamp() }, baseStore);
    audit.append(user, role, 'EMERGENCY-SHUTDOWN', 'golive', 'Emergency shutdown executed under cert ' + row.certId + ' by ' + user + ' — monitoring HALTED (BLACK)');
    if (sound) sound.beep('emergency');
    notifySupplyEvent('emergency shutdown', (op.authorization && op.authorization.pws ? op.authorization.pws.name : 'system'), 'real-time monitoring halted — supply availability uncertain');
    renderGoLive();
  }
  function reestablish() {
    const row = reg.list('emergency_auth').find((r) => r.capability === 'emergency-shutdown' && r.userId === user && (r.scope === '*' || r.scope === pwsid()));
    if (!row) { alert('Lifting a shutdown also requires emergency-shutdown authority.'); return; }
    audit.append(user, role, 'shutdown-lift', 'golive', 'Emergency shutdown lifted by ' + user + ' — re-establishing connections');
    op.shutdown = false; deploy();
  }
  // FIREFIGHTING DIVERSION — immediate, pre-authorized for the named holder/source.
  function firefightingDivert(source) {
    const row = reg.list('emergency_auth').find((r) => r.capability === 'firefighting-diversion' && r.userId === user && String(r.status).toLowerCase() === 'active' && (r.scope === '*' || r.scope === source));
    if (!row) { audit.append(user, role, 'diversion-denied', 'golive', 'No firefighting-diversion certificate for ' + user + ' / ' + source); alert('DENIED — you hold no pre-signed firefighting-diversion certificate for “' + source + '”.'); return; }
    const vr = LIC.verifyCapability(certFor(row), 'firefighting-diversion', { holderUserId: user });
    if (!vr.ok) { alert('DENIED — ' + vr.reasons.join('; ')); return; }
    audit.append(user, role, 'FIREFIGHTING-DIVERSION', 'golive', 'Immediate firefighting diversion of “' + source + '” under cert ' + row.certId + ' by ' + user);
    if (sound) sound.beep('critical');
    alert('✓ Firefighting diversion of “' + source + '” implemented immediately under pre-authorization ' + row.certId + '.');
    renderGoLive();
  }

  const drift = new V.DriftMonitor();
  const sim = new ENG.Simulator(TOP.buildTopology('city'), { speed: 200 });
  for (let i = 0; i < 200; i++) sim.tick(16);                 // warm the live snapshot
  setInterval(() => { for (let i = 0; i < 5; i++) sim.tick(60); }, 1000);

  // ── real-time series history (source for trend charts + predictors) ──
  const SERIES_PARAMS = ['pressure', 'chlorine', 'turbidity', 'temperature', 'flow', 'level'];
  const series = { z: [], byParam: {} }; SERIES_PARAMS.forEach((p) => series.byParam[p] = []);
  function paramMean(p) { const vals = []; sim.stations.forEach((st) => { const r = st.readings[p]; if (r && typeof r.value === 'number') vals.push(r.value); }); return vals.length ? vals.reduce((a, v) => a + v, 0) / vals.length : null; }
  function captureSeries() {
    push(series.z, sim.aggregate().z);
    SERIES_PARAMS.forEach((p) => { const m = paramMean(p); if (m != null) push(series.byParam[p], m); });
  }
  function push(arr, v) { if (v == null || isNaN(v)) return; arr.push(v); if (arr.length > 120) arr.shift(); }
  for (let s = 0; s < 8; s++) { for (let i = 0; i < 12; i++) sim.tick(40); captureSeries(); }   // pre-seed trend history
  setInterval(captureSeries, 1500);

  function describeRow(col, row) { const f = col.schema[0]; return (row[f.key] != null ? row[f.key] : row._id); }
  function snapshot() { return CMP.snapshot(sim); }
  function facts() {
    const s = snapshot();
    const tripped = sim.stations.some((st) => st.faults.pumpTrip);
    return { turbidity: s.turbidity, chlorine: s.chlorine, pressure: s.pressure, ph: s.ph, pumpTrip: tripped, flow: tripped ? 0 : 1, z: sim.aggregate().z };
  }

  // ── navigation ──
  function buildRoles() {
    const sel = $('role');
    Object.keys(RB.ROLES).forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = RB.ROLES[id].label; sel.appendChild(o); });
    sel.value = role;
    sel.addEventListener('change', () => {
      const prev = user; role = sel.value; refreshIdentity();
      audit.append(user, role, 'role-change', 'rbac', 'Now acting as ' + RB.ROLES[role].label + ' (was ' + prev + ')');
      buildNav(); render(view, activeCol);
    });
  }

  function buildNav() {
    const special = [['about', 'ℹ️ Start here'], ['dashboard', '🏠 Dashboard'], ['golive', '⚙️ Deployment & Go-Live'], ['compliance', '✅ Compliance (live)'], ['statistics', '📈 Statistics'], ['failsafe', '🧠 Failsafe AI integrity'], ['audit', '📜 Audit trail'], ['reports', '📑 Reports & FOIA'], ['manifold', '⨳ Manifold paradigm & proofs']];
    let html = '<div class="grp">Command</div>';
    special.forEach(([id, lbl]) => { html += navLink(id, lbl, null); });
    const groups = {};
    reg.all().forEach((c) => { (groups[c.group] = groups[c.group] || []).push(c); });
    Object.keys(groups).forEach((g) => {
      html += `<div class="grp">${esc(g)}</div>`;
      groups[g].forEach((c) => { html += navLink(c.id, c.icon + ' ' + c.name, reg.count(c.id), !RB.can(role, 'view', c.id)); });
    });
    $('nav').innerHTML = html;
    $('nav').querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      if (a.classList.contains('locked')) return;
      const id = a.getAttribute('data-v');
      // ACCESS LOGGING: every navigation — even just looking — is logged by
      // non-PII user-id + timestamp (the audit log stamps the time).
      const isSpecial = special.find((s) => s[0] === id);
      if (id !== view && !(view === 'collection' && activeCol === id)) {
        audit.append(user, role, 'view', id, 'Viewed ' + (isSpecial ? id : (reg.col(id) ? reg.col(id).name : id)));
      }
      if (isSpecial) render(id, null); else render('collection', id);
    }));
  }
  function navLink(id, lbl, count, locked) {
    const act = ((view === id) || (view === 'collection' && activeCol === id)) ? ' active' : '';
    return `<a data-v="${id}" class="${locked ? 'locked' : ''}${act}">${esc(lbl)}${count != null ? `<span class="ct">${count}</span>` : ''}</a>`;
  }

  // ── render router ──
  function render(v, col) {
    view = v; activeCol = (v === 'collection') ? col : null;
    buildNav();
    const _vi = verifyIntegrity();
    $('audit-status').textContent = 'seal ' + seal.shape.slice(0, 6) + (_vi.ok ? ' ✓' : ' ⚠') + ' · audit ' + (audit.verify().ok ? '✓' : '⚠ TAMPERED') + ' · ' + audit.entries.length + ' events';
    if (v === 'about') return renderAbout();
    if (v === 'manifold') return renderManifoldDocs();
    if (v === 'dashboard') return renderDashboard();
    if (v === 'golive') return renderGoLive();
    if (v === 'compliance') return renderCompliance();
    if (v === 'statistics') return renderStatistics();
    if (v === 'failsafe') return renderFailsafe();
    if (v === 'audit') return renderAudit();
    if (v === 'reports') return renderReports();
    if (v === 'collection') return renderCollection(col);
  }

  // ── dashboard ──
  function renderDashboard() {
    const cr = CMP.summary(CMP.evaluateAll(reg.list('regulations'), snapshot()));
    const openInc = reg.list('incidents').filter((r) => r.status !== 'resolved').length;
    const eqDue = reg.list('equipment').filter((r) => r.conditionPct < 60 || r.status === 'down').length;
    const pastDue = reg.list('accounts').filter((r) => r.status === 'past_due' || r.status === 'shutoff_pending').length;
    const z = sim.aggregate().z, st = MAN.statusForHealth(z);
    const ds = drift.report(); const cons = reg.list('conservation').find((r) => r.status === 'active');
    const inc = sum(reg.list('financials').filter((f) => f.category === 'income'), 'amount');
    const exp = sum(reg.list('financials').filter((f) => f.category === 'expense'), 'amount');
    const net = inc - exp;
    const k = (v, l, cls) => `<div class="kpi"><div class="v" style="color:${cls || 'var(--txt)'}">${v}</div><div class="l">${l}</div></div>`;
    $('main').innerHTML = `<div class="h1">Operations dashboard</div><div class="sub">Live system + compliance + AI integrity at a glance. Acting as ${esc(RB.ROLES[role].label)}.</div>
      <div class="kpis">
        ${k((cr.rate * 100).toFixed(0) + '%', 'Regulatory compliance', cr.violation ? 'var(--bad)' : 'var(--ok)')}
        ${k(MAN.colorForHealth(z) && z.toFixed(2), 'System health (z=x·y)', MAN.colorForHealth(z))}
        ${k(openInc, 'Open incidents', openInc ? 'var(--warn)' : 'var(--ok)')}
        ${k(eqDue, 'Assets needing service', eqDue ? 'var(--warn)' : 'var(--ok)')}
        ${k(pastDue, 'Accounts past-due', pastDue ? 'var(--warn)' : 'var(--ok)')}
        ${k(money(net), 'Net (this period)', net >= 0 ? 'var(--ok)' : 'var(--crit)')}
        ${k(ds.state, 'Failsafe AI', ds.state === 'TRUSTED' ? 'var(--ok)' : ds.state === 'HUMAN_REVIEW' ? 'var(--crit)' : 'var(--warn)')}
        ${k(reg.all().length, 'Domains managed')}
        ${k(audit.verify().ok ? '✓' : '⚠', 'Audit chain', audit.verify().ok ? 'var(--ok)' : 'var(--crit)')}
        ${k(seal.shape.slice(0, 6), 'Manifold seal', verifyIntegrity().ok ? 'var(--ok)' : 'var(--crit)')}
      </div>
      <div class="card"><b>System status:</b> ${esc(st.label)} · worst-point chlorine ${fmt(facts().chlorine)} mg/L, pressure ${fmt(facts().pressure)} psi, turbidity ${fmt(facts().turbidity)} NTU.
      ${cons ? '<br><b>Conservation:</b> ' + esc(cons.measure) + ' active.' : ''}
      <br><span class="note">Redundancy: hash-chained audit (WORM), RAID-6 + offsite archive (Data Governance), manifold telemetry replica feeds these wall displays read-only.</span>
      <br><span class="note">Security: all ${reg.all().reduce((a, c) => a + reg.count(c.id), 0)} parameters signed &amp; authenticated, encrypted at rest; manifold shape <b>${seal.shape}</b> — any change reshapes it unpredictably.</span></div>
      <div class="card"><b>Recent events</b><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        ${audit.recent(8).map((e) => `<tr><td class="mono">${esc(e.ts)}</td><td>${esc(e.actor)}/${esc(e.role)}</td><td>${esc(e.action)}</td><td>${esc(e.detail)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ── generic collection view ──
  function renderCollection(colId) {
    const c = reg.col(colId); if (!c) return;
    if (!RB.can(role, 'view', colId)) { $('main').innerHTML = denied(); return; }
    const canEdit = RB.can(role, 'edit', colId);
    // zero-trust redaction: ANY collection carrying a classification field hides
    // restricted/classified rows unless the role holds clearance.
    const hasClass = c.schema.some((f) => f.key === 'classification');
    const classifiedGate = hasClass && !RB.capable(role, 'security.classified');
    let rows = reg.search(colId, search);
    const pgKey = 'col:' + colId; const info = pageSlice(pgKey, rows);
    const head = c.schema.map((f) => `<th>${esc(f.label)}</th>`).join('') + (canEdit ? '<th></th>' : '');
    const body = info.slice.map((r) => {
      const redact = classifiedGate && ['restricted', 'classified'].includes(r.classification);
      if (redact) return `<tr><td colspan="${c.schema.length + (canEdit ? 1 : 0)}" class="muted">🔒 REDACTED — requires security clearance (zero-trust)</td></tr>`;
      return '<tr>' + c.schema.map((f) => `<td>${cell(f, r[f.key])}</td>`).join('') + (canEdit ? `<td><span class="x" data-del="${r._id}">✕</span></td>` : '') + '</tr>';
    }).join('');
    $('main').innerHTML = `<div class="h1">${esc(c.icon + ' ' + c.name)}</div><div class="sub">${esc(c.desc || '')} ${canEdit ? '' : '<span class="pill warn">read-only for your role</span>'}</div>
      <div class="bar">
        <input id="q" placeholder="Search ${esc(c.name)}…" value="${esc(search)}">
        ${canEdit ? (colId === 'components' ? '<button class="btn primary" id="ingestbtn">📥 Ingest documentation</button>' : '<button class="btn primary" id="add">+ Add record</button>') : ''}
        ${(canEdit && colId === 'regulations') ? '<button class="btn" id="aiassist">🧠 AI-assisted entry</button>' : ''}
        <button class="btn" id="csv">⤓ Export CSV</button>
        <button class="btn" id="verify">🔐 Verify seal</button>
        <span class="note" id="sealnote">${reg.count(colId)} records · 🔐 signed &amp; authenticated · shape ${seal.shape.slice(0, 6)} · audit-logged</span>
      </div>
      <div id="formhost"></div>
      <div class="card"><table><thead><tr>${head}</tr></thead><tbody>${body || '<tr><td class="muted">No records.</td></tr>'}</tbody></table>${pagerHtml(pgKey, info)}</div>`;
    wirePagers(() => renderCollection(colId));
    $('q').addEventListener('input', (e) => { search = e.target.value; resetPage(pgKey); renderCollection(colId); const el = $('q'); if (el) { el.focus(); const p = el.value.length; el.setSelectionRange(p, p); } });
    $('csv').addEventListener('click', () => download(colId + '.csv', reg.toCSV(colId)));
    $('verify').addEventListener('click', () => { const vi = verifyIntegrity(colId); $('sealnote').innerHTML = vi.ok ? `✓ all ${vi.total} records verify against the manifold seal` : `<span class="critc">⚠ ${vi.bad}/${vi.total} failed verification — tampering detected</span>`; });
    if (canEdit) {
      $('main').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { reg.remove(colId, b.getAttribute('data-del')); renderCollection(colId); }));
      if ($('add')) $('add').addEventListener('click', () => showForm(c));
      if ($('ingestbtn')) $('ingestbtn').addEventListener('click', () => showIngest(c));
      if ($('aiassist')) $('aiassist').addEventListener('click', () => showAI(c));
    }
  }
  function cell(f, v) {
    if (f.type === 'select') { const cls = statusPill(v); return cls ? `<span class="pill ${cls}">${esc(v)}</span>` : esc(v); }
    if (f.type === 'url' && v) return `<a class="lnk" href="${esc(v)}" target="_blank" rel="noopener">link ↗</a>`;
    if ((f.type === 'textarea' || f.type === 'file') && v) { const s = String(v); return `<span title="${esc(s)}">${esc(s.length > 56 ? s.slice(0, 56) + '…' : s)}</span>`; }
    return esc(v);
  }
  function statusPill(v) {
    if (['active', 'compliant', 'current', 'received', 'in-service', 'resolved', 'armed', 'paid', 'filed', 'verified', 'connected'].includes(v)) return 'ok';
    if (['pending', 'past_due', 'monitoring', 'standby', 'requested', 'mitigating', 'recovering', 'renewing', 'due', 'on-leave', 'investigating', 'dispatched', 'new', 'emergency-only', 'unverified', 'degraded'].includes(v)) return 'warn';
    if (['shutoff_pending', 'down', 'high', 'exceedance', 'overdue', 'lapsed', 'offline', 'boil-order', 'disconnected', 'disputed'].includes(v)) return 'bad';
    if (['critical', 'shutoff', 'classified', 'terrorism', 'sabotage', 'open', 'contaminated', 'quarantined', 'sewer / wastewater', 'criminal activity', 'dead animal in supply'].includes(v)) return 'crit';
    return '';
  }
  function showForm(c) {
    const fields = c.schema.map((f) => `<div><label>${esc(f.label)}</label>${inputFor(f)}</div>`).join('');
    $('formhost').innerHTML = `<div class="card"><b>New ${esc(c.name)} record</b><div class="form">${fields}</div>
      <div class="bar" style="margin-top:8px"><button class="btn primary" id="save">Save</button><button class="btn" id="cancel">Cancel</button></div></div>`;
    $('cancel').addEventListener('click', () => { $('formhost').innerHTML = ''; });
    $('save').addEventListener('click', () => {
      const row = {}; c.schema.forEach((f) => { const el = $('fld-' + f.key); row[f.key] = f.type === 'number' ? parseFloat(el.value) || 0 : el.value; });
      reg.add(c.id, row); $('formhost').innerHTML = ''; renderCollection(c.id);
    });
  }
  function inputFor(f) {
    if (f.type === 'select') return `<select id="fld-${f.key}">${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea id="fld-${f.key}" class="ta" rows="2" placeholder="paste or scan text…"></textarea>`;
    if (f.type === 'url') return `<input id="fld-${f.key}" type="url" placeholder="https://…">`;
    if (f.type === 'file') return `<input type="file" id="file-${f.key}"><input type="hidden" id="fld-${f.key}"><span class="note" id="fnote-${f.key}"></span>`;
    return `<input id="fld-${f.key}" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}">`;
  }
  // File transfer: read a chunk so we can prove transfer + capture a text excerpt,
  // and record a sealed descriptor (the manifold seal signs the descriptor).
  function wireFileInputs(c) {
    c.schema.filter((f) => f.type === 'file').forEach((f) => {
      const fi = $('file-' + f.key); if (!fi) return;
      fi.addEventListener('change', () => {
        const file = fi.files && fi.files[0];
        if (!file) { $('fld-' + f.key).value = ''; $('fnote-' + f.key).textContent = ''; return; }
        const kb = Math.max(1, Math.round(file.size / 1024));
        const reader = new FileReader();
        reader.onload = () => {
          const txt = String(reader.result || '');
          const excerpt = /text|json|csv|xml/.test(file.type) ? ' · "' + txt.slice(0, 80).replace(/\s+/g, ' ').trim() + '…"' : '';
          $('fld-' + f.key).value = 'file: ' + file.name + ' (' + kb + ' KB) · transferred & sealed' + excerpt;
          $('fnote-' + f.key).textContent = '✓ ' + file.name + ' ingested';
        };
        reader.readAsText(file.slice(0, 4096));
      });
    });
  }
  // Ingest a component from authorized documentation, then deterministically gate
  // "approved for use" on the presence of every required (*) piece of evidence.
  function showIngest(c) {
    const fields = c.schema.map((f) => `<div><label>${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>${inputFor(f)}</div>`).join('');
    $('formhost').innerHTML = `<div class="card"><b>📥 Ingest component documentation</b>
      <div class="note">Provide authorized evidence by <b>link</b>, <b>scanned/pasted text</b>, or <b>file transfer</b>. The record is signed &amp; sealed on ingest; it is <b>approved for use only when required (*) evidence is complete</b>.</div>
      <div class="form" style="margin-top:8px">${fields}</div>
      <div class="bar" style="margin-top:8px"><button class="btn primary" id="ingest">Ingest &amp; verify</button><button class="btn" id="icancel">Cancel</button></div>
      <div id="iresult"></div></div>`;
    wireFileInputs(c);
    $('icancel').addEventListener('click', () => { $('formhost').innerHTML = ''; });
    $('ingest').addEventListener('click', () => {
      const row = {};
      c.schema.forEach((f) => { const el = $('fld-' + f.key); row[f.key] = el ? (f.type === 'number' ? parseFloat(el.value) || 0 : el.value) : ''; });
      const missing = c.schema.filter((f) => f.required && !String(row[f.key] || '').trim()).map((f) => f.label);
      const complete = missing.length === 0;
      row.status = complete ? 'verified' : 'submitted';
      if (!complete) row.approvedForUse = 'pending';     // deterministic gate: no approval without evidence
      reg.add(c.id, row);
      $('iresult').innerHTML = `<div class="card">${complete
        ? '<b class="good">✓ Evidence complete</b> — component signed, sealed &amp; verified; eligible to be approved for use.'
        : '<b class="badc">✗ Incomplete evidence</b> — ingested &amp; sealed as <b>submitted</b>, but it <b>cannot be approved for use</b> until provided:<ul>' + missing.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul>'}
        <div class="bar" style="margin-top:8px"><button class="btn" id="idone">Close</button></div></div>`;
      $('idone').addEventListener('click', () => renderCollection(c.id));
    });
  }
  // AI-assisted entry — drafts a regulation, then the FAILSAFE verifier judges it.
  function showAI(c) {
    $('formhost').innerHTML = `<div class="card"><b>🧠 AI-assisted entry</b> <span class="note">— describe the rule in plain English; the draft is verified before it can be saved.</span>
      <div style="margin-top:8px"><textarea id="aitext" rows="2" style="width:100%;background:var(--panel2);color:var(--txt);border:1px solid var(--edge);border-radius:7px;padding:8px" placeholder="e.g. Federal SDWA — free chlorine residual must be at least 0.2 mg/L in distribution (40 CFR 141.72)"></textarea></div>
      <div class="bar" style="margin-top:8px"><button class="btn primary" id="aigo">Draft & verify</button><button class="btn" id="aicancel">Cancel</button></div>
      <div id="airesult"></div></div>`;
    $('aicancel').addEventListener('click', () => { $('formhost').innerHTML = ''; });
    $('aigo').addEventListener('click', () => {
      const d = AI.draftRecord(c.id, c.schema, $('aitext').value || '');
      const okCls = d.accepted ? 'good' : 'badc';
      $('airesult').innerHTML = `<div class="card"><b>Draft</b> <span class="${okCls}">${d.accepted ? '✓ passed verification' : '✗ rejected by failsafe'}</span>
        <table>${c.schema.map((f) => `<tr><td class="muted">${esc(f.label)}</td><td>${esc(d.record[f.key])}</td></tr>`).join('')}</table>
        ${d.validation.errors.length ? '<div class="badc">Verifier: ' + d.validation.errors.map(esc).join('; ') + '</div>' : ''}
        ${d.accepted ? '<div class="bar" style="margin-top:8px"><button class="btn primary" id="aiins">Insert record</button></div>' : '<div class="note">Fix the description; the platform will not store an unverified AI draft.</div>'}</div>`;
      if (d.accepted) $('aiins').addEventListener('click', () => { reg.add(c.id, d.record); $('formhost').innerHTML = ''; renderCollection(c.id); });
    });
  }

  // ── compliance (live) ──
  function renderCompliance() {
    const snap = snapshot(), results = CMP.evaluateAll(reg.list('regulations'), snap), sum = CMP.summary(results);
    results.forEach((r) => {
      if (r.state === 'violation') {
        const key = 'viol:' + r.reg._id;
        if (!seen[key]) {
          seen[key] = 1;
          audit.append('compliance-engine', 'system', 'violation', 'regulations', r.reg.citation + ' — ' + r.value + ' ' + (r.unit || ''));
          // route the alert to everyone whose roster threshold includes it, and
          // log a PII-free dispatch summary; sound it if alerts are audible.
          const roster = PPL.alertRoster(reg.list('personnel'), 'critical');
          if (roster.length) audit.append('alert-dispatch', 'system', 'alert', 'personnel', PPL.dispatchSummary(roster, 'critical'));
          if (sound) sound.beep('critical');
        }
      }
    });
    $('main').innerHTML = `<div class="h1">✅ Live compliance</div><div class="sub">Regulations (data, from the CMS) evaluated against the live monitoring snapshot at the worst point in the system.</div>
      <div class="kpis"><div class="kpi"><div class="v good">${sum.compliant}</div><div class="l">Compliant</div></div>
        <div class="kpi"><div class="v ${sum.violation ? 'critc' : 'good'}" style="color:${sum.violation ? 'var(--crit)' : 'var(--ok)'}">${sum.violation}</div><div class="l">Violations</div></div>
        <div class="kpi"><div class="v">${sum.manual}</div><div class="l">Procedural</div></div>
        <div class="kpi"><div class="v">${(sum.rate * 100).toFixed(0)}%</div><div class="l">Compliance rate</div></div></div>
      <div class="card"><b>Live snapshot:</b> turbidity ${fmt(snap.turbidity)} NTU · chlorine ${fmt(snap.chlorine)} mg/L · pressure ${fmt(snap.pressure)} psi · pH ${fmt(snap.ph)}</div>
      <div class="card"><table><thead><tr><th>Citation</th><th>Requirement</th><th>Level</th><th>Parameter</th><th>Limit</th><th>Live</th><th>Verdict</th></tr></thead><tbody>
        ${results.map((r) => `<tr><td class="mono">${esc(r.reg.citation)}</td><td>${esc(r.reg.title)}</td><td>${esc(r.reg.level)}</td><td>${esc(r.reg.parameter)}</td><td class="mono">${r.reg.op !== 'n/a' ? esc(r.reg.op + ' ' + r.reg.threshold + ' ' + r.reg.unit) : '—'}</td><td class="mono">${r.value != null ? fmt(r.value) : '—'}</td><td>${verdictPill(r.state)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  const seen = {};
  function verdictPill(s) { const m = { compliant: 'ok', violation: 'crit', manual: 'warn', 'no-data': 'warn', inactive: '' }; return `<span class="pill ${m[s] || ''}">${esc(s)}</span>`; }

  // ── failsafe AI integrity ──
  function renderFailsafe() {
    const f = facts(), ai = AI.assess(f), cc = V.crossCheck(ai, f), rep = drift.report();
    const states = ['TRUSTED', 'WATCH', 'FAILSAFE', 'HUMAN_REVIEW'];
    $('main').innerHTML = `<div class="h1">🧠 Failsafe AI integrity</div><div class="sub">AI proposes; deterministic logic disposes. Manifold truth tables, logic gates, regex, a decision tree and a state machine cross-check every AI output to catch hallucination &amp; drift.</div>
      <div class="card"><b>Integrity state machine</b><div class="fsm" style="margin-top:8px">${states.map((s) => `<span class="st ${s === rep.state ? 'on' : ''} ${s === 'HUMAN_REVIEW' || s === 'FAILSAFE' ? 'danger' : ''}">${s}</span>${s !== 'HUMAN_REVIEW' ? '<span class="muted">→</span>' : ''}`).join('')}</div>
        <div class="note" style="margin-top:8px">Agreement with ground truth: <b>${(rep.agreementRate * 100).toFixed(0)}%</b> · hallucinations caught: <b>${rep.hallucinations}</b> · mode: <b>${esc(rep.mode)}</b></div></div>
      <div class="card"><b>Live cross-check</b><table>
        <tr><td class="muted">AI verdict</td><td><span class="pill ${cc.aiVerdict === 'compliant' ? 'ok' : 'crit'}">${esc(cc.aiVerdict)}</span></td></tr>
        <tr><td class="muted">Deterministic truth</td><td><span class="pill ${cc.truth === 'compliant' ? 'ok' : 'crit'}">${esc(cc.truth)}</span></td></tr>
        <tr><td class="muted">Result</td><td>${cc.agree ? '<span class="good">✓ agree</span>' : '<span class="critc">✗ HALLUCINATION blocked</span>'}</td></tr>
        <tr><td class="muted">Why</td><td>${esc(cc.reason)}</td></tr></table>
        <div class="bar" style="margin-top:8px">
          <button class="btn" id="fs-run">Run AI assessment</button>
          <button class="btn danger" id="fs-hall">Simulate AI hallucination</button>
          <button class="btn" id="fs-override">🔓 Human override</button>
        </div></div>
      <div class="card"><b>Manifold truth-table invariants (ground truth)</b><table><thead><tr><th>ID</th><th>Invariant</th><th>Holds now</th></tr></thead><tbody>
        ${V.INVARIANTS.map((inv) => `<tr><td class="mono">${esc(inv.id)}</td><td>${esc(inv.desc)}</td><td>${inv.holds(Object.assign({ verdict: cc.truth }, f)) ? '<span class="good">✓</span>' : '<span class="critc">✗</span>'}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('fs-run').addEventListener('click', () => { const c = V.crossCheck(AI.assess(facts()), facts()); drift.record(c.agree); audit.append('failsafe', 'system', 'ai-check', 'failsafe', c.agree ? 'AI verified OK' : 'AI rejected: ' + c.reason); renderFailsafe(); });
    $('fs-hall').addEventListener('click', () => { const fa = facts(); const c = V.crossCheck(AI.assess(fa, { hallucinate: true }), fa); drift.record(c.agree); audit.append('failsafe', 'system', c.agree ? 'ai-check' : 'failsafe-engaged', 'failsafe', 'Forced AI claim "compliant"; ' + c.reason); renderFailsafe(); });
    $('fs-override').addEventListener('click', humanOverride);
  }
  function humanOverride() {
    if (!RB.capable(role, '*') && !RB.capable(role, 'security.classified')) { alert('Human override requires Administrator or Security Officer credentials (least privilege).'); return; }
    const cred = prompt('Strong-credential confirm — re-enter access code to authorize override:');
    if (cred == null || cred.length < 4) { audit.append(user, role, 'override-denied', 'failsafe', 'Credential check failed'); return; }
    drift.state = 'TRUSTED'; drift.samples = []; drift.hallucinations = 0;
    audit.append(user, role, 'human-override', 'failsafe', 'Failsafe reset to TRUSTED after human review (credentialed)');
    renderFailsafe();
  }

  // ── statistics (real descriptive stats over live telemetry) ──
  const STAT_UNITS = { pressure: 'psi', chlorine: 'mg/L', turbidity: 'NTU', temperature: '°F', flow: 'GPM', level: '%' };
  // limits for ETA-to-threshold predictors (min = floor we must stay above, max = ceiling we must stay below)
  const STAT_LIMITS = { pressure: { min: 20 }, chlorine: { min: 0.2 }, turbidity: { max: 0.3 }, ph: { min: 6.5, max: 8.5 } };
  function predictRow(p) {
    const s = series.byParam[p] || []; if (s.length < 3) return { trend: 'stable', proj: null, eta: '—' };
    const fit = ANL.linearFit(s); const trend = ANL.describeTrend(fit.slope, 1e-4);
    const proj = ANL.forecast(s, 6);                       // ~6 samples ahead
    let eta = '—'; const lim = STAT_LIMITS[p];
    if (lim) { const t = lim.min != null ? lim.min : lim.max; const e = ANL.etaToThreshold(s, t); if (e.willCross) eta = '~' + Math.round(e.steps * 1.5) + 's to ' + t; }
    return { trend, proj, eta };
  }
  function renderStatistics() {
    const params = SERIES_PARAMS;
    const rows = params.map((p) => {
      const vals = []; sim.stations.forEach((st) => { const r = st.readings[p]; if (r && typeof r.value === 'number') vals.push(r.value); });
      return Object.assign({ p, unit: STAT_UNITS[p], pr: predictRow(p) }, stats(vals));
    }).filter((r) => r.n > 0);
    const inv = reg.all().map((c) => ({ name: c.name, group: c.group, n: reg.count(c.id) }));
    const total = inv.reduce((a, i) => a + i.n, 0);
    const trendArrow = (t) => t === 'rising' ? '<span class="warnc">▲ rising</span>' : t === 'falling' ? '<span class="warnc">▼ falling</span>' : '<span class="muted">▬ stable</span>';
    $('main').innerHTML = `<div class="h1">📈 Statistics, trends &amp; predictors</div><div class="sub">Live descriptive statistics, real-time trends and data-driven predictors across all monitored stations. Established methods only (least-squares trend, sample σ).</div>
      <div class="card"><b>System health trend <span class="note">— z = x·y, last ${series.z.length} samples</span></b>${CHARTS.line([{ name: 'system z', data: series.z, color: '#27e07a' }], { unit: 'z', h: 150 })}</div>
      <div class="card"><b>Live telemetry, trends &amp; predictors — across ${sim.stations.length} representative stations</b>
      <table><thead><tr><th>Parameter</th><th>n</th><th>min</th><th>mean</th><th>p95</th><th>max</th><th>σ</th><th>trend</th><th>predicted</th><th>ETA to limit</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.p} <span class="muted">${r.unit}</span> ${CHARTS.sparkline(series.byParam[r.p], { color: '#3fd0ff' })}</td><td class="mono">${r.n}</td><td class="mono">${fmt(r.min)}</td><td class="mono">${fmt(r.mean)}</td><td class="mono">${fmt(r.p95)}</td><td class="mono">${fmt(r.max)}</td><td class="mono">${fmt(r.sd)}</td><td>${trendArrow(r.pr.trend)}</td><td class="mono">${r.pr.proj == null ? '—' : fmt(r.pr.proj)}</td><td class="mono muted">${esc(r.pr.eta)}</td></tr>`).join('')}
      </tbody></table><div class="note">Predicted = least-squares projection ~6 samples ahead. ETA = projected time to the regulatory limit at the current trend. Predictors are best-effort, data-driven — not guarantees.</div></div>
      <div class="grid2">
        <div class="card"><b>Pressure distribution <span class="note">(live, across stations)</span></b>${CHARTS.histogram(sim.stations.map((st) => st.readings.pressure && st.readings.pressure.value).filter((v) => typeof v === 'number'), { h: 160, color: '#3fd0ff' })}</div>
        <div class="card"><b>Records by group</b>${CHARTS.donut(groupCounts(inv), { h: 160 })}</div>
      </div>
      <div class="card"><b>Record inventory — ${total} records across ${inv.length} managed domains</b>
      <table><thead><tr><th>Domain</th><th>Group</th><th>Records</th></tr></thead><tbody>
      ${inv.map((i) => `<tr><td>${esc(i.name)}</td><td class="muted">${esc(i.group)}</td><td class="mono">${i.n}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  function groupCounts(inv) { const m = {}; inv.forEach((i) => m[i.group] = (m[i.group] || 0) + i.n); return Object.keys(m).map((k) => ({ label: k, value: m[k] })); }
  function stats(a) {
    if (!a.length) return { n: 0 };
    const n = a.length, sorted = a.slice().sort((x, y) => x - y), mean = a.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n);
    return { n: n, min: sorted[0], max: sorted[n - 1], mean: mean, sd: sd, p95: sorted[Math.floor(0.95 * (n - 1))] };
  }
  function money(v) { const s = v < 0 ? '-' : ''; v = Math.abs(v); if (v >= 1e6) return s + '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1e3) return s + '$' + Math.round(v).toLocaleString('en-US'); return s + '$' + v.toFixed(0); }
  function sum(arr, key) { return arr.reduce((a, r) => a + (parseFloat(r[key]) || 0), 0); }

  // ── logs & analysis ──
  let logFilter = '', logAction = '', logAnomalyOnly = false, logHighlight = null;
  function renderAudit() {
    if (!RB.capable(role, 'audit.view') && !RB.capable(role, '*')) { $('main').innerHTML = denied(); return; }
    const v = audit.verify();
    const allEntries = audit.recent(500);
    const anomalyScan = ANL.scanAnomalies(allEntries);
    const actions = ANL.countBy(allEntries, 'action');
    const tl = ANL.timeline(allEntries, 14);
    // apply filters
    let entries = allEntries;
    if (logAction) entries = entries.filter((e) => e.action === logAction);
    if (logAnomalyOnly) entries = entries.filter(ANL.isAnomaly);
    if (logFilter) { const t = logFilter.toLowerCase(); entries = entries.filter((e) => [e.actor, e.role, e.action, e.target, e.detail].some((x) => String(x).toLowerCase().includes(t))); }
    const logInfo = pageSlice('logs', entries);
    $('main').innerHTML = `<div class="h1">📜 Logs &amp; analysis</div><div class="sub">Append-only, hash-chained event log. Any edit to a past entry breaks the chain and is detectable. Search, filter, and find anomalies.</div>
      <div class="card"><b>Chain integrity:</b> ${v.ok ? `<span class="pill ok">✓ intact</span> ${v.count} events · head ${v.head}` : `<span class="pill crit">⚠ TAMPERED at #${v.brokenAt}</span>`}
        · <b>${anomalyScan.count}</b> anomalies detected
        <button class="btn" id="acsv" style="float:right">⤓ Export CSV (FOIA/discovery)</button></div>
      <div class="grid2">
        <div class="card"><b>Events by action</b>${CHARTS.bars(actions.slice(0, 8).map((a) => ({ label: a.label, value: a.value })), { horizontal: true, h: Math.max(120, actions.slice(0, 8).length * 24) })}</div>
        <div class="card"><b>Activity timeline <span class="note">(oldest → newest)</span></b>${CHARTS.line([{ name: 'events', data: tl, color: '#9b8cff' }], { h: 150 })}</div>
      </div>
      <div class="card">
        <div class="bar">
          <input id="logq" placeholder="Search logs…" value="${esc(logFilter)}">
          <select id="logact"><option value="">all actions</option>${actions.map((a) => `<option value="${esc(a.label)}" ${logAction === a.label ? 'selected' : ''}>${esc(a.label)} (${a.value})</option>`).join('')}</select>
          <button class="btn ${logAnomalyOnly ? 'primary' : ''}" id="logan">⚠ Anomalies only</button>
          <button class="btn" id="logfind">🎯 Find last anomaly</button>
          <span class="note">${entries.length} match</span>
        </div>
        <table><thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Target</th><th>Detail</th><th>Hash</th></tr></thead><tbody>
        ${logInfo.slice.map((e) => `<tr class="${ANL.isAnomaly(e) ? 'anrow' : ''} ${logHighlight === e.seq ? 'hl' : ''}" id="log-${e.seq}"><td class="mono">${e.seq}</td><td class="mono">${esc(e.ts)}</td><td>${esc(e.actor)}</td><td>${esc(e.role)}</td><td>${ANL.isAnomaly(e) ? '<span class="critc">⚠ </span>' : ''}${esc(e.action)}</td><td>${esc(e.target)}</td><td>${esc(e.detail)}</td><td class="mono muted">${e.hash}</td></tr>`).join('')}
        </tbody></table>${pagerHtml('logs', logInfo)}</div>`;
    $('acsv').addEventListener('click', () => download('audit-trail.csv', audit.toCSV()));
    wirePagers(() => renderAudit());
    $('logq').addEventListener('input', (e) => { logFilter = e.target.value; resetPage('logs'); const pos = e.target.selectionStart; renderAudit(); const el = $('logq'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
    $('logact').addEventListener('change', (e) => { logAction = e.target.value; resetPage('logs'); renderAudit(); });
    $('logan').addEventListener('click', () => { logAnomalyOnly = !logAnomalyOnly; resetPage('logs'); renderAudit(); });
    $('logfind').addEventListener('click', () => {
      if (!anomalyScan.last) { alert('No anomalies in the log.'); return; }
      logAnomalyOnly = false; logAction = ''; logFilter = ''; logHighlight = anomalyScan.last.seq; renderAudit();
      const el = $('log-' + anomalyScan.last.seq); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // ── reports (governed builder) ──
  const KIND_LABEL = { compliance: 'Regulatory compliance', incidents: 'Incidents & threats', assets: 'Asset condition', billing: 'Billing & collections', 'sensor-stats': 'Sensor statistics', risk: 'Risk assessment', forecast: 'Forecast / futures planning', 'legal-discovery': 'Legal discovery / investigation' };
  const CLASS_PILL = { public: 'ok', internal: 'acc', restricted: 'warn', classified: 'crit' };
  const URG_PILL = { routine: '', priority: 'acc', urgent: 'warn', immediate: 'crit' };
  const rb = { type: 'compliance', format: 'on-screen', cols: null, classification: 'internal', urgency: 'routine', manifest: '', cadence: 'one-time', order: '' };
  let lastDoc = null;
  function isLegal(t) { return t === 'legal-discovery'; }
  function manifestList() { return rb.manifest.split('\n').map((s) => s.trim()).filter(Boolean); }
  function sensorStatsRows() {
    return SERIES_PARAMS.map((p) => { const vals = []; sim.stations.forEach((st) => { const r = st.readings[p]; if (r && typeof r.value === 'number') vals.push(r.value); }); const s = ANL.stats(vals); return s.n ? { parameter: p, unit: STAT_UNITS[p], n: s.n, min: fmt(s.min), mean: fmt(s.mean), p95: fmt(s.p95), max: fmt(s.max), sd: fmt(s.sd) } : null; }).filter(Boolean);
  }
  function forecastRows() {
    const out = []; const zf = ANL.linearFit(series.z);
    out.push({ metric: 'System health z', current: fmt(series.z[series.z.length - 1]), trend: ANL.describeTrend(zf.slope, 1e-4), projected: fmt(ANL.forecast(series.z, 10)), eta: '—' });
    SERIES_PARAMS.forEach((p) => { const s = series.byParam[p]; if (s && s.length > 2) { const pr = predictRow(p); out.push({ metric: p + ' (' + STAT_UNITS[p] + ')', current: fmt(s[s.length - 1]), trend: pr.trend, projected: pr.proj == null ? '—' : fmt(pr.proj), eta: pr.eta }); } });
    return out;
  }
  function riskRows() { const results = CMP.evaluateAll(reg.list('regulations'), snapshot()); const viol = results.filter((r) => r.state === 'violation').length; return ANL.riskRegister(reg, { violations: viol }).rows; }
  function ctxFor() {
    return { registry: reg, audit: audit, include: rb.cols, complianceResults: CMP.evaluateAll(reg.list('regulations'), snapshot()), sensorStats: sensorStatsRows(), risk: riskRows(), forecast: forecastRows() };
  }
  function nowStamp() { try { return new Date().toISOString().replace('T', ' ').slice(0, 19); } catch (_) { return 'now'; } }

  function renderReports() {
    if (!RB.capable(role, 'reports.generate') && !RB.capable(role, '*')) { $('main').innerHTML = denied(); return; }
    const allCols = RPT.columnsFor(rb.type); const selCols = rb.cols || allCols;
    const schedules = reg.list('report_schedules');
    $('main').innerHTML = `<div class="h1">📑 Reports &amp; document control</div><div class="sub">Build a governed document: choose type, format, what is included, classification, urgency, and recipient manifest — one-time or scheduled. Every document is timestamped, hash-stamped, sealed and logged immutably.</div>
      <div class="card"><b>Report builder</b>
        <div class="form" style="margin-top:8px">
          <div><label>Report type</label><select id="rb-type">${Object.keys(KIND_LABEL).map((k) => `<option value="${k}" ${rb.type === k ? 'selected' : ''}>${esc(KIND_LABEL[k])}</option>`).join('')}</select></div>
          <div><label>Format</label><select id="rb-format">${['on-screen', 'CSV', 'PDF (licensed)'].map((f) => `<option ${rb.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div><label>Classification</label><select id="rb-class">${Object.keys(CLASS_PILL).map((c) => `<option ${rb.classification === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div><label>Urgency</label><select id="rb-urg">${Object.keys(URG_PILL).map((u) => `<option ${rb.urgency === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
          <div><label>Cadence</label><select id="rb-cad">${['one-time', 'daily', 'weekly', 'monthly', 'quarterly', 'annual'].map((c) => `<option ${rb.cadence === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div><label>Intended recipients (manifest — one per line; need-to-know)</label><textarea id="rb-man" class="ta" rows="2" placeholder="name &lt;email&gt; — only these may receive it">${esc(rb.manifest)}</textarea></div>
        </div>
        <div style="margin-top:8px"><label class="note">What is included (columns)</label><div class="incl">${allCols.map((c) => `<label class="ck"><input type="checkbox" data-col="${c}" ${selCols.indexOf(c) >= 0 ? 'checked' : ''}> ${esc(c)}</label>`).join('')}</div></div>
        ${isLegal(rb.type) ? `<div style="margin-top:8px"><label>⚖️ Court order / legal-authority order reference <span class="req">*required to release</span></label><input id="rb-order" value="${esc(rb.order)}" placeholder="e.g. Case 2:26-cv-00123 · Subpoena #… / agency order"></div>` : ''}
        <div class="bar" style="margin-top:10px">
          <button class="btn primary" id="rb-gen">📄 Generate document</button>
          <button class="btn" id="rb-sched">🗓️ Save as schedule</button>
        </div>
      </div>
      <div id="rptout"></div>
      <div class="card"><b>Scheduled reports</b> <span class="note">— cadence-driven; run-now in this demo</span>
        <table><thead><tr><th>Name</th><th>Type</th><th>Format</th><th>Cadence</th><th>Recipients</th><th>Next run</th><th>Status</th><th></th></tr></thead><tbody>
        ${schedules.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.type)}</td><td>${esc(s.format)}</td><td><span class="pill">${esc(s.cadence)}</span></td><td class="muted">${esc(s.recipients)}</td><td class="mono">${esc(s.nextRun || '—')}</td><td>${esc(s.status)}</td><td><button class="btn" data-run="${esc(s.type)}">▶ Run now</button></td></tr>`).join('') || '<tr><td class="muted" colspan="8">No schedules.</td></tr>'}
        </tbody></table></div>`;

    // builder bindings
    $('rb-type').addEventListener('change', (e) => { rb.type = e.target.value; rb.cols = null; rb.order = ''; renderReports(); });
    $('rb-format').addEventListener('change', (e) => { rb.format = e.target.value; });
    $('rb-class').addEventListener('change', (e) => { rb.classification = e.target.value; });
    $('rb-urg').addEventListener('change', (e) => { rb.urgency = e.target.value; });
    $('rb-cad').addEventListener('change', (e) => { rb.cadence = e.target.value; });
    $('rb-man').addEventListener('input', (e) => { rb.manifest = e.target.value; });
    if ($('rb-order')) $('rb-order').addEventListener('input', (e) => { rb.order = e.target.value; });
    $('main').querySelectorAll('[data-col]').forEach((cb) => cb.addEventListener('change', () => {
      rb.cols = Array.from($('main').querySelectorAll('[data-col]')).filter((x) => x.checked).map((x) => x.getAttribute('data-col'));
    }));
    $('rb-gen').addEventListener('click', generateDoc);
    $('rb-sched').addEventListener('click', () => {
      const m = manifestList();
      reg.add('report_schedules', { name: KIND_LABEL[rb.type] + ' (' + rb.cadence + ')', type: rb.type, format: rb.format, cadence: rb.cadence, recipients: m.join('; '), nextRun: '', status: 'active' });
      audit.append(user, role, 'schedule', 'reports', 'Scheduled ' + rb.type + ' · ' + rb.cadence);
      renderReports();
    });
    $('main').querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => { rb.type = b.getAttribute('data-run'); rb.cols = null; renderReports(); generateDoc(); }));
    if (lastDoc) renderDoc();
  }

  function generateDoc() {
    const rep = RPT.build(rb.type, ctxFor());
    const ts = nowStamp(); const bytes = rep.csv.length; const bits = bytes * 8;
    const contentHash = SEAL.khash(KEY, rep.csv);                                   // bit-count integrity digest
    const signature = SEAL.khash(KEY, contentHash + '§' + ts + '§' + user + '§' + rb.classification + '§' + manifestList().join(',') + '§' + seal.shape);
    const action = isLegal(rb.type) ? 'discovery-generated' : 'report-generated';
    audit.append(user, role, action, 'reports', rep.title + ' · ' + rb.classification + '/' + rb.urgency + ' · hash ' + contentHash + ' · ' + manifestList().length + ' recipient(s)');
    const seq = (audit.recent(1)[0] || {}).seq;
    lastDoc = { rep, ts, bytes, bits, contentHash, signature, seq, classification: rb.classification, urgency: rb.urgency, manifest: manifestList(), order: rb.order, format: rb.format };
    resetPage('doc');
    renderReports();
  }

  function renderDoc() {
    const d = lastDoc, rep = d.rep; const cls = CLASS_PILL[d.classification] || '';
    const docInfo = pageSlice('doc', rep.rows);
    const recips = d.manifest;
    const legal = rep.kind === 'legal-discovery';
    const canRelease = recips.length > 0 && (!legal || (d.order && d.order.trim()));
    const blockMsg = recips.length === 0 ? 'No recipients on the manifest — release blocked (need-to-know, zero-trust).'
      : (legal && !(d.order && d.order.trim())) ? 'Court order / legal-authority reference required before any release.' : '';
    $('rptout').innerHTML = `<div class="card doc">
      <div class="dochd"><div>${LOGO} <b>HydroManifold</b> <span class="note">Official document · ${esc(rep.title)}</span></div>
        <div><span class="pill ${cls}">${esc(d.classification.toUpperCase())}</span> <span class="pill ${URG_PILL[d.urgency] || ''}">${esc(d.urgency.toUpperCase())}</span></div></div>
      <div class="note">Generated ${esc(d.ts)} · ${rep.rows.length} rows · ${rep.columns.length} columns · audit #${esc(String(d.seq))}</div>
      <div class="manifest"><b>Recipient manifest (need-to-know):</b> ${recips.length ? recips.map((r) => `<span class="pill acc">${esc(r)}</span>`).join(' ') : '<span class="critc">none — release blocked</span>'}</div>
      <table><thead><tr>${rep.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${docInfo.slice.map((r) => '<tr>' + rep.columns.map((c) => `<td>${esc(r[c])}</td>`).join('') + '</tr>').join('') || '<tr><td class="muted" colspan="' + rep.columns.length + '">No rows.</td></tr>'}
      </tbody></table>${pagerHtml('doc', docInfo)}
      <div class="cert"><b>🔐 Certificate of authenticity</b>
        <div class="certgrid">
          <span>Timestamp</span><span class="mono">${esc(d.ts)}</span>
          <span>Size</span><span class="mono">${d.bytes.toLocaleString()} bytes · ${d.bits.toLocaleString()} bits</span>
          <span>Content hash (integrity)</span><span class="mono">${esc(d.contentHash)}</span>
          <span>Manifold seal shape</span><span class="mono">${esc(seal.shape)}</span>
          <span>Signature</span><span class="mono">${esc(d.signature)}</span>
          <span>Immutability</span><span>Logged to append-only, hash-chained audit (#${esc(String(d.seq))}) — non-deletable, non-mutable, tamper-evident.</span>
        </div></div>
      ${legal ? `<div class="flagbox">⚖️ Legal discovery / investigation — release requires a court order or order from a legal authority${d.order ? ': <b>' + esc(d.order) + '</b>' : ' (not yet provided)'}.</div>` : ''}
      <div class="bar" style="margin-top:8px">
        <select id="rel-to" ${canRelease ? '' : 'disabled'}><option value="">release to… (manifest only)</option>${recips.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
        <button class="btn primary" id="rel-go" ${canRelease ? '' : 'disabled'}>📤 Release</button>
        <button class="btn" id="rel-csv" ${canRelease ? '' : 'disabled'}>⤓ Export CSV</button>
        ${blockMsg ? `<span class="critc">${esc(blockMsg)}</span>` : '<span class="note good">✓ cleared for release to manifest recipients</span>'}
      </div>
      <div id="rel-result"></div></div>`;
    if (canRelease) {
      $('rel-go').addEventListener('click', () => {
        const to = $('rel-to').value; if (!to) { $('rel-result').innerHTML = '<div class="note critc">Select a recipient from the manifest.</div>'; return; }
        audit.append(user, role, 'released', 'reports', rep.title + ' → ' + to + (d.order ? ' under order ' + d.order : '') + ' · hash ' + d.contentHash);
        $('rel-result').innerHTML = `<div class="note good">✓ Released to ${esc(to)}${d.order ? ' under order ' + esc(d.order) : ''} — logged immutably.</div>`;
      });
      $('rel-csv').addEventListener('click', () => {
        const to = $('rel-to').value || 'manifest';
        audit.append(user, role, 'released', 'reports', rep.title + ' (CSV) → ' + to + (d.order ? ' under order ' + d.order : '') + ' · hash ' + d.contentHash);
        download(rep.kind + '-report.csv', rep.csv + '\n# Certificate: ' + d.ts + ' hash ' + d.contentHash + ' sig ' + d.signature + ' seal ' + seal.shape + '\n');
      });
    }
    wirePagers(() => renderDoc());
  }

  // ── helpers ──
  function denied() { return `<div class="h1">Access denied</div><div class="card critc">Your role (${esc(RB.ROLES[role].label)}) lacks permission for this area. Least-privilege, default-deny.</div>`; }
  function fmt(v) { return v == null ? '—' : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)); }
  function download(name, text) { const b = new Blob([text], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }

  // ── About & Instructor (free-form, authority-owned; the demo is one example) ──
  function renderAbout() {
    const comps = reg.list('components');
    const canned = comps.filter((c) => !c.dataSource || /sample|canned/i.test(c.dataSource)).length;
    const live = comps.length - canned;
    const total = reg.all().reduce((a, c) => a + reg.count(c.id), 0);
    $('main').innerHTML = `<div class="h1">ℹ️ Start here — this is <i>your</i> build</div>
      <div class="sub">HydroManifold is a <b>free-form, schema-driven</b> platform. Your water authority enters <b>its own</b> information, documentation, and regulations — the way you prepare them. We impose nothing except the ability to <b>ingest, assimilate, and prepare</b> your sensors and the interface to accommodate everything you enter.</div>

      <div class="grid2">
        <div class="card"><b>What you bring</b>
          <ul>
            <li>Your sensors &amp; their tech-specs (by API link, file transfer, or official documentation)</li>
            <li>Your regulations, permits, citations and policies — as <i>data</i>, entered by you</li>
            <li>Your assets, supplies, personnel, procedures and contacts</li>
            <li>Your look — pick a theme and accent up top; build it your way</li>
          </ul>
        </div>
        <div class="card"><b>What the system does — without a rewrite or redeploy</b>
          <ul>
            <li>A new kind of record is just a <b>schema</b> — add one and a full module appears. No code, no redeploy.</li>
            <li>The interface <b>adapts to what you ingest</b>; the failsafe AI assimilates documents into the proper structure and the deterministic engine keeps it honest.</li>
            <li>Currently managing <b>${total}</b> parameters across <b>${reg.all().length}</b> domains — all yours to extend.</li>
          </ul>
        </div>
      </div>

      <div class="card" style="border-left:6px solid var(--accent)"><b>📐 Instructor — the absolutes that ARE required</b>
        <div class="note" style="margin:6px 0">Everything is yours to shape, but a real public water system has non-negotiables. The platform pre-fills these by default and will not let you operate in real time without them:</div>
        <table><tbody>
          <tr><td>A signed <b>operating authorization</b> (state primacy / EPA-direct / delegated) with a certified Operator in Responsible Charge</td><td><a class="lnk" data-v="golive">Go-Live ↗</a></td></tr>
          <tr><td>The <b>must-have sensors</b> (pre-loaded; replace the samples with your live instruments)</td><td><a class="lnk" data-go="components">Components ↗</a></td></tr>
          <tr><td>The mandatory <b>commissioning prerequisites</b> (sample siting plan, certified lab, AWIA, …)</td><td><a class="lnk" data-go="commissioning">Checklist ↗</a></td></tr>
          <tr><td><b>Mandatory notifications</b> on any supply shutdown/drain/offline (fire, regulator, farms)</td><td><a class="lnk" data-go="notify_external">Notifications ↗</a></td></tr>
          <tr><td>Pre-signed <b>emergency &amp; firefighting</b> authorizations</td><td><a class="lnk" data-go="emergency_auth">Emergency ↗</a></td></tr>
        </tbody></table>
      </div>

      <div class="card"><b>🧪 Sample vs. live data.</b> The sensor panels you see are <b>canned samples</b> so the system is never an empty slate — currently <b>${canned}</b> sample and <b>${live}</b> live component(s). The moment you ingest a sensor's <b>actual data</b> (API / file / manual), its real readings <b>replace the canned panel</b> for that instrument. Set a component's <i>Data source</i> to a <b>live —</b> option in <a class="lnk" data-go="components">Component Onboarding</a> as you bring each instrument online.</div>

      <div class="card"><b>🎨 The demo is just one way this could look.</b> Colors, layout and theme are examples — use the theme picker and accent color up top, choose a built-in palette, or set your own. It's your baby to build.
        <div class="form" style="margin-top:8px">
          <div><label>Product name (white-label)</label><input id="ab-brand" value="${esc((window.HM_THEME ? window.HM_THEME.getBrand().name : 'HydroManifold'))}"></div>
          <div><label>Logo / emoji (optional)</label><input id="ab-logo" value="${esc((window.HM_THEME ? window.HM_THEME.getBrand().logo : ''))}" placeholder="💧 or your mark"></div>
        </div>
        <div class="bar" style="margin-top:8px"><button class="btn primary" id="ab-save-brand">Apply branding</button>
          <span class="note">Rename it, logo it, call it whatever you choose. The only mark we keep is <a class="lnk" data-v="manifold">⨳ Powered by Butterflyfx Manifold</a> — with full, citeable documentation &amp; proofs.</span></div>
        <div class="note" style="margin-top:6px">This is a demonstration / simulation; no real water system is connected.</div>
      </div>`;
    $('main').querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => render('collection', a.getAttribute('data-go'))));
    $('main').querySelectorAll('[data-v]').forEach((a) => a.addEventListener('click', () => render(a.getAttribute('data-v'), null)));
    if ($('ab-save-brand')) $('ab-save-brand').addEventListener('click', () => {
      if (window.HM_THEME) window.HM_THEME.setBrand($('ab-brand').value || 'HydroManifold', $('ab-logo').value || '');
      audit.append(user, role, 'rebrand', 'platform', 'Product re-branded to "' + ($('ab-brand').value || 'HydroManifold') + '"');
    });
  }

  // ── Manifold paradigm — documentation & proofs (transparent, reproducible) ──
  function renderManifoldDocs() {
    $('main').innerHTML = `<div class="h1">⨳ Butterflyfx Manifold — geometry-driven data paradigm</div>
      <div class="sub">The one thing every deployment carries. Here is exactly what it is, with the real mathematics, honest limits, and the citations — complete and total transparency, reproducible and auditable.</div>

      <div class="card"><b>Why geometry?</b>
        <div class="note" style="margin:6px 0">Geometry is used here as an <b>organizing and communication language</b>, not a speed trick. A surface lets a single bounded scalar <code>z</code> summarize many noisy inputs in a way that is continuous, comparable, and <b>visually legible</b>: when one axis fails, the surface visibly collapses, so a failure mode is obvious to an operator, an engineer and an auditor alike. It gives one shared mental model across every scale of system without re-deriving it.</div>
        <div class="note"><b>Honest limit:</b> the geometric framing does <b>not</b> make computation faster or asymptotically cheaper — it organizes, models and explains. We claim transparency and legibility, not performance.</div>
      </div>

      <div class="card"><b>z = x · y — the health surface (multiplicative, not averaged)</b>
        <div class="note" style="margin:6px 0"><code>x</code> = supply adequacy, <code>y</code> = integrity &amp; quality, each in [0,1]; <code>z = x·y</code> in [0,1]. Multiplying — not averaging — is the honest choice: if either axis approaches zero the whole collapses, so a strong axis can never hide a failing one. A station with perfect pressure but contaminated water is <b>not</b> healthy.</div>
        <div class="note"><b>Why it's defensible (analogues, cited honestly):</b> a <b>series-system reliability</b> is the product of component reliabilities, <code>R = ∏ Rᵢ</code> — the weakest link drives the product (valid under independent failures). Conceptually it is the <b>Sprengel–Liebig law of the minimum</b>: the scarcest essential factor limits the whole. These justify a product/bottleneck form, not an average.</div>
      </div>

      <div class="card"><b>z = x · y² — the scale axis (cross-coupling grows faster than size)</b>
        <div class="note" style="margin:6px 0">Across tiers, the integrity/coupling axis is weighted quadratically because the number of pairwise interactions among <code>n</code> nodes is <code>C(n,2) = n(n−1)/2 = O(n²)</code> — doubling a system more than doubles the cross-coupling its monitoring must reason about.</div>
        <div class="note"><b>Stated honestly:</b> the quadratic exponent is a <b>modeling choice</b> motivated by that combinatorial count — <i>not</i> a proven law. The popular "value ∝ n²" (Metcalfe's law) is an <b>empirical heuristic and is contested</b> (Briscoe, Odlyzko &amp; Tilly, <i>IEEE Spectrum</i> 2006, argue ~n·log n). We rely only on the exact edge-count <code>n(n−1)/2</code>, not on Metcalfe's law.</div>
      </div>

      <div class="card"><b>Schwarz Diamond &amp; the triply periodic minimal surfaces</b>
        <div class="note" style="margin:6px 0">A <b>minimal surface</b> has zero mean curvature everywhere (principal curvatures equal and opposite). A <b>triply periodic minimal surface (TPMS)</b> repeats on a 3-D lattice, partitioning space into two interpenetrating labyrinths — a natural geometry for two intertwined networks (e.g., the two health axes, or supply vs. return). Standard <b>nodal (level-set) approximations</b>:</div>
        <table><tbody>
          <tr><td>Schwarz <b>P</b> (Primitive)</td><td class="mono">cos x + cos y + cos z = 0</td></tr>
          <tr><td>Schwarz <b>D</b> (Diamond)</td><td class="mono">sin x·sin y·sin z + sin x·cos y·cos z + cos x·sin y·cos z + cos x·cos y·sin z = 0</td></tr>
          <tr><td><b>Gyroid</b> (Schoen)</td><td class="mono">sin x·cos y + sin y·cos z + sin z·cos x = 0</td></tr>
        </tbody></table>
        <div class="note" style="margin-top:6px"><b>Honest caveat:</b> these trigonometric forms are <b>leading-order nodal approximations</b>, not the exact minimal surfaces (the exact surfaces come from the Enneper–Weierstrass representation). The Diamond is also written <code>cos x·cos y·cos z − sin x·sin y·sin z = 0</code> (same surface, shifted by π/4).</div>
      </div>

      <div class="card"><b>Transparency · reproducibility · auditability</b>
        <ul>
          <li><b>Transparent:</b> the formulas above are the whole model — simple, deterministic, and open in the source (<code>manifold.js</code>, <code>engine.js</code>). No hidden weighting.</li>
          <li><b>Reproducible:</b> identical inputs yield identical <code>z</code>; the simulation re-seeds deterministically and the test suites (<code>test_suite.js</code>, <code>tools/test-license.js</code>) pin the behaviour.</li>
          <li><b>Auditable:</b> every parameter is signed, shape-folded and encrypted at rest; every action is hash-chained in the audit trail and CSV-exportable for FOIA / discovery — any later edit breaks the chain and is detectable.</li>
        </ul>
      </div>

      <div class="card"><b>References</b>
        <ul class="note">
          <li>H. A. Schwarz, <i>Gesammelte Mathematische Abhandlungen</i>, Springer, 1933 (Schwarz P &amp; D surfaces, orig. 1865/1890).</li>
          <li>A. H. Schoen, <i>Infinite Periodic Minimal Surfaces Without Self-Intersections</i>, NASA Technical Note <b>TN D-5541</b>, 1970 (the gyroid).</li>
          <li>O. Al-Ketan &amp; R. K. Abu Al-Rub, "Multifunctional Mechanical Metamaterials Based on TPMS Lattices," <i>Adv. Eng. Mater.</i> 21(10):1900524, 2019.</li>
          <li>F. S. L. Bobbert et al., "Additively manufactured porous biomaterials based on minimal surfaces," <i>Acta Biomaterialia</i> 53:572–584, 2017.</li>
          <li>Sprengel (1828) / Liebig (1840), law of the minimum; series-system reliability <code>R = ∏ Rᵢ</code> (standard reliability-block-diagram result, independent failures).</li>
          <li>Briscoe, Odlyzko &amp; Tilly, "Metcalfe's Law is Wrong," <i>IEEE Spectrum</i>, 2006 (why n² network-value is a contested heuristic).</li>
        </ul>
      </div>`;
  }

  // ── Deployment & Go-Live (staging → testing → deploy → live) ──
  function connChip(key, label) {
    const c = DEP.CONN[key] || DEP.CONN.RED;
    const txt = (c.color === '#0a0a0a' || c.color === '#ff5470') ? '#fff' : '#04141d';
    return `<span class="pill" style="background:${c.color};color:${txt};font-weight:700">${esc(label || c.label)}</span>`;
  }
  function sampleAuthToken() {
    // mint a valid sample authorization inline (demo convenience; same signing the
    // issuer tool uses). In production an operator pastes the authority's token.
    const a = { product: 'HydroManifold', schemaVersion: 1, authorizationId: 'ST-DDW-2026-04417', authorizationType: 'state-primacy', authority: { id: 'state-primacy', name: 'State Division of Drinking Water', type: 'primacy' }, pws: { pwsid: 'UT18025', name: 'Weber Basin — NE Pressure Zone', classification: 'CWS', source: 'GW', populationServed: 42000, connections: 12750 }, orc: { name: 'J. Rivera', certNumber: 'UT-DIST-IV-10293', grade: 'Distribution IV', state: 'UT' }, scope: { realtime: true, control: false }, grants: { sensorTiers: ['must'] }, issued: '2026-01-15', notBefore: '2026-02-01', expires: '2029-01-31' };
    a.sig = LIC.sign(a); return LIC.encodeToken(a);
  }
  function renderGoLive() {
    const b = goliveBundle();
    const tr = LIC.commissioningTests(b, {});
    const gate = LIC.deployGate(tr, op.accepted);
    const briefing = LIC.riskBriefing(tr);
    const authV = op.authorization ? LIC.verifyAuthorization(op.authorization, {}) : null;
    const sysKey = op.shutdown ? 'BLACK' : (op.deployed ? DEP.systemState(op.nodes.map((n) => op.conn[n.id] || 'RED')) : (op.nodes.length ? 'AMBER' : 'RED'));
    const modeLabel = op.shutdown ? 'EMERGENCY SHUTDOWN' : op.deployed ? (op.provisional ? 'LIVE — PROVISIONAL (authority GO on record)' : 'LIVE — AUTHORIZED real-time operation') : 'SIMULATION — staging / testing (real-time operation locked)';
    const bannerColor = (DEP.CONN[sysKey] || DEP.CONN.RED).color;
    const canRole = canDeployRole();
    const isAuth = isAuthorizingAuthority();
    const recGo = gate.recommendation === 'GO';

    // tests sorted: failures first, hard before soft
    const tests = tr.tests.slice().sort((x, y) => (x.pass - y.pass) || (y.hard - x.hard));
    const acceptedSet = {}; gate.accepted.forEach((t) => acceptedSet[t.id] = 1);
    const srcBadge = (s) => `<span class="pill ${s === 'regulation' ? 'crit' : ''}" style="${s === 'manufacturer' ? 'background:#3a4a66;color:#cfe' : ''}">${s === 'regulation' ? 'regulation' : 'manufacturer'}</span>`;
    const testRow = (t) => {
      const accepted = !t.pass && acceptedSet[t.id];
      const status = t.pass ? '<span class="good">✓ pass</span>' : accepted ? '<span class="warnc">⚠ accepted (waiver)</span>' : '<span class="badc">✗ fail</span>';
      const risk = t.pass ? '' : (t.hard ? '<span class="pill crit">HIGH</span>' : '<span class="pill warn">MODERATE</span>');
      return `<tr><td>${t.hard ? '⚖️ ' : ''}${esc(t.name)}</td><td>${srcBadge(t.source)}</td><td>${risk}</td><td>${status}</td><td class="muted">${esc(t.detail)}</td></tr>`;
    };

    // firefighting-divertable sources (pre-identified) + whether acting user is pre-authorized
    const ffSources = reg.list('water_supplies').filter((s) => s.fireUse && s.fireUse !== 'no');
    const ffCerts = reg.list('emergency_auth').filter((r) => r.capability === 'firefighting-diversion' && String(r.status).toLowerCase() === 'active');
    const myShutdown = reg.list('emergency_auth').some((r) => r.capability === 'emergency-shutdown' && r.userId === user && String(r.status).toLowerCase() === 'active' && (r.scope === '*' || r.scope === pwsid()));
    const openFails = gate.fails;

    $('main').innerHTML = `<div class="h1">⚙️ Deployment &amp; Go-Live</div>
      <div class="sub">The platform is always free to be <b>set up, tested and made ready in simulation</b>. It will not operate a <b>real</b> system in <b>real time</b> until deployed. <b>The software does not make the final decision — it monitors, alerts and recommends, with a risk/benefit assessment. The named authorizing authority always decides GO / NO-GO and owns it on the record.</b> <span class="note">Demonstration / simulation only.</span></div>

      <div class="card" style="border-left:6px solid ${bannerColor}">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="font-size:20px;font-weight:800;color:${bannerColor === '#0a0a0a' ? 'var(--txt)' : bannerColor}">${esc(modeLabel)}</div>
          <div>System connection: ${connChip(sysKey)}</div>
          ${op.authorization ? `<div class="note">PWSID <b>${esc(pwsid())}</b> · ${esc((op.authorization.pws || {}).name || '')} · ${esc((op.authorization.pws || {}).classification)} / ${esc((op.authorization.pws || {}).source)}</div>` : ''}
        </div>
        <div class="note" style="margin-top:6px">Color key: ${connChip('GREEN', 'GREEN — connected & good')} ${connChip('AMBER', 'AMBER — establishing')} ${connChip('RED', 'RED — disconnected')} ${connChip('BLACK', 'BLACK — emergency shutdown')}</div>
      </div>

      <div class="card"><b>1 · Operating authorization</b> <span class="note">— who authorized real-time operation (state primacy agency / EPA direct / delegated operations)</span>
        ${authV ? `<table>
            <tr><td class="muted">Status</td><td>${authV.ok ? '<span class="good">✓ valid &amp; current</span>' : '<span class="badc">✗ ' + esc(authV.reasons.join('; ')) + '</span>'}</td></tr>
            <tr><td class="muted">Authority</td><td>${esc(authV.authorityName || '')}<div class="note">${esc(authV.authorityBasis || '')}</div></td></tr>
            <tr><td class="muted">Type</td><td>${esc(op.authorization.authorizationType)}${op.authorization.delegation ? ' · ' + esc(op.authorization.delegation.operatingEntity) + ' (' + esc(op.authorization.delegation.agreementType) + ')' : ''}</td></tr>
            <tr><td class="muted">Operator in Responsible Charge</td><td>${esc((op.authorization.orc || {}).name || '—')} · ${esc((op.authorization.orc || {}).grade || '')} · cert ${esc((op.authorization.orc || {}).certNumber || '')}</td></tr>
            <tr><td class="muted">Valid</td><td class="mono">${esc(op.authorization.notBefore)} → ${esc(op.authorization.expires)}</td></tr>
            <tr><td class="muted">AWIA RRA/ERP</td><td>${authV.requiresAwia ? 'required (CWS &gt; 3,300) — verified in checklist' : 'not triggered by this system size'}</td></tr>
          </table>
          ${canRole ? '<div class="bar" style="margin-top:8px"><button class="btn" id="gl-uninstall">Remove authorization</button></div>' : ''}`
        : `<div class="note" style="margin:6px 0">No operating authorization installed — real-time operation is locked. Paste a signed authorization token (issued by the authority), or use the sample.</div>
          ${canRole ? `<textarea id="gl-token" class="ta" rows="2" style="width:100%" placeholder="HMA1.…  (signed operating-authorization token)"></textarea>
          <div class="bar" style="margin-top:8px"><button class="btn primary" id="gl-install">Verify &amp; install</button><button class="btn" id="gl-sample">Use sample authorization</button></div>
          <div id="gl-instmsg"></div>` : '<div class="note">Installing an authorization requires change authority (Administrator / Compliance).</div>'}`}
      </div>

      <div class="card"><b>2 · Staging &amp; testing</b> <span class="note">— tests derived directly from ingested manufacturer specs &amp; regulations (no onsite reinterpretation)</span>
        <div class="bar" style="margin-top:6px">
          <span class="pill ${tr.summary.failed === 0 ? 'ok' : 'crit'}">${tr.summary.passed}/${tr.summary.total} pass</span>
          <span class="pill ${tr.summary.hardFails ? 'crit' : 'ok'}">${tr.summary.hardFails} legal/public-health open</span>
          <span class="pill ${tr.summary.softFails ? 'warn' : 'ok'}">${tr.summary.softFails} operational open</span>
          <span class="pill ${gate.accepted.length ? 'warn' : ''}">${gate.accepted.length} risk(s) accepted</span>
        </div>
        <table style="margin-top:8px"><thead><tr><th>Test</th><th>Source</th><th>Risk if open</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>${tests.map(testRow).join('')}</tbody></table>
        <div class="note" style="margin-top:6px">⚖️ = legal / public-health item. The software flags risk; it does not block — the authorizing authority decides whether to accept any open risk (below).</div>
      </div>

      <div class="card" style="border-left:6px solid ${recGo ? '#27e07a' : '#ffb020'}"><b>3 · Recommendation, risk &amp; the authority's decision</b>
        <div style="margin-top:6px;font-size:16px;font-weight:800;color:${recGo ? '#27e07a' : '#ffb020'}">SOFTWARE RECOMMENDATION: ${recGo ? 'GO' : 'NO-GO'}</div>
        <div class="note">${esc(briefing.benefitOfGo)}</div>
        ${openFails.length ? `<table style="margin-top:8px"><thead><tr><th>Open risk</th><th>Level</th><th>Consequence if accepted</th><th>Status</th></tr></thead><tbody>
          ${briefing.risks.map((rk) => `<tr><td>${esc(rk.name)}</td><td>${rk.level.indexOf('HIGH') === 0 ? '<span class="pill crit">' + esc(rk.level) + '</span>' : '<span class="pill warn">' + esc(rk.level) + '</span>'}</td><td class="muted">${esc(rk.consequence)}</td><td>${acceptedSet[rk.testId] ? '<span class="warnc">accepted</span>' : '<span class="badc">open</span>'}</td></tr>`).join('')}
        </tbody></table>` : '<div class="note good" style="margin-top:6px">No open risks — clean go.</div>'}
        ${op.decision ? `<div class="card" style="margin-top:8px"><b>Authority decision on record:</b> <span class="pill ${op.decision.decision === 'GO' ? 'warn' : 'crit'}">${esc(op.decision.decision)}</span> by <b>${esc(op.decision.authorityName)}</b> · ${esc(op.decision.at)}${op.decision.legalWaiver ? '<div class="note">Purpose: ' + esc(op.decision.purpose) + ' · Justification: ' + esc(op.decision.justification) + ' · Legal waiver: ' + esc(op.decision.legalWaiver) + '</div>' : ''}</div>` : ''}
        ${(!recGo && !gate.canDeploy) ? (isAuth ? `<div class="card" style="margin-top:8px"><b>Authorizing-authority decision</b> <span class="note">— you are: ${esc(authorityDisplayName())}. Every exception requires a documented purpose, justification AND a signed legal waiver.</span>
          <div class="form" style="margin-top:6px">
            <div><label>Purpose <span class="req">*</span></label><input id="gl-purpose" placeholder="why proceed now"></div>
            <div><label>Justification <span class="req">*</span></label><input id="gl-just" placeholder="compensating controls / manual verification / remediation plan"></div>
            <div><label>Legal waiver reference <span class="req">*</span></label><input id="gl-waiver" placeholder="WAIVER-… (counsel-approved)"></div>
          </div>
          <div class="bar" style="margin-top:8px"><button class="btn danger" id="gl-go">✓ Record GO — accept ${openFails.length} open risk(s)</button><button class="btn" id="gl-nogo">Record NO-GO</button></div></div>`
          : '<div class="note" style="margin-top:8px">Recommendation is NO-GO. Only the <b>named authorizing authority</b> (the Operator in Responsible Charge on the authorization, or an Administrator) may accept the open risk and decide GO. You are not an authorizing authority.</div>') : ''}
      </div>

      <div class="card"><b>4 · Deploy &amp; connect</b>
        <div class="bar" style="margin-top:6px">
          <button class="btn primary" id="gl-deploy" ${(gate.canDeploy && canRole && !op.shutdown) ? '' : 'disabled'}>${op.deployed ? '↻ Re-deploy' : '🚀 Deploy &amp; begin monitoring'}</button>
          ${gate.canDeploy ? '<span class="note">' + (recGo ? 'Recommendation GO' : 'NO-GO accepted by ' + esc((op.decision || {}).authorityName || 'authority') + ' (PROVISIONAL)') + ' — deploy enabled.</span>' : '<span class="note">Deploy enables on a GO recommendation, or when the authorizing authority accepts the open risk(s) with a signed waiver.</span>'}
        </div>
        ${op.nodes.length ? `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">${op.nodes.map((n) => connChip(op.conn[n.id] || 'RED', (op.conn[n.id] === 'GREEN' ? '● ' : op.conn[n.id] === 'AMBER' ? '◐ ' : op.conn[n.id] === 'BLACK' ? '■ ' : '○ ') + n.label)).join('')}</div>
          <div class="note" style="margin-top:6px">${op.nodes.filter((n) => op.conn[n.id] === 'GREEN').length}/${op.nodes.length} nodes connected${op.nodes.filter((n) => op.conn[n.id] === 'RED').length ? ' · ' + op.nodes.filter((n) => op.conn[n.id] === 'RED').length + ' could not hand-shake (check CMS readiness)' : ''}</div>` : '<div class="note" style="margin-top:6px">No active deployment — nothing is connected to a real system.</div>'}
      </div>

      <div class="card" style="border-left:6px solid ${DEP.CONN.BLACK.color}"><b>5 · Emergency shutdown</b> <span class="note">— instant, pre-authorized; no approval delay</span>
        <div class="note" style="margin:6px 0">Emergency shutdown halts monitoring (state BLACK) and can be executed only by a holder of a <b>pre-signed emergency-shutdown certificate</b> scoped to this system. You (${esc(user)} / ${esc(RB.ROLES[role].label)}) ${myShutdown ? '<span class="good">hold</span>' : '<span class="badc">do not hold</span>'} such a certificate.</div>
        <div class="bar">
          ${op.shutdown ? `<button class="btn" id="gl-reestablish">↻ Lift shutdown &amp; re-establish</button>` : `<button class="btn danger" id="gl-shutdown" ${op.deployed ? '' : 'disabled'}>🛑 EMERGENCY SHUTDOWN</button>`}
          <span class="note">Pre-authorize holders in <b>Emergency Authorizations</b>.</span>
        </div>
      </div>

      <div class="card"><b>6 · Firefighting diversion (pre-authorized)</b> <span class="note">— sources identified as firefighting resources, divertable immediately by a designated holder</span>
        <table style="margin-top:6px"><thead><tr><th>Source</th><th>Divertable</th><th>Pre-authorized holders</th><th></th></tr></thead><tbody>
          ${ffSources.map((s) => {
            const holders = ffCerts.filter((c) => c.scope === '*' || c.scope === s.name);
            const mine = holders.some((c) => c.userId === user);
            return `<tr><td>${esc(s.name)}</td><td><span class="pill ${s.fireUse === 'yes' ? 'ok' : 'warn'}">${esc(s.fireUse)}</span></td><td class="muted">${holders.map((h) => esc(h.userId + (h.scope === '*' ? '*' : ''))).join(', ') || '—'}</td><td>${mine ? `<button class="btn" data-ff="${esc(s.name)}">Divert now</button>` : '<span class="note">not pre-authorized to you</span>'}</td></tr>`;
          }).join('') || '<tr><td colspan="4" class="muted">No firefighting-divertable sources defined.</td></tr>'}
        </tbody></table>
      </div>

      <div class="card"><b>7 · Supply availability &amp; mandatory notifications</b> <span class="note">— reporting is NOT optional</span>
        <div class="note" style="margin:6px 0">Any supply shut down, drained, taken offline, or reduced (planned or unplanned) triggers a <b>mandatory</b> notice to fire authorities, the regulator and affected farms (${reg.list('notify_external').filter((r) => String(r.mandatory).toLowerCase() === 'yes').length} mandatory recipients) — logged immutably so no one can say they were not told, and so municipalities can act on their own contingency plans. Manage recipients in <a class="lnk" data-go="notify_external">Mandatory Notifications</a>.</div>
        <table><thead><tr><th>Supply</th><th>Class</th><th>Availability</th><th>Fire-divertable</th><th>Action (notifies)</th></tr></thead><tbody>
          ${reg.list('water_supplies').map((s) => {
            const inService = s.status === 'in-service';
            const cls = s.status === 'in-service' ? 'ok' : (s.status === 'quarantined' ? 'crit' : 'warn');
            const acts = inService
              ? `<button class="btn" data-sup="${esc(s._id)}" data-act="offline|taken offline">Take offline</button> <button class="btn" data-sup="${esc(s._id)}" data-act="offline|drained">Drained</button> <button class="btn" data-sup="${esc(s._id)}" data-act="standby|planned reduction">Planned reduction</button>`
              : `<button class="btn" data-sup="${esc(s._id)}" data-act="in-service|restored">Return to service</button>`;
            return `<tr><td>${esc(s.name)}</td><td class="muted">${esc(s.classification)}</td><td><span class="pill ${cls}">${esc(s.status)}</span></td><td>${esc(s.fireUse)}</td><td>${RB.can(role, 'edit', 'water_supplies') ? acts : '<span class="note">needs edit role</span>'}</td></tr>`;
          }).join('')}
        </tbody></table>
        ${op.notices.length ? `<div style="margin-top:8px"><b>Recent mandatory notices</b> <span class="note">— ${op.notices[0].simulated ? 'SIMULATED transport (email / SMS / webhook / IPAWS rendered &amp; logged, not sent)' : 'live transport'}</span>
          <table><thead><tr><th>Time</th><th>Event</th><th>Supply</th><th>Dispatched</th><th>Delivery receipts</th></tr></thead><tbody>
          ${op.notices.slice(0, 5).map((n) => { const by = {}; n.deliveries.forEach((d) => { const k = d.channel + ':' + d.status; by[k] = (by[k] || 0) + 1; });
            return `<tr><td class="mono">${esc(n.at)}</td><td>${esc(n.eventType)}</td><td>${esc(n.supply)}</td><td class="mono">${n.count}</td><td class="muted">${esc(Object.keys(by).map((k) => by[k] + '×' + k).join(', '))} · e.g. ${esc((n.deliveries[0] || {}).providerId || '')}→${esc((n.deliveries[0] || {}).to || '')}</td></tr>`;
          }).join('')}
        </tbody></table></div>` : ''}
      </div>

      <div class="card"><b>8 · Public status page <span class="note">(OPTIONAL)</span></b>
        <div class="note" style="margin:6px 0">Optional, read-only, for interested parties — shows <b>non-classified</b> supply availability only. The notifications above are mandatory; this public view is not. Classified/critical-infrastructure detail is withheld.</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${reg.list('water_supplies').filter((s) => s.classification !== 'contaminated' && s.classification !== 'sewer / wastewater').map((s) => {
            const cls = s.status === 'in-service' ? 'ok' : (s.status === 'quarantined' ? 'crit' : 'warn');
            return `<span class="pill ${cls}">${esc(s.name)}: ${esc(s.status)}</span>`;
          }).join('')}
        </div>
      </div>

      <div class="card"><b>Defaults &amp; change authority.</b> The must-have sensors and the mandatory regulatory prerequisites are pre-loaded by default (known beforehand, standard). Anything here is editable, but only with the proper role — edit the <a class="lnk" data-go="components">Component Onboarding</a>, <a class="lnk" data-go="commissioning">Commissioning Checklist</a>, <a class="lnk" data-go="emergency_auth">Emergency Authorizations</a>, <a class="lnk" data-go="notify_external">Mandatory Notifications</a>, or <a class="lnk" data-go="personnel">Personnel/Access</a> collections. Every change is signed, sealed and logged.</div>`;

    // ── bindings ──
    if ($('gl-install')) $('gl-install').addEventListener('click', () => { const r = installAuthorization($('gl-token').value || ''); $('gl-instmsg').innerHTML = r.ok ? '<div class="note good">✓ installed</div>' : '<div class="note badc">' + esc(r.msg) + '</div>'; if (r.ok) renderGoLive(); });
    if ($('gl-sample')) $('gl-sample').addEventListener('click', () => { const r = installAuthorization(sampleAuthToken()); if (r.ok) renderGoLive(); else if ($('gl-instmsg')) $('gl-instmsg').innerHTML = '<div class="note badc">' + esc(r.msg) + '</div>'; });
    if ($('gl-uninstall')) $('gl-uninstall').addEventListener('click', () => { if (confirm('Remove the operating authorization and return to SIMULATION?')) { uninstallAuthorization(); renderGoLive(); } });
    if ($('gl-deploy')) $('gl-deploy').addEventListener('click', deploy);
    if ($('gl-shutdown')) $('gl-shutdown').addEventListener('click', () => { if (confirm('Execute EMERGENCY SHUTDOWN? Monitoring will halt immediately (BLACK).')) emergencyShutdown(); });
    if ($('gl-reestablish')) $('gl-reestablish').addEventListener('click', reestablish);
    if ($('gl-go')) $('gl-go').addEventListener('click', () => {
      const ids = openFails.map((t) => t.id);
      if (recordGoDecision(ids, ($('gl-purpose') || {}).value, ($('gl-just') || {}).value, ($('gl-waiver') || {}).value)) renderGoLive();
    });
    if ($('gl-nogo')) $('gl-nogo').addEventListener('click', () => { if (recordNoGo()) renderGoLive(); });
    $('main').querySelectorAll('[data-ff]').forEach((btn) => btn.addEventListener('click', () => firefightingDivert(btn.getAttribute('data-ff'))));
    $('main').querySelectorAll('[data-sup]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-sup'); const parts = btn.getAttribute('data-act').split('|');
      if (parts[0] !== 'in-service' && !confirm('This will set the supply ' + parts[1] + ' and send the MANDATORY notice to fire authorities, the regulator and affected farms. Continue?')) return;
      setSupplyAvailability(id, parts[0], parts[1]);
    }));
    $('main').querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => render('collection', a.getAttribute('data-go'))));
  }

  // ── pagination (tabular data is paged, not silently truncated) ──
  const PAGE_SIZE = 25; const pageState = {};
  function pageSlice(key, rows) {
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); let pg = pageState[key] || 0; if (pg >= pages) pg = pages - 1; if (pg < 0) pg = 0; pageState[key] = pg;
    return { slice: rows.slice(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE), pg, pages, total: rows.length };
  }
  function pagerHtml(key, info) {
    if (info.total === 0) return '';
    if (info.pages <= 1) return `<div class="note">${info.total} row${info.total === 1 ? '' : 's'}</div>`;
    return `<div class="pager"><button class="btn" data-pg="${key}|prev" ${info.pg <= 0 ? 'disabled' : ''}>‹ Prev</button><span class="note">Page ${info.pg + 1} / ${info.pages} · ${info.total} rows · showing ${info.pg * PAGE_SIZE + 1}–${Math.min(info.total, (info.pg + 1) * PAGE_SIZE)}</span><button class="btn" data-pg="${key}|next" ${info.pg >= info.pages - 1 ? 'disabled' : ''}>Next ›</button></div>`;
  }
  function wirePagers(rerender) {
    $('main').querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { const parts = b.getAttribute('data-pg').split('|'); pageState[parts[0]] = (pageState[parts[0]] || 0) + (parts[1] === 'next' ? 1 : -1); rerender(); }));
  }
  function resetPage(key) { pageState[key] = 0; }

  // global search jumps into a collection
  $('search').addEventListener('input', (e) => { search = e.target.value; if (view === 'collection') renderCollection(activeCol); });
  $('wall').addEventListener('click', () => { document.body.classList.add('wall'); $('wall-exit').style.display = ''; render('dashboard'); setInterval(() => { if (document.body.classList.contains('wall') && view === 'dashboard') renderDashboard(); }, 2500); });
  $('wall-exit').addEventListener('click', () => { document.body.classList.remove('wall'); $('wall-exit').style.display = 'none'; });
  if ($('sound')) $('sound').addEventListener('click', () => {
    const on = sound.toggle();
    $('sound').textContent = on ? '🔔 Alerts audible' : '🔕 Alerts muted';
    if (on) sound.beep('warning');                       // confirmation chirp on enable
    audit.append(user, role, 'sound-toggle', 'platform', 'Audible alerts ' + (on ? 'enabled' : 'muted'));
  });

  // boot
  if (window.HM_THEME) { window.HM_THEME.mount($('theme'), $('accent')); window.HM_THEME.applyBrand(); }   // your theme + your brand
  if ($('poweredby')) $('poweredby').addEventListener('click', () => render('manifold', null));
  refreshIdentity();
  audit.append(user, role, 'login', 'platform', 'Session start · ' + user + ' · ' + RB.ROLES[role].label);
  buildRoles(); buildNav(); render('dashboard');
  // Live views refresh on a timer; Statistics/Logs/Reports are excluded so their
  // charts, inputs and paging don't flash or reset under the user (designated
  // space, no blinking). Statistics keeps accruing trend history in the background.
  setInterval(() => { if (['dashboard', 'compliance', 'failsafe'].includes(view)) render(view, activeCol); }, 2500);
})();
