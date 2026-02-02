// gittr-nostr.js - FIXED VERSION
const fetch = require('node-fetch');
const { SimplePool, nip19, finalizeEvent, getPublicKey } = require('nostr-tools');
const config = require('./config');

const KIND_REPOSITORY = 30617;
const KIND_ISSUE = 1621;
const KIND_PULL_REQUEST = 1618;

let pool = null;
function getPool() {
  if (!pool) pool = new SimplePool();
  return pool;
}

// Push files to bridge - FIXED to accept both formats
async function pushToBridge(ownerPubkeyOrOptions, repoArg, filesArg, optionsArg) {
  let ownerPubkey, repo, files, branch, commitMessage;
  
  if (typeof ownerPubkeyOrOptions === 'object' && !Array.isArray(ownerPubkeyOrOptions)) {
    // Object style
    ({ ownerPubkey, repo, files, branch = 'main', commitMessage = 'Update files' } = ownerPubkeyOrOptions);
  } else {
    // Positional style: pushToBridge(ownerPubkey, repo, files, options)
    ownerPubkey = ownerPubkeyOrOptions;
    repo = repoArg;
    files = filesArg;
    const opts = optionsArg || {};
    branch = opts.branch || 'main';
    commitMessage = opts.message || opts.commitMessage || 'Update files';
  }
  
  const url = config.bridgeUrl + '/api/nostr/repo/push';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerPubkey, repo, branch, files, commitMessage })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error('Push failed (' + response.status + '): ' + text.slice(0, 200));
  }
  
  return response.json();
}

// Publish repo - FIXED
async function publishRepo(privkey, repoId, options = {}) {
  const privkeyBuffer = Buffer.isBuffer(privkey) ? privkey : Buffer.from(privkey, 'hex');
  const pubkey = getPublicKey(privkeyBuffer);
  
  const {
    description = '',
    clone_urls = [],
    web_url = 'https://gittr.space/' + nip19.npubEncode(pubkey) + '/' + repoId,
    relays = config.relays
  } = options;
  
  const unsignedEvent = {
    kind: KIND_REPOSITORY,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ['name', repoId],
      ['description', description],
      ['web', web_url],
      ...clone_urls.map(url => ['clone', url]),
      ...relays.map(r => ['relays', r])
    ],
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  const p = getPool();
  await Promise.all(p.publish(relays, event));
  
  return event;
}

// Create issue - FIXED
async function createIssue(privkey, repoId, ownerPubkey, subject, content) {
  const privkeyBuffer = Buffer.isBuffer(privkey) ? privkey : Buffer.from(privkey, 'hex');
  
  const unsignedEvent = {
    kind: KIND_ISSUE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', KIND_REPOSITORY + ':' + ownerPubkey + ':' + repoId],
      ['p', ownerPubkey],
      ['subject', subject]
    ],
    content
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  const p = getPool();
  await Promise.all(p.publish(config.relays, event));
  
  return event;
}

// Create PR - FIXED  
async function createPR(privkey, repoId, ownerPubkey, subject, content) {
  const privkeyBuffer = Buffer.isBuffer(privkey) ? privkey : Buffer.from(privkey, 'hex');
  const authorPubkey = getPublicKey(privkeyBuffer);
  
  const unsignedEvent = {
    kind: KIND_PULL_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', KIND_REPOSITORY + ':' + ownerPubkey + ':' + repoId],
      ['p', ownerPubkey],
      ['subject', subject]
    ],
    content
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  const p = getPool();
  await Promise.all(p.publish(config.relays, event));
  
  return event;
}

module.exports = { pushToBridge, publishRepo, createIssue, createPR };
