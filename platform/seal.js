/* ============================================================================
 * HydroManifold Platform — Manifold Seal (signed, authenticated, encrypted)
 * ----------------------------------------------------------------------------
 * Every parameter ingested into the CMS is:
 *   • SIGNED      — a keyed digest binds the record's content to the author and
 *                   role that entered it (authentication) and to the current
 *                   manifold shape (chaining).
 *   • SHAPE-FOLDED — the global "manifold shape" is folded forward with each
 *                   parameter. Because the shape is a keyed function of the
 *                   ENTIRE ordered parameter history, changing any one parameter
 *                   diverges the shape and every signature after it. Without the
 *                   key and the full history the shape cannot be predicted or
 *                   forged — that is the "impossible to predict" property.
 *   • ENCRYPTED    — the persisted store is ciphertext at rest.
 *
 * HONEST NOTE: the digest/cipher here are dependency-free and demonstrate the
 * design end-to-end. A production deployment swaps khash → HMAC-SHA-256 (or
 * Ed25519 signatures) and the cipher → AES-256-GCM, both via WebCrypto with keys
 * held in an HSM/KMS. The architecture — sign, shape-fold, encrypt — is identical.
 * ========================================================================== */
(function (root) {
  'use strict';

  // keyed digest (demo): FNV-1a over key+payload, two passes. → 8 hex chars.
  function khash(key, str) {
    const s = key + '' + str;
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    // second pass over the key to diffuse
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // canonical content string of a record (meaningful fields only, stable order)
  function canon(record, schema) {
    if (schema) return schema.map((f) => f.key + '=' + (record[f.key] == null ? '' : record[f.key])).join('|');
    return Object.keys(record).filter((k) => k[0] !== '_').sort().map((k) => k + '=' + record[k]).join('|');
  }

  function ManifoldSeal(opts) {
    opts = opts || {};
    this.key = opts.key || 'hm-deployment-key';
    this.shape = opts.shape || '0a1f2e3d';     // genesis shape
  }
  // signature binds content + author + role + the shape it was sealed against
  ManifoldSeal.prototype.sign = function (record, author, role, schema, atShape) {
    return khash(this.key, canon(record, schema) + '§' + author + '§' + role + '§' + (atShape != null ? atShape : this.shape));
  };
  // ingest: sign against current shape, then FOLD the shape forward (manifold
  // changes its shape and nature with every parameter).
  ManifoldSeal.prototype.ingest = function (record, author, role, schema) {
    const prevShape = this.shape;
    const signature = this.sign(record, author, role, schema, prevShape);
    this.shape = khash(this.key, prevShape + '·' + signature);   // z=x·y-style fold of history
    return { signature: signature, prevShape: prevShape, shape: this.shape };
  };
  // verify a sealed record against the shape it was sealed at
  ManifoldSeal.prototype.verify = function (record, schema) {
    if (!record._sig || record._prevShape == null) return false;
    return this.sign(record, record._by, record._role, schema, record._prevShape) === record._sig;
  };

  // ── encrypted-at-rest store wrapper (demo cipher; prod = AES-256-GCM) ──
  function keyByte(key, i) { const h = khash(key, 'ks' + Math.floor(i / 4)); return parseInt(h.substr((i % 4) * 2, 2), 16); }
  function encrypt(str, key) {
    const enc = new TextEncoder().encode(str); let out = '';
    for (let i = 0; i < enc.length; i++) out += (enc[i] ^ keyByte(key, i)).toString(16).padStart(2, '0');
    return 'enc:' + out;
  }
  function decrypt(blob, key) {
    if (typeof blob !== 'string' || blob.indexOf('enc:') !== 0) return blob;   // tolerate plaintext
    const hex = blob.slice(4); const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16) ^ keyByte(key, i);
    return new TextDecoder().decode(bytes);
  }
  function encryptedStore(base, key) {
    return {
      get: function (k) { const v = base.get(k); return v == null ? null : decrypt(v, key); },
      set: function (k, v) { base.set(k, encrypt(v, key)); }
    };
  }

  root.HMP_SEAL = { ManifoldSeal, khash, canon, encryptedStore, encrypt, decrypt };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.HMP_SEAL;
}(typeof window !== 'undefined' ? window : globalThis));
