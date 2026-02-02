// gittr-nostr.js - Nostr operations for gittr (NIP-34 compliant)
const fetch = require('node-fetch');
const { SimplePool, nip19, getEventHash, getSignature } = require('nostr-tools');
const config = require('./config');

// NIP-34 Event Kinds
const KIND_REPOSITORY = 30617;
const KIND_REPOSITORY_STATE = 30618;
const KIND_PATCH = 1617;
const KIND_PULL_REQUEST = 1618;
const KIND_PR_UPDATE = 1619;
const KIND_ISSUE = 1621;
const KIND_STATUS_OPEN = 1630;
const KIND_STATUS_APPLIED = 1631;
const KIND_STATUS_CLOSED = 1632;
const KIND_STATUS_DRAFT = 1633;

// Relay pool (singleton)
let pool = null;

function getPool() {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

// Query repos by owner pubkey
async function listRepos(pubkey, relays = config.relays) {
  const pool = getPool();
  const events = await pool.querySync(relays, {
    kinds: [KIND_REPOSITORY],
    authors: [pubkey]
  });
  
  return events.map(event => {
    const tags = Object.fromEntries(event.tags);
    return {
      id: tags.d,
      name: tags.name,
      description: tags.description,
      web: event.tags.filter(t => t[0] === 'web').map(t => t[1]),
      clone: event.tags.filter(t => t[0] === 'clone').map(t => t[1]),
      event: event
    };
  });
}

// Query issues for a repo
async function listIssues({ ownerPubkey, repoId, labels = [], relays = config.relays }) {
  const pool = getPool();
  
  const filter = {
    kinds: [KIND_ISSUE],
    '#a': [`${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`]
  };
  
  if (labels.length > 0) {
    filter['#t'] = labels;
  }
  
  const events = await pool.querySync(relays, filter);
  
  return events.map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    return {
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      subject: tags.subject || '',
      content: event.content,
      labels: event.tags.filter(t => t[0] === 't').map(t => t[1]),
      event: event
    };
  });
}

// Create and publish an issue
async function createIssue({ ownerPubkey, repoId, subject, content, labels = [], privkey, relays = config.relays }) {
  const pubkey = getPublicKey(privkey);
  
  const event = {
    kind: KIND_ISSUE,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`],
      ['p', ownerPubkey],
      ['subject', subject],
      ...labels.map(label => ['t', label])
    ],
    content
  };
  
  event.id = getEventHash(event);
  event.sig = getSignature(event, privkey);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Query PRs for a repo
async function listPRs({ ownerPubkey, repoId, relays = config.relays }) {
  const pool = getPool();
  
  const events = await pool.querySync(relays, {
    kinds: [KIND_PULL_REQUEST],
    '#a': [`${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`]
  });
  
  return events.map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    return {
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      subject: tags.subject || '',
      content: event.content,
      commit: tags.c,
      clone: event.tags.filter(t => t[0] === 'clone').map(t => t[1]),
      branchName: tags['branch-name'],
      event: event
    };
  });
}

// Create and publish a PR
async function createPR({ ownerPubkey, repoId, subject, content, commitId, cloneUrls, branchName, labels = [], privkey, relays = config.relays }) {
  const pubkey = getPublicKey(privkey);
  
  const event = {
    kind: KIND_PULL_REQUEST,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`],
      ['p', ownerPubkey],
      ['subject', subject],
      ['c', commitId],
      ...cloneUrls.map(url => ['clone', url]),
      ['branch-name', branchName],
      ...labels.map(label => ['t', label])
    ],
    content
  };
  
  event.id = getEventHash(event);
  event.sig = getSignature(event, privkey);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Publish repository announcement (kind 30617)
async function publishRepoAnnouncement({ repoId, name, description, web, clone, privkey, relays = config.relays }) {
  const pubkey = getPublicKey(privkey);
  
  const event = {
    kind: KIND_REPOSITORY,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ['name', name],
      ['description', description],
      ...web.map(url => ['web', url]),
      ...clone.map(url => ['clone', url]),
      ...relays.map(relay => ['relays', relay])
    ],
    content: ''
  };
  
  event.id = getEventHash(event);
  event.sig = getSignature(event, privkey);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Publish repository state (kind 30618)
async function publishRepoState({ repoId, refs, privkey, relays = config.relays }) {
  const pubkey = getPublicKey(privkey);
  
  const event = {
    kind: KIND_REPOSITORY_STATE,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ...refs.map(ref => [ref.name, ref.commit])
    ],
    content: ''
  };
  
  event.id = getEventHash(event);
  event.sig = getSignature(event, privkey);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Push files to bridge (HTTP API - no privkey needed!)
async function pushToBridge({ ownerPubkey, repo, branch, files, commitMessage }) {
  const response = await fetch(`${config.bridgeUrl}/api/nostr/repo/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerPubkey,
      repo,
      branch,
      files,
      commitMessage
    })
  });
  
  return response.json();
}

// Helper: Get public key from private key
function getPublicKey(privkey) {
  let hex = privkey;
  if (privkey.startsWith('nsec')) {
    const decoded = nip19.decode(privkey);
    hex = decoded.data;
  }
  const { getPublicKey } = require('@noble/secp256k1');
  return Buffer.from(getPublicKey(hex, false).slice(1)).toString('hex');
}

module.exports = {
  listRepos,
  listIssues,
  createIssue,
  listPRs,
  createPR,
  publishRepoAnnouncement,
  publishRepoState,
  pushToBridge,
  KIND_REPOSITORY,
  KIND_ISSUE,
  KIND_PULL_REQUEST
};
