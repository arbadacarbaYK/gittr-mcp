// gittr-nostr.js - Nostr operations for gittr (NIP-34 compliant)
// Use native fetch (Node 22+)
const { SimplePool, nip19, finalizeEvent, verifyEvent } = require('nostr-tools');
const config = require('./config');
const { detectGraspFromRepoEvent } = require('./grasp-detection');

// NIP-34 Event Kinds
const KIND_REPOSITORY = 30617;           // Repository announcement
const KIND_REPOSITORY_STATE = 30618;     // Repository state (refs, commits)
const KIND_PATCH = 1617;                 // Patch (git format-patch output)
const KIND_PULL_REQUEST = 1618;          // Pull Request
const KIND_PR_UPDATE = 1619;             // Pull Request Update
const KIND_ISSUE = 1621;                 // Issue
const KIND_STATUS_OPEN = 1630;           // Status: Open
const KIND_STATUS_APPLIED = 1631;        // Status: Applied/Merged
const KIND_STATUS_CLOSED = 1632;         // Status: Closed
const KIND_STATUS_DRAFT = 1633;          // Status: Draft

// Relay pool (singleton)
let pool = null;

function getPool() {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

// Query repos by owner pubkey
async function listRepos(options = {}) {
  const {
    pubkey = null,
    search = null,
    limit = 100,
    relays = config.relays
  } = typeof options === 'string' ? { pubkey: options } : options;
  
  const pool = getPool();
  const filter = { kinds: [KIND_REPOSITORY] };
  
  // Add author filter if pubkey provided
  if (pubkey) {
    filter.authors = [pubkey];
  }
  
  // Add search filter if provided
  if (search) {
    filter.search = search;
  }
  
  filter.limit = limit;
  
  const events = await pool.querySync(relays, filter);
  
  return events.map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    const { graspServers, regularRelays, cloneUrls } = detectGraspFromRepoEvent(event.tags);
    
    return {
      id: tags.d,
      name: tags.name,
      description: tags.description,
      owner: event.pubkey,
      web: event.tags.filter(t => t[0] === 'web').map(t => t[1]),
      clone: cloneUrls,
      graspServers,
      relays: regularRelays,
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
async function createIssue(privkeyOrOptions, repoIdArg, ownerPubkeyArg, subjectArg, contentArg) {
  // Support both object and positional parameters
  let ownerPubkey, repoId, subject, content, labels, privkey, relays;
  
  if (typeof privkeyOrOptions === 'object' && privkeyOrOptions !== null && !Buffer.isBuffer(privkeyOrOptions)) {
    // Object parameter style
    ({ ownerPubkey, repoId, subject, content, labels = [], privkey, relays = config.relays } = privkeyOrOptions);
  } else {
    // Positional parameter style: createIssue(privkey, repoId, ownerPubkey, subject, content)
    privkey = privkeyOrOptions;
    repoId = repoIdArg;
    ownerPubkey = ownerPubkeyArg;
    subject = subjectArg;
    content = contentArg;
    labels = [];
    relays = config.relays;
  }
  
  const privkeyBuffer = typeof privkey === 'string' ? Buffer.from(privkey, 'hex') : privkey;
  
  const unsignedEvent = {
    kind: KIND_ISSUE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`],
      ['p', ownerPubkey],
      ['subject', subject],
      ...labels.map(label => ['t', label])
    ],
    content
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  
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
async function createPR(privkeyOrOptions, repoIdArg, ownerPubkeyArg, subjectArg, contentArg, baseBranchArg, headBranchArg, cloneUrlsArg) {
  // Support both object and positional parameters
  // NOTE: Default values must be in the variable declarations, not in destructuring
  let ownerPubkey, repoId, subject, content, commitId = 'HEAD', cloneUrls = [], branchName = 'main', labels = [], privkey, relays;
  
  if (typeof privkeyOrOptions === 'object' && privkeyOrOptions !== null && !Buffer.isBuffer(privkeyOrOptions)) {
    // Object parameter style - override defaults only if values are provided
    const opts = privkeyOrOptions;
    ownerPubkey = opts.ownerPubkey;
    repoId = opts.repoId;
    subject = opts.subject;
    content = opts.content;
    commitId = opts.commitId || 'HEAD';
    cloneUrls = opts.cloneUrls || [];
    branchName = opts.branchName || 'main';
    labels = opts.labels || [];
    privkey = opts.privkey;
    relays = opts.relays || config.relays;
  } else {
    // Positional parameter style: createPR(privkey, repoId, ownerPubkey, subject, content, baseBranch, headBranch, cloneUrls)
    privkey = privkeyOrOptions;
    repoId = repoIdArg;
    ownerPubkey = ownerPubkeyArg;
    subject = subjectArg;
    content = contentArg;
    branchName = headBranchArg || 'main';
    commitId = 'HEAD'; // Default commit
    cloneUrls = cloneUrlsArg || [];
    labels = [];
    relays = config.relays;
  }
  
  const privkeyBuffer = typeof privkey === 'string' ? Buffer.from(privkey, 'hex') : privkey;
  
  // Build tags array, filtering out undefined values
  const tags = [
    ['a', `${KIND_REPOSITORY}:${ownerPubkey}:${repoId}`],
    ['p', ownerPubkey],
    ['subject', subject],
    ['c', commitId],
    ['branch-name', branchName]
  ];
  
  // Add optional tags only if they have values
  if (cloneUrls && cloneUrls.length > 0) {
    tags.push(...cloneUrls.map(url => ['clone', url]));
  }
  if (labels && labels.length > 0) {
    tags.push(...labels.map(label => ['t', label]));
  }
  
  const unsignedEvent = {
    kind: KIND_PULL_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Publish repository announcement (kind 30617)
async function publishRepoAnnouncement({ repoId, name, description, web, clone, privkey, relays = config.relays }) {
  const privkeyBuffer = typeof privkey === 'string' ? Buffer.from(privkey, 'hex') : privkey;
  
  // Build tags - clone takes multiple URLs in a SINGLE tag per NIP-34
  const tags = [
    ['d', repoId],
    ['name', name],
    ['description', description],
    ...web.map(url => ['web', url])
  ];
  
  // Clone: single tag with all URLs as values
  if (clone && clone.length > 0) {
    tags.push(['clone', ...clone]);
  }
  
  // Relays: single tag with all relay URLs
  if (relays && relays.length > 0) {
    tags.push(['relays', ...relays]);
  }
  
  const unsignedEvent = {
    kind: KIND_REPOSITORY,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Publish repository state (kind 30618)
async function publishRepoState({ repoId, refs, privkey, relays = config.relays }) {
  const privkeyBuffer = typeof privkey === 'string' ? Buffer.from(privkey, 'hex') : privkey;
  
  const unsignedEvent = {
    kind: KIND_REPOSITORY_STATE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ...refs.map(ref => [ref.name, ref.commit])
    ],
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, privkeyBuffer);
  
  const pool = getPool();
  await pool.publish(relays, event);
  
  return { event, success: true };
}

// Push files to bridge with Nostr authentication (REQUIRED)
// Agent must sign a challenge to authenticate
async function getBridgeChallenge(bridgeUrl) {
  const response = await fetch(`${bridgeUrl}/api/nostr/repo/push-challenge`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get challenge: ${response.status}`);
  }
  
  return response.json();
}

// Sign the challenge with Nostr private key
async function signChallenge(challenge, privkey) {
  const { finalizeEvent } = require('nostr-tools');
  
  const privkeyBuffer = typeof privkey === 'string' ? Buffer.from(privkey, 'hex') : privkey;
  
  const unsignedEvent = {
    kind: 24242, // Generic auth kind
    created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', challenge]],
    content: 'gittr bridge auth'
  };
  
  const signedEvent = finalizeEvent(unsignedEvent, privkeyBuffer);
  
  return {
    pubkey: Buffer.from(signedEvent.pubkey).toString('hex'),
    sig: signedEvent.sig,
    created_at: signedEvent.created_at
  };
}

// Push files to bridge - REQUIRES privkey for authentication
async function pushToBridge({ ownerPubkey, repo, branch, files, commitMessage, privkey }) {
  // Authentication is now REQUIRED
  if (!privkey) {
    throw new Error('Authentication required: privkey must be provided. The bridge now requires Nostr authentication.');
  }
  
  // Try challenge-based auth first, fall back to direct push if challenge returns 404
  let challengeData;
  let useAuth = true;
  try {
    challengeData = await getBridgeChallenge(config.bridgeUrl);
  } catch (e) {
    useAuth = false;
  }
  
  let authHeader = '';
  if (useAuth && challengeData?.challenge) {
    const challenge = challengeData.challenge;
    const auth = await signChallenge(challenge, privkey);
    const authPayload = JSON.stringify({
      pubkey: auth.pubkey,
      sig: auth.sig,
      created_at: auth.created_at
    });
    authHeader = Buffer.from(authPayload).toString('base64');
  }
  
  const headers = { 'Content-Type': 'application/json' };
  if (authHeader) {
    headers['Authorization'] = `Nostr ${authHeader}`;
  }
  
  const response = await fetch(`${config.bridgeUrl}/api/nostr/repo/push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ownerPubkey,
      repo,
      branch,
      files,
      commitMessage
    })
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || result.details || 'Bridge push failed');
  }
  
  return result;
}

// Create bounty via bridge API (HTTP)
async function createBounty(ownerPubkey, repoId, issueId, amount, description) {
  const response = await fetch(`${config.bridgeUrl}/api/bounty/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerPubkey,
      repoId,
      issueId,
      amount,
      description
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bounty creation failed: ${error}`);
  }
  
  return response.json();
}

// Helper: Get public key from private key
function getPublicKey(privkey) {
  if (!privkey) {
    throw new Error('Private key is required');
  }
  
  let hex = privkey;
  
  // Handle nsec format
  if (typeof privkey === 'string' && privkey.startsWith('nsec')) {
    const decoded = nip19.decode(privkey);
    hex = decoded.data;
  }
  
  // Convert hex string to Buffer if needed
  const privateKeyBuffer = typeof hex === 'string' ? Buffer.from(hex, 'hex') : hex;
  
  const { getPublicKey: nobleGetPublicKey } = require('@noble/secp256k1');
  // Use true for compressed (33 bytes with 0x02/0x03 prefix), then slice to get 32 raw bytes
  const pubKeyBytes = nobleGetPublicKey(privateKeyBuffer, true);
  return Buffer.from(pubKeyBytes.slice(1)).toString('hex');
}

module.exports = {
  // Repository operations
  listRepos,
  publishRepoAnnouncement,
  publishRepo: publishRepoAnnouncement, // Alias
  publishRepoState,
  pushToBridge,
  
  // Issue operations
  listIssues,
  createIssue,
  
  // Pull Request operations
  listPRs,
  createPR,
  
  // Bounty operations
  createBounty,
  
  // Helpers
  getPublicKey,
  
  // Event kinds
  KIND_REPOSITORY,
  KIND_REPOSITORY_STATE,
  KIND_ISSUE,
  KIND_PULL_REQUEST,
  KIND_PATCH,
  KIND_STATUS_OPEN,
  KIND_STATUS_APPLIED,
  KIND_STATUS_CLOSED,
  KIND_STATUS_DRAFT,
  
  // Export config for agent functions
  config
};
