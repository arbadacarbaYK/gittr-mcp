'use strict';

const { nip19 } = require('nostr-tools');

/**
 * Normalize any supported privkey form to 64-char lowercase hex.
 * @param {string|Uint8Array} privkey — hex, nsec1…, or raw bytes
 */
function normalizePrivkeyToHex(privkey) {
  if (!privkey) throw new Error('Private key is required');
  if (privkey instanceof Uint8Array) {
    return Buffer.from(privkey).toString('hex');
  }
  if (typeof privkey !== 'string') {
    throw new Error('Private key must be a string or Uint8Array');
  }
  const s = privkey.trim();
  if (s.startsWith('nsec')) {
    const decoded = nip19.decode(s);
    if (decoded.type !== 'nsec') throw new Error('Invalid nsec');
    if (typeof decoded.data === 'string') return decoded.data.toLowerCase();
    return Buffer.from(decoded.data).toString('hex');
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  throw new Error('Private key must be 64-char hex or nsec1…');
}

/** @param {string|Uint8Array} privkey */
function privkeyToUint8Array(privkey) {
  const hex = normalizePrivkeyToHex(privkey);
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

/**
 * @param {string} input — hex, npub, or NIP-05 (sync resolution not here)
 * @returns {string|null} hex or null if needs async NIP-05
 */
function normalizeOwnerPubkeyHexSync(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (s.startsWith('npub')) {
    const d = nip19.decode(s);
    if (d.type === 'npub' && typeof d.data === 'string' && d.data.length === 64) {
      return d.data.toLowerCase();
    }
  }
  return null;
}

module.exports = {
  normalizePrivkeyToHex,
  privkeyToUint8Array,
  normalizeOwnerPubkeyHexSync,
};
