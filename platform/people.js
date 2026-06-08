/* ============================================================================
 * HydroManifold Platform — Identity, Alert Routing & Optional Sound
 * ----------------------------------------------------------------------------
 * • IDENTITY: every actor is logged by a NON-PII user-id (e.g. "U-7F3A"), never
 *   by name/email. The id is resolved from the personnel roster for the acting
 *   role; if none exists, a stable non-PII id is derived from the role alone.
 * • ALERT ROUTING: given an attention event (severity), compute exactly who must
 *   be emailed/texted from the roster — honoring each person's channel and their
 *   minimum-severity threshold and on-call/active status. (This is a SIMULATION:
 *   it returns the dispatch list and logs it; it does not send real email/SMS.)
 * • SOUND: an OPTIONAL, OFF-BY-DEFAULT audible indicator for alarms/attention.
 *   Browsers block audio until a user gesture, so it only arms after the user
 *   toggles it on.
 * ========================================================================== */
(function (root) {
  'use strict';

  const SEV_RANK = { warning: 1, alarm: 2, critical: 3 };

  // Resolve the acting user's non-PII id from the roster (by role), else derive one.
  function actingUserId(personnel, role) {
    const row = (personnel || []).find((p) => p.role === role && String(p.access).toLowerCase() === 'enabled');
    if (row && row.userId) return row.userId;
    // deterministic non-PII fallback id from the role string (no PII involved)
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < String(role).length; i++) { h ^= role.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    return 'U-' + (h >>> 0).toString(16).slice(0, 4).toUpperCase();
  }

  // Who must be alerted for an event of this severity, and on which channel.
  function alertRoster(personnel, severity) {
    const rank = SEV_RANK[severity] || 0;
    return (personnel || []).filter((p) => {
      if (String(p.status).toLowerCase() !== 'active') return false;
      if (!p.alertChannel || p.alertChannel === 'none') return false;
      const min = SEV_RANK[p.alertMin] || 99;             // 'none'/unknown → never
      return rank >= min;
    }).map((p) => ({
      userId: p.userId, role: p.role, channel: p.alertChannel,
      email: /@/.test(p.email || '') || /^mailto:/.test(p.email || ''),
      sms: !!p.mobile, onCall: String(p.onCall).toLowerCase() === 'yes'
    }));
  }
  // A redactable, PII-free summary of a dispatch (safe for the audit log).
  function dispatchSummary(roster, severity) {
    const email = roster.filter((r) => /email/.test(r.channel)).length;
    const sms = roster.filter((r) => /SMS/.test(r.channel)).length;
    return severity + ' alert → ' + roster.length + ' recipient(s): ' + email + ' email, ' + sms + ' SMS · ' +
      roster.map((r) => r.userId).join(', ');
  }

  // ── optional, off-by-default audible indicator (WebAudio; no assets) ──
  function Sound() { this.enabled = false; this.ctx = null; }
  Sound.prototype.toggle = function () { this.enabled = !this.enabled; if (this.enabled) this._arm(); return this.enabled; };
  Sound.prototype._arm = function () {
    try { if (!this.ctx) this.ctx = new (root.AudioContext || root.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); } catch (_) { this.ctx = null; }
  };
  // sev → tone; 'emergency' is a distinct low/urgent triad.
  Sound.prototype.beep = function (sev) {
    if (!this.enabled || !this.ctx) return;
    const tones = { warning: [660], alarm: [880, 660], critical: [988, 740, 988], emergency: [220, 180, 140] };
    const seq = tones[sev] || tones.alarm; const t0 = this.ctx.currentTime;
    seq.forEach((f, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = sev === 'emergency' ? 'sawtooth' : 'sine'; o.frequency.value = f;
      const start = t0 + i * 0.18; g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      o.connect(g); g.connect(this.ctx.destination); o.start(start); o.stop(start + 0.18);
    });
  };

  root.HMP_PEOPLE = { SEV_RANK, actingUserId, alertRoster, dispatchSummary, Sound };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_PEOPLE;
}(typeof window !== 'undefined' ? window : globalThis));
