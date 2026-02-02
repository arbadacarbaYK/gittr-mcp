// nostr-utils.js
const secp = require('@noble/secp256k1');
const { nip19 } = require('nostr-tools');
const crypto = require('crypto');

function bech32Decode(bech) {
  const decoded = nip19.decode(bech);
  return decoded.data;
}

function bech32Encode(prefix, hex) {
  if (prefix === 'npub') {
    return nip19.npubEncode(hex);
  } else if (prefix === 'nsec') {
    return nip19.nsecEncode(hex);
  }
  throw new Error(`Unsupported prefix: ${prefix}`);
}

function privToPub(priv) {
  let hex = priv;
  if (priv.startsWith('nsec')) {
    const decoded = nip19.decode(priv);
    hex = decoded.data;
  }
  const pub = secp.getPublicKey(hex, false).slice(1);
  return Buffer.from(pub).toString('hex');
}

function toNpub(pubhex) {
  return nip19.npubEncode(pubhex);
}

function canonicalEventSerialize(event) {
  const arr = [0, event.pubkey, event.created_at, event.kind, event.tags || [], event.content || ""];
  return JSON.stringify(arr);
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function signEvent(event, privhex) {
  const serialized = canonicalEventSerialize(event);
  const id = sha256Hex(serialized);
  const sig = secp.signSync(id, privhex, { der: false });
  return { ...event, id, sig };
}

function buildEvent({ kind, content, pubkey, tags = [] }) {
  return {
    kind,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content
  };
}

function signPayload(payload, privhex) {
  const json = JSON.stringify(payload);
  const id = sha256Hex(json);
  const sig = secp.signSync(id, privhex, { der: false });
  return { id, sig };
}

module.exports = { privToPub, toNpub, buildEvent, signEvent, signPayload, bech32Decode, bech32Encode };
