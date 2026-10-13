'use strict';

const { generateSecretKey, getPublicKey } = require('nostr-tools');
const gittr = require('../gittr-nostr');

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

const sk = generateSecretKey();
const hex = Buffer.from(sk).toString('hex');
const header = gittr.buildSignedAuthEventHeader({
  repo: 'bitcoin-junioren',
  privkey: hex,
});
const event = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
const d = (event.tags.find((t) => t[0] === 'd') || [])[1];

assert(event.kind === 30617, 'auth event is a repo announcement');
assert(d === 'bitcoin-junioren', 'auth event is bound to the repo name');
assert(event.pubkey === getPublicKey(sk), 'auth event is signed by that key');
assert(typeof event.sig === 'string' && event.sig.length > 32, 'auth event has a signature');

console.log('\n✓ mirror sync auth header');
