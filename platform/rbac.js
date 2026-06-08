/* ============================================================================
 * HydroManifold Platform — RBAC (roles, least privilege, zero trust)
 * ----------------------------------------------------------------------------
 * Default DENY. Every role lists only the grants it needs. Grants are patterns:
 *   '*'                everything (administrator)
 *   'view:*'           view any collection
 *   'edit:regulations' edit one collection
 *   'audit.view'       a named capability
 *   'security.classified'  may see records marked classified (zero-trust gate)
 * ========================================================================== */
(function (root) {
  'use strict';

  const ROLES = {
    administrator:      { label: 'System Administrator', desc: 'Full control. Use sparingly.', grants: ['*'] },
    compliance_officer: { label: 'Compliance Officer',   desc: 'Owns regulations, policy & legal; read-all.', grants: ['view:*', 'edit:regulations', 'edit:reports', 'edit:policies', 'edit:litigation', 'edit:ip', 'edit:contracts', 'edit:environmental', 'audit.view', 'reports.generate'] },
    operator:           { label: 'Operator (SCADA)',     desc: 'Runs the system; handles incidents & work orders.', grants: ['view:monitoring', 'view:incidents', 'edit:incidents', 'view:equipment', 'view:maintenance', 'edit:maintenance', 'view:conservation', 'edit:conservation', 'view:emergency'] },
    engineer:           { label: 'Engineer',             desc: 'Assets, schematics, software, procurement.', grants: ['view:*', 'edit:equipment', 'edit:incidents', 'view:procurement', 'edit:procurement', 'edit:maintenance', 'edit:software', 'edit:techdebt', 'edit:hardware', 'edit:documents', 'edit:contractors'] },
    finance:            { label: 'Finance / Billing',    desc: 'Accounts, taxes, financials, contracts, vendors.', grants: ['view:accounts', 'edit:accounts', 'view:procurement', 'edit:procurement', 'view:vendors', 'edit:vendors', 'view:taxes', 'edit:taxes', 'view:financials', 'edit:financials', 'view:contracts', 'edit:contracts', 'view:contractors', 'edit:contractors', 'view:insurance', 'edit:insurance', 'view:litigation', 'view:reports', 'reports.generate'] },
    executive:          { label: 'Executive',            desc: 'Read-all + reporting; no operational edits.', grants: ['view:*', 'reports.generate'] },
    auditor:            { label: 'Internal Auditor',     desc: 'Read-all incl. audit trail. No edits.', grants: ['view:*', 'audit.view'] },
    regulator:          { label: 'External Regulator',   desc: 'Read regulations, reports, audit only.', grants: ['view:regulations', 'view:reports', 'view:datagov', 'audit.view'] },
    security_officer:   { label: 'Security Officer',      desc: 'Threats, classification, IP/document control.', grants: ['view:*', 'edit:incidents', 'edit:security', 'edit:ip', 'edit:documents', 'security.classified'] }
  };

  function matches(grant, cap) {
    if (grant === '*') return true;
    if (grant === cap) return true;
    const gi = grant.indexOf(':'), ci = cap.indexOf(':');
    if (gi > 0 && ci > 0 && grant.slice(0, gi) === cap.slice(0, ci) && grant.slice(gi + 1) === '*') return true;
    return false;
  }
  function has(roleId, cap) {
    const r = ROLES[roleId]; if (!r) return false;
    return r.grants.some((g) => matches(g, cap));
  }
  // can(role, 'view'|'edit', collectionId)
  function can(roleId, action, colId) { return has(roleId, action + ':' + colId); }
  function capable(roleId, cap) { return has(roleId, cap); }

  root.HMP_RBAC = { ROLES, can, capable, has };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_RBAC;
}(typeof window !== 'undefined' ? window : globalThis));
