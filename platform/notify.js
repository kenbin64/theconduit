/* ============================================================================
 * HydroManifold Platform — Notification Dispatch (email / SMS / webhook / …)
 * ----------------------------------------------------------------------------
 * GO-READY even as a simulation. Mandatory supply-event notices are rendered as
 * REAL messages (proper email envelope, ≤160-char SMS, JSON webhook payload, CAP
 * alert) and dispatched through a TRANSPORT. The default transport is SIMULATED:
 * it produces a structured, logged delivery receipt and sends nothing. Adoption
 * is a one-line swap — no call site changes:
 *
 *     HM_NOTIFY.configure({ transport: new HM_NOTIFY.HttpRelayTransport({ endpoint: '/api/notify' }) });
 *
 * A production transport (SMTP relay, Twilio SMS, webhook POST, FEMA IPAWS/CAP)
 * implements the same `send(message) -> deliveryRecord` contract. Messages carry
 * an idempotency key so retries never double-send, and every delivery receipt is
 * suitable for the immutable audit log / FOIA export.
 * ========================================================================== */
(function (root) {
  'use strict';

  function fnv(str) { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; } return (h >>> 0).toString(16).padStart(8, '0'); }

  // schema channel label → canonical channel
  function channelOf(label) {
    const s = String(label || '').toLowerCase();
    if (/sms/.test(s)) return 'sms';
    if (/phone/.test(s)) return 'phone';
    if (/webhook|api/.test(s)) return 'webhook';
    if (/eas|ipaws/.test(s)) return 'eas';
    return 'email';
  }

  // Render the message body once; each channel formats from the same facts.
  function render(ev, recipient, channel) {
    const sev = (ev.severity || 'critical').toUpperCase();
    const subject = '[' + sev + '] Water supply ' + ev.eventType + ' — ' + ev.supply + (ev.pwsid ? ' (PWSID ' + ev.pwsid + ')' : '');
    const lines = [
      'NOTICE OF WATER SUPPLY STATUS CHANGE',
      'Event: ' + ev.eventType,
      'Supply: ' + ev.supply,
      ev.pwsid ? 'PWSID: ' + ev.pwsid : '',
      ev.status ? 'Status: ' + ev.status : '',
      'Time: ' + ev.at,
      ev.detail ? 'Detail: ' + ev.detail : '',
      'To: ' + recipient.party + ' (' + recipient.type + ')',
      recipient.basis ? 'Basis: ' + recipient.basis : '',
      'ACTION: assess fire-flow / contingency impact for your area and activate plans as needed.',
      '— ' + (ev.from || 'HydroManifold Operations Center')
    ].filter(Boolean);
    if (channel === 'sms') {
      const sms = (sev + ': ' + ev.supply + ' ' + ev.eventType + (ev.pwsid ? ' PWSID ' + ev.pwsid : '') + '. Assess fire-flow/contingency. ' + (ev.from || 'HydroManifold')).slice(0, 160);
      return { subject: subject, body: sms };
    }
    if (channel === 'webhook') {
      return { subject: subject, body: JSON.stringify({ type: 'supply-event', severity: ev.severity || 'critical', event: ev.eventType, supply: ev.supply, pwsid: ev.pwsid || null, status: ev.status || null, detail: ev.detail || null, at: ev.at, recipient: { party: recipient.party, type: recipient.type }, basis: recipient.basis || null }) };
    }
    if (channel === 'eas') {
      // CAP-shaped alert (FEMA IPAWS / Emergency Alert System)
      return { subject: subject, body: JSON.stringify({ cap: { status: 'Actual', msgType: 'Alert', scope: 'Public', category: 'Infra', urgency: 'Immediate', severity: 'Severe', event: 'Water supply ' + ev.eventType, area: recipient.area || 'service area', headline: subject } }) };
    }
    return { subject: subject, body: lines.join('\n') };       // email / phone (TTS reads body)
  }

  function idempotencyKey(ev, recipient, channel) {
    return 'msg-' + fnv([ev.eventType, ev.supply, ev.pwsid, ev.at, recipient.party, channel].join('|'));
  }

  // ── default transport: SIMULATED (renders + logs, sends nothing) ──
  function SimulatedTransport() {}
  SimulatedTransport.prototype.simulated = true;
  SimulatedTransport.prototype.send = function (msg) {
    return {
      messageId: msg.idempotencyKey, to: msg.to, channel: msg.channel, party: msg.party,
      status: 'delivered', simulated: true, providerId: 'SIM-' + msg.channel.toUpperCase() + '-' + msg.idempotencyKey.slice(-6),
      at: msg.at, subject: msg.subject
    };
  };

  // ── production transport skeleton (drop-in; not wired in the demo) ──
  // Posts each message to a backend relay that owns provider credentials (SMTP,
  // Twilio, webhook fan-out, IPAWS). Implemented with fetch so a real deployment
  // works in-browser against its own API; throws until an endpoint is configured.
  function HttpRelayTransport(opts) { this.endpoint = (opts || {}).endpoint; this.fetch = (opts || {}).fetch || root.fetch; this.simulated = false; }
  HttpRelayTransport.prototype.send = function (msg) {
    if (!this.endpoint || !this.fetch) throw new Error('notification relay not configured (set { endpoint })');
    // Fire-and-forget POST; the relay returns a provider receipt. The caller logs
    // the returned record. (Synchronous shape kept for parity; a real build can
    // make notify() async and await per-channel receipts + retries.)
    this.fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
    return { messageId: msg.idempotencyKey, to: msg.to, channel: msg.channel, party: msg.party, status: 'queued', simulated: false, providerId: 'RELAY-' + msg.idempotencyKey.slice(-6), at: msg.at, subject: msg.subject };
  };

  let TRANSPORT = new SimulatedTransport();
  function configure(o) { if (o && o.transport) TRANSPORT = o.transport; }
  function transport() { return TRANSPORT; }

  // Dispatch one event to many recipients; returns the deliveries manifest.
  function notify(ev, recipients) {
    const deliveries = (recipients || []).map(function (r) {
      const channel = channelOf(r.channel);
      const tpl = render(ev, r, channel);
      const msg = {
        to: r.contact || r.party, channel: channel, party: r.party, type: r.type, basis: r.basis,
        subject: tpl.subject, body: tpl.body, severity: ev.severity || 'critical',
        idempotencyKey: idempotencyKey(ev, r, channel), at: ev.at
      };
      try { return TRANSPORT.send(msg); }
      catch (e) { return { messageId: msg.idempotencyKey, to: msg.to, channel: channel, party: r.party, status: 'failed', error: String((e && e.message) || e), simulated: !!TRANSPORT.simulated, at: ev.at }; }
    });
    const by = {};
    deliveries.forEach(function (d) { const k = d.channel + ':' + d.status; by[k] = (by[k] || 0) + 1; });
    return { event: ev, deliveries: deliveries, byChannelStatus: by, simulated: !!TRANSPORT.simulated };
  }

  root.HM_NOTIFY = { SimulatedTransport, HttpRelayTransport, configure, transport, notify, render, channelOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HM_NOTIFY;
}(typeof window !== 'undefined' ? window : globalThis));
