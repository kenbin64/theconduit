/* ============================================================================
 * HydroManifold — Deployment & Connection State (staging → deploy → live)
 * ----------------------------------------------------------------------------
 * The CMS has two areas:
 *   • STAGING    — assemble, edit and validate everything (sensors, feeds,
 *                  prerequisites, authorization). Nothing is live. Always allowed.
 *   • DEPLOYMENT — once go-live is AUTHORIZED, DEPLOY ingests everything in the
 *                  CMS, searches for the applicable sensors/feeds, HANDSHAKES,
 *                  connects, and begins active monitoring.
 *
 * Connection state is color-coded exactly as specified:
 *   GREEN  — connection established and good
 *   AMBER  — establishing connection (handshake in progress)
 *   RED    — disconnected
 *   BLACK  — EMERGENCY SHUTDOWN (halts monitoring; requires a pre-signed certificate)
 *
 * This is a SIMULATION (like the rest of HydroManifold): the "handshake" resolves
 * against the CMS readiness of each node rather than a real SCADA link. The state
 * machine, gating and certificate checks are real and identical to production.
 * ========================================================================== */
(function (root) {
  'use strict';

  const CONN = {
    GREEN: { key: 'GREEN', color: '#27e07a', label: 'Connected', meaning: 'connection established and good' },
    AMBER: { key: 'AMBER', color: '#ffb020', label: 'Establishing', meaning: 'handshake in progress' },
    RED:   { key: 'RED',   color: '#ff5470', label: 'Disconnected', meaning: 'no connection' },
    BLACK: { key: 'BLACK', color: '#0a0a0a', label: 'EMERGENCY SHUTDOWN', meaning: 'monitoring halted by authorized emergency shutdown' }
  };

  /* ── Build the deployment node list from CMS content. A node is something the
   *    platform must connect to: an approved sensor (component) or a data feed.
   *    Each node carries why it is or isn't ready to hand-shake. ─────────────── */
  function planDeployment(input) {
    input = input || {};
    const nodes = [];
    (input.components || []).forEach((c) => {
      if (String(c.approvedForUse).toLowerCase() !== 'yes') return;     // only approved-for-use sensors deploy
      const reasons = [];
      const s = String(c.source || '').toLowerCase();
      if (!(/api|file|doc/.test(s) || c.manualLink)) reasons.push('no provenance');
      nodes.push({
        id: 'sensor:' + (c.sensorClass || c.name), kind: 'sensor',
        label: c.name + (c.model ? ' (' + c.model + ')' : ''), sensorClass: c.sensorClass || null,
        ready: reasons.length === 0, reason: reasons.join('; '), state: CONN.RED.key
      });
    });
    (input.feeds || []).forEach((f) => {
      const connected = String(f.status).toLowerCase() === 'connected';
      nodes.push({
        id: 'feed:' + f.name, kind: 'feed', label: f.name + (f.provider ? ' — ' + f.provider : ''),
        ready: connected, reason: connected ? '' : 'feed status: ' + (f.status || 'unknown'), state: CONN.RED.key
      });
    });
    return nodes;
  }

  // The handshake (simulated): a node connects GREEN when it is CMS-ready, else RED.
  function handshake(node) {
    return node && node.ready ? CONN.GREEN.key : CONN.RED.key;
  }

  /* ── Roll the per-node states up to one system connection state. Emergency
   *    shutdown (BLACK) dominates everything; otherwise the worst live state. ── */
  function systemState(states, opts) {
    if (opts && opts.shutdown) return CONN.BLACK.key;
    if (!states || !states.length) return CONN.RED.key;
    if (states.indexOf(CONN.BLACK.key) >= 0) return CONN.BLACK.key;
    if (states.indexOf(CONN.AMBER.key) >= 0) return CONN.AMBER.key;
    if (states.every((s) => s === CONN.GREEN.key)) return CONN.GREEN.key;
    if (states.indexOf(CONN.RED.key) >= 0 && states.indexOf(CONN.GREEN.key) >= 0) return CONN.AMBER.key; // partial → still establishing
    return CONN.RED.key;
  }

  root.HM_DEPLOY = { CONN, planDeployment, handshake, systemState };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_DEPLOY;
}(typeof window !== 'undefined' ? window : globalThis));
