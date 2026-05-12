// gittr-nostr.js - Nostr operations for gittr (NIP-34 compliant)
// Use native fetch (Node 18+)
const { SimplePool, nip19, nip05, finalizeEvent, verifyEvent } = require('nostr-tools');
const config = require('./config');
const { detectGraspFromRepoEvent } = require('./grasp-detection');
const { normalizeOwnerPubkeyHexSync, privkeyToUint8Array } = require('./gittr-keys');
const bridgeApi = require('./gittr-bridge-api');

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
const KIND_BOUNTY = 9806;                // gittr bounty metadata (see ngit events.ts)

/** Resolve npub / hex / NIP-05 to lowercase hex for filters and tags. */
async function resolveRepoOwnerHex(ownerPubkey) {
  if (!ownerPubkey || typeof ownerPubkey !== 'string') return ownerPubkey;
  const s = ownerPubkey.trim();
  const direct = normalizeOwnerPubkeyHexSync(s);
  if (direct) return direct;
  if (s.includes('@')) {
    try {
      const prof = await nip05.queryProfile(s);
      if (prof?.pubkey && /^[0-9a-f]{64}$/i.test(prof.pubkey)) {
        return prof.pubkey.toLowerCase();
      }
    } catch (_) { /* ignore */ }
  }
  return s.toLowerCase();
}

// Relay pool (singleton)
let pool = null;

function getPool() {
  if (!pool) {
    pool = new SimplePool();
  }
  return pool;
}

function buildReliabilityRelaySet(relays = []) {
  const preferred = [
    'wss://relay.ngit.dev',
    'wss://ngit-relay.nostrver.se',
    'wss://git.shakespeare.diy',
  ];
  const all = [...(Array.isArray(relays) ? relays : []), ...(Array.isArray(config.relays) ? config.relays : []), ...preferred];
  return [...new Set(all.filter((r) => typeof r === 'string' && r.trim().length > 0))];
}

async function publishEventChecked(relays, event) {
  const pool = getPool();
  const pubs = pool.publish(relays, event);
  const settled = await Promise.allSettled(pubs);
  const okCount = settled.filter((s) => s.status === 'fulfilled').length;
  if (okCount > 0) return { okCount, settled };
  const reasons = settled
    .filter((s) => s.status === 'rejected')
    .map((s) => s.reason?.message || String(s.reason));
  throw new Error(`Publish rejected by all relays: ${reasons.join(' | ')}`);
}

async function waitForEventVisibility(relays, eventId, kind, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pool = new SimplePool();
    try {
      const evs = await pool.querySync(relays, { ids: [eventId], kinds: [kind], limit: 1 });
      if (Array.isArray(evs) && evs.length > 0) {
        // Require second confirmation after a short delay to avoid transient/optimistic relay echoes.
        await new Promise((r) => setTimeout(r, 1800));
        const confirmPool = new SimplePool();
        try {
          const confirm = await confirmPool.querySync(relays, { ids: [eventId], kinds: [kind], limit: 1 });
          if (Array.isArray(confirm) && confirm.length > 0) return true;
        } finally {
          try { confirmPool.close(relays); } catch (_) { /* ignore */ }
        }
      }
    } finally {
      try { pool.close(relays); } catch (_) { /* ignore */ }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}

async function ensureRepoDiscoverable({ ownerPubkey, repoId, relays = config.relays, timeoutMs = 6000 }) {
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const started = Date.now();
  const pool = getPool();
  while (Date.now() - started < timeoutMs) {
    const events = await pool.querySync(relays, {
      kinds: [KIND_REPOSITORY],
      authors: [ownerHex],
      '#d': [repoId],
      limit: 1,
    });
    if (Array.isArray(events) && events.length > 0) return true;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
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
    filter.authors = [await resolveRepoOwnerHex(pubkey)];
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
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const filter = {
    kinds: [KIND_ISSUE],
    '#a': [`${KIND_REPOSITORY}:${ownerHex}:${repoId}`]
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
  
  const sk = privkeyToUint8Array(privkey);
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const relaySet = buildReliabilityRelaySet(relays);
  const repoOk = await ensureRepoDiscoverable({ ownerPubkey: ownerHex, repoId, relays: relaySet, timeoutMs: 20000 });
  if (!repoOk) {
    throw new Error('Repository announcement not discoverable on relays yet; cannot publish issue safely. Retry after repo acceptance.');
  }
  
  const unsignedEvent = {
    kind: KIND_ISSUE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `${KIND_REPOSITORY}:${ownerHex}:${repoId}`],
      ['p', ownerHex],
      ['subject', subject],
      ...labels.map(label => ['t', label])
    ],
    content
  };
  
  const event = finalizeEvent(unsignedEvent, sk);
  
  await publishEventChecked(relaySet, event);
  try {
    await bridgeApi.sendEventToBridge(event, config.bridgeUrl);
  } catch (_) {
    // best-effort bridge ingest
  }
  const visible = await waitForEventVisibility(relaySet, event.id, KIND_ISSUE, 24000);
  if (!visible) {
    throw new Error('Issue publish acknowledged but event is not queryable on target relays yet.');
  }
  
  return { event, success: true };
}

// Query PRs for a repo
async function listPRs({ ownerPubkey, repoId, relays = config.relays }) {
  const pool = getPool();
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const events = await pool.querySync(relays, {
    kinds: [KIND_PULL_REQUEST],
    '#a': [`${KIND_REPOSITORY}:${ownerHex}:${repoId}`]
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
      clone: event.tags.filter(t => t[0] === 'clone').flatMap(t => t.slice(1).filter(Boolean)),
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
  
  // If no relays specified, fetch the repo to get its clone/relay info
  let repo = null;
  if (!relays || relays.length === 0) {
    try {
      const repos = await listRepos({ pubkey: ownerPubkey, search: repoId });
      repo = repos.find(r => r.id === repoId);
      if (repo && repo.relays && repo.relays.length > 0) {
        relays = repo.relays;
      } else if (repo && repo.clone && repo.clone.length > 0) {
        // Fallback: extract relay from clone URL
        const cloneUrl = repo.clone[0];
        let relayUrl = cloneUrl.replace(/^https?:\/\//, 'wss://').replace(/\/.*$/, '');
        relays = [relayUrl];
      } else {
        relays = config.relays;
      }
    } catch (e) {
      console.error('Failed to fetch repo:', e.message);
      relays = config.relays;
    }
  }
  
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const sk = privkeyToUint8Array(privkey);
  const relaySet = buildReliabilityRelaySet(relays);
  const repoOk = await ensureRepoDiscoverable({ ownerPubkey: ownerHex, repoId, relays: relaySet, timeoutMs: 20000 });
  if (!repoOk) {
    throw new Error('Repository announcement not discoverable on relays yet; cannot publish PR safely. Retry after repo acceptance.');
  }
  
  // Get repo EUC (earliest unique commit) if available - some relays require this
  let euc = null;
  try {
    const pool = getPool();
    const repoEvents = await pool.querySync(relaySet, {
      kinds: [KIND_REPOSITORY],
      authors: [ownerHex],
      '#d': [repoId]
    });
    if (repoEvents.length > 0) {
      const rTag = repoEvents[0].tags.find(t => t[0] === 'r' && t[2] === 'euc');
      if (rTag) {
        euc = rTag[1];
      }
    }
  } catch (e) {
    console.error('Failed to get repo EUC:', e.message);
  }
  
  // Build tags array (NIP-34).
  const repoRef = `${KIND_REPOSITORY}:${ownerHex}:${repoId}`;
  
  const tags = [
    ['a', repoRef],
    ['p', ownerHex],
    ['subject', subject],
    ['c', commitId],
    ['branch-name', branchName]
  ];
  
  // Add EUC if available (required by some relays for validation)
  if (euc) {
    tags.push(['r', euc, 'euc']);
  }
  
  // Add optional tags only if they have values
  if (cloneUrls && cloneUrls.length > 0) {
    tags.push(...cloneUrls.map(url => ['clone', url]));
  } else if (repo && repo.clone && repo.clone.length > 0) {
    // Fallback: use clone URL from repo
    tags.push(['clone', repo.clone[0]]);
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
  
  const event = finalizeEvent(unsignedEvent, sk);
  
  await publishEventChecked(relaySet, event);
  try {
    await bridgeApi.sendEventToBridge(event, config.bridgeUrl);
  } catch (_) {
    // best-effort bridge ingest
  }
  const visible = await waitForEventVisibility(relaySet, event.id, KIND_PULL_REQUEST, 24000);
  if (!visible) {
    throw new Error('PR publish acknowledged but event is not queryable on target relays yet.');
  }
  
  return { event, success: true };
}

/** NIP-34 kind 1619 — update PR tip commit / clone URLs (requires git validation on relays). */
async function updatePullRequest(options) {
  const {
    ownerPubkey,
    repoId,
    pullRequestEventId,
    pullRequestAuthor,
    currentCommitId,
    cloneUrls,
    earliestUniqueCommit,
    mergeBase,
    privkey,
    relays = config.relays,
  } = options;
  if (!pullRequestEventId || !currentCommitId || !cloneUrls?.length) {
    throw new Error('updatePullRequest requires pullRequestEventId, currentCommitId, cloneUrls[]');
  }
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const authorHex = await resolveRepoOwnerHex(pullRequestAuthor);
  const sk = privkeyToUint8Array(privkey);
  const tags = [
    ['a', `30617:${ownerHex}:${repoId}`],
    ...(earliestUniqueCommit ? [['r', earliestUniqueCommit]] : []),
    ['p', ownerHex],
    ['E', pullRequestEventId],
    ['P', authorHex],
    ['c', currentCommitId],
    ...cloneUrls.map((url) => ['clone', url]),
  ];
  if (mergeBase) tags.push(['merge-base', mergeBase]);
  const unsignedEvent = {
    kind: KIND_PR_UPDATE,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
  const event = finalizeEvent(unsignedEvent, sk);
  await publishEventChecked(relays, event);
  return { event, success: true };
}

/**
 * NIP-34 status kinds 1630–1633 for issues, PRs, or patches.
 * e.g. close issue: statusKind 1632, rootEventId = issue id, rootEventAuthor = issue author.
 */
async function publishStatusForRoot(options) {
  const {
    statusKind,
    rootEventId,
    ownerPubkey,
    rootEventAuthor,
    repoId,
    content = '',
    privkey,
    relays = config.relays,
    acceptedRevisionId,
    revisionAuthor,
    earliestUniqueCommit,
    mergeCommitId,
  } = options;
  if (![1630, 1631, 1632, 1633].includes(statusKind)) {
    throw new Error('statusKind must be 1630–1633');
  }
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const rootAuthorHex = await resolveRepoOwnerHex(rootEventAuthor);
  const revAuthorHex = revisionAuthor ? await resolveRepoOwnerHex(revisionAuthor) : null;
  const sk = privkeyToUint8Array(privkey);
  const tags = [
    ['e', rootEventId, '', 'root'],
    ['p', ownerHex],
    ['p', rootAuthorHex],
  ];
  if (statusKind === 1631 && acceptedRevisionId) {
    tags.push(['e', acceptedRevisionId, '', 'reply']);
  }
  if (revAuthorHex) tags.push(['p', revAuthorHex]);
  if (repoId) tags.push(['a', `30617:${ownerHex}:${repoId}`]);
  if (earliestUniqueCommit) tags.push(['r', earliestUniqueCommit]);
  if (statusKind === 1631 && mergeCommitId) {
    tags.push(['merge-commit', mergeCommitId]);
    tags.push(['r', mergeCommitId]);
  }
  const unsignedEvent = {
    kind: statusKind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };
  const event = finalizeEvent(unsignedEvent, sk);
  await publishEventChecked(relays, event);
  return { event, success: true };
}

/** gittr bounty event kind 9806 (see ngit createBountyEvent). */
async function publishBountyToNostr(options) {
  const {
    issueId,
    repoEntity,
    repoName,
    amount,
    status = 'pending',
    privkey,
    relays = config.relays,
    paymentHash,
    invoice,
    withdrawId,
    lnurl,
    withdrawUrl,
    claimedBy,
  } = options;
  const creator = getPublicKey(privkey);
  const sk = privkeyToUint8Array(privkey);
  const tags = [
    ['e', issueId, '', 'issue'],
    ['repo', repoEntity, repoName],
    ['status', status],
    ['p', creator, 'creator'],
  ];
  if (claimedBy) {
    const cb = await resolveRepoOwnerHex(claimedBy);
    tags.push(['p', cb, 'claimed_by']);
  }
  const unsignedEvent = {
    kind: KIND_BOUNTY,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify({
      amount,
      status,
      withdrawId,
      lnurl,
      withdrawUrl,
      invoice,
      paymentHash,
      claimedBy: claimedBy ? await resolveRepoOwnerHex(claimedBy) : undefined,
    }),
  };
  const event = finalizeEvent(unsignedEvent, sk);
  await publishEventChecked(relays, event);
  return { event, success: true };
}

async function listBountiesForIssue({ issueId, relays = config.relays, limit = 30 }) {
  const pool = getPool();
  const events = await pool.querySync(relays, {
    kinds: [KIND_BOUNTY],
    '#e': [issueId],
    limit,
  });
  return events.map((ev) => {
    let meta = {};
    try {
      meta = JSON.parse(ev.content || '{}');
    } catch (_) { /* ignore */ }
    return { id: ev.id, author: ev.pubkey, created_at: ev.created_at, tags: ev.tags, ...meta, event: ev };
  });
}

// Publish repository announcement (kind 30617)
async function publishRepoAnnouncement({
  repoId,
  name,
  description,
  web = [],
  clone,
  privkey,
  relays = config.relays,
  pushCostSats,
}) {
  const sk = privkeyToUint8Array(privkey);
  const webUrls = Array.isArray(web) ? web : [];
  
  // Build tags with single clone/relays entries carrying multiple values.
  // Some relays reject announcements with repeated clone tags.
  const tags = [
    ['d', repoId],
    ['name', name],
    ['description', description],
    ...webUrls.map(url => ['web', url])
  ];
  
  if (pushCostSats != null && Number.isFinite(Number(pushCostSats)) && Number(pushCostSats) >= 0) {
    tags.push(['push_cost_sats', String(Math.floor(Number(pushCostSats)))]);
  }
  
  // Clone tags: single tag with all clone URLs
  if (clone && clone.length > 0) {
    const cloneValues = clone.filter((u) => u && typeof u === 'string');
    if (cloneValues.length > 0) tags.push(['clone', ...cloneValues]);
  }
  
  // Relay tags: single tag with all relay URLs
  if (relays && relays.length > 0) {
    const relayValues = [];
    relays.forEach((r) => {
      if (!r) return;
      const rr = (r.startsWith('wss://') || r.startsWith('ws://')) ? r : `wss://${r}`;
      relayValues.push(rr);
    });
    if (relayValues.length > 0) tags.push(['relays', ...relayValues]);
  }
  
  const unsignedEvent = {
    kind: KIND_REPOSITORY,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, sk);
  
  await publishEventChecked(relays, event);
  try {
    await bridgeApi.sendEventToBridge(event, config.bridgeUrl);
  } catch (_) {
    // best-effort bridge ingest
  }
  const visible = await waitForEventVisibility(relays, event.id, KIND_REPOSITORY, 8000);
  if (!visible) {
    throw new Error('Announcement publish acknowledged but event is not queryable on target relays yet.');
  }
  
  return { event, success: true };
}

// Publish repository state (kind 30618)
async function publishRepoState({ repoId, refs, privkey, relays = config.relays }) {
  const sk = privkeyToUint8Array(privkey);
  const normalizedRefs = (Array.isArray(refs) ? refs : [])
    .map((r) => ({
      ref: r?.ref || r?.name || '',
      commit: r?.commit || ''
    }))
    .filter((r) => r.ref && typeof r.ref === 'string');
  const hasHead = normalizedRefs.some((r) => r.ref === 'HEAD');
  const firstHeadRef = normalizedRefs.find((r) => r.ref.startsWith('refs/heads/'));
  if (!hasHead) {
    const branch = firstHeadRef ? firstHeadRef.ref.replace('refs/heads/', '') : 'main';
    normalizedRefs.push({ ref: 'HEAD', commit: `ref: refs/heads/${branch}` });
  }
  
  const unsignedEvent = {
    kind: KIND_REPOSITORY_STATE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ...normalizedRefs.map(ref => [ref.ref, ref.commit || ''])
    ],
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, sk);
  
  await publishEventChecked(relays, event);
  
  return { event, success: true };
}

// In-memory cache: reuse one signed challenge per (bridgeUrl, pubkey) for a short window
// Reduces load on push-challenge when MCP does several pushes in a row
const challengeCache = new Map();
const CHALLENGE_CACHE_TTL_MS = 45 * 1000;

function getCachedAuth(bridgeUrl, pubkey) {
  const key = `${bridgeUrl}:${pubkey}`;
  const entry = challengeCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.authHeader;
  challengeCache.delete(key);
  return null;
}

function setCachedAuth(bridgeUrl, pubkey, authHeader) {
  const key = `${bridgeUrl}:${pubkey}`;
  challengeCache.set(key, { authHeader, expiresAt: Date.now() + CHALLENGE_CACHE_TTL_MS });
}

async function getBridgeChallenge(bridgeUrl) {
  const response = await fetch(`${bridgeUrl}/api/nostr/repo/push-challenge`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  if (response.status === 429) {
    const body = await response.json().catch(() => ({}));
    const retryAfter = body.retry_after ?? body.retryAfter ?? 60;
    throw new Error(`Rate limited; retry after ${retryAfter}s`);
  }
  if (!response.ok) {
    throw new Error(`Failed to get challenge: ${response.status}`);
  }
  return response.json();
}

// Sign the challenge with Nostr private key (NIP-98 style for gittr bridge)
async function signChallenge(challenge, privkey) {
  const sk = privkeyToUint8Array(privkey);
  const pubkeyHex = getPublicKey(privkey);

  const unsignedEvent = {
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', challenge]],
    content: 'gittr bridge auth'
  };

  const signedEvent = finalizeEvent(unsignedEvent, sk);

  return {
    pubkey: typeof signedEvent.pubkey === 'string' ? signedEvent.pubkey : pubkeyHex,
    sig: signedEvent.sig,
    created_at: signedEvent.created_at
  };
}

// Build signed repository announcement header for bridge auth (preferred by ngit /push-auth method 0)
function buildSignedAuthEventHeader({ repo, privkey }) {
  const sk = privkeyToUint8Array(privkey);
  const unsignedEvent = {
    kind: KIND_REPOSITORY,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repo],
      ['name', repo]
    ],
    content: ''
  };
  const signed = finalizeEvent(unsignedEvent, sk);
  return Buffer.from(JSON.stringify(signed), 'utf8').toString('base64');
}

// Push files to bridge - REQUIRES privkey for authentication
async function pushToBridge({ ownerPubkey, repo, branch, files, commitMessage, privkey }) {
  if (!privkey) {
    throw new Error('Authentication required: privkey must be provided. The bridge now requires Nostr authentication.');
  }

  const pubkeyHex = getPublicKey(privkey);
  let authHeader = getCachedAuth(config.bridgeUrl, pubkeyHex);

  if (!authHeader) {
    let challengeData;
    let useAuth = true;
    try {
      challengeData = await getBridgeChallenge(config.bridgeUrl);
    } catch (e) {
      useAuth = false;
    }
    if (useAuth && challengeData?.challenge) {
      const auth = await signChallenge(challengeData.challenge, privkey);
      const authPayload = JSON.stringify({
        pubkey: auth.pubkey,
        sig: auth.sig,
        created_at: auth.created_at
      });
      authHeader = Buffer.from(authPayload).toString('base64');
      setCachedAuth(config.bridgeUrl, pubkeyHex, authHeader);
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    // ngit bridge prefers this signed 30617 event auth path
    'X-Nostr-Auth-Event': buildSignedAuthEventHeader({ repo, privkey })
  };
  if (authHeader) {
    headers['Authorization'] = `Nostr ${authHeader}`;
  }

  const doPush = () => fetch(`${config.bridgeUrl}/api/nostr/repo/push`, {
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

  let response = await doPush();
  let result = await response.json().catch(() => ({}));

  // On 429, back off and retry once
  if (response.status === 429) {
    const retryAfter = Math.min(120, Math.max(30, result.retry_after ?? result.retryAfter ?? 60));
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    response = await doPush();
    result = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    throw new Error(result.error || result.details || 'Bridge push failed');
  }

  // Optional: publish commit/state to Nostr right after bridge push.
  // Disabled by default because some relays reject transiently and can crash automation flows.
  const relays = config.relays;
  const shouldPublishPostPush = process.env.GITTR_PUBLISH_POST_PUSH_EVENTS === '1';
  if (shouldPublishPostPush && result.refs && result.refs.length > 0 && privkey) {
    try {
      await publishCommitAndState({
        ownerPubkey,
        repo,
        commit: result.refs[0].commit,
        branch: result.refs[0].ref.replace('refs/heads/', ''),
        commitMessage,
        privkey,
        relays
      });
    } catch (e) {
      console.error('Failed to publish Nostr events:', e.message);
      // Don't fail the push if Nostr publish fails
    }
  } else if (!shouldPublishPostPush) {
    result.postPushNostrEvents = { skipped: true, reason: 'Set GITTR_PUBLISH_POST_PUSH_EVENTS=1 to enable' };
  }
  
  return result;
}

// Publish commit (30620) and state (30618) events after bridge push
async function publishCommitAndState({ ownerPubkey, repo, commit, branch, commitMessage, privkey, relays }) {
  const sk = privkeyToUint8Array(privkey);
  const ownerHex = await resolveRepoOwnerHex(ownerPubkey);
  const now = Math.floor(Date.now() / 1000);
  
  // Build r tag for repo reference
  const rTag = `30617:${ownerHex}:${repo}`;
  
  // 1. Publish commit event (kind 30620)
  const commitEvent = {
    kind: 30620,
    created_at: now,
    tags: [
      ['d', repo],
      ['r', rTag],
      ['c', commit],  // commit hash
      ['b', branch],  // branch name
      ['m', 'commit']  // operation type
    ],
    content: commitMessage || `Commit to ${branch}`
  };
  const signedCommitEvent = finalizeEvent(commitEvent, sk);
  
  await publishEventChecked(relays, signedCommitEvent);
  console.log('Published commit event:', signedCommitEvent.id);
  
  // 2. Publish state event (kind 30618)
  const stateEvent = {
    kind: 30618,
    created_at: now,
    tags: [
      ['d', repo],
      ['r', rTag],
      ['c', commit],  // head commit
      ['b', branch]   // current branch
    ],
    content: `State: ${branch} at ${commit.slice(0, 8)}`
  };
  const signedStateEvent = finalizeEvent(stateEvent, sk);
  
  await publishEventChecked(relays, signedStateEvent);
  console.log('Published state event:', signedStateEvent.id);
  
  return { commitEvent: signedCommitEvent, stateEvent: signedStateEvent };
}

/**
 * Create bounty Lightning invoice via gittr API (LNbits).
 * Mirrors Settings → Account wallet: pass keys or set GITTR_LNBITS_URL / GITTR_LNBITS_ADMIN_KEY.
 * After payment, publish bounty to Nostr with publishBountyToNostr (kind 9806).
 */
async function createBountyInvoice(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('createBountyInvoice({ issueId, amount, description?, lnbitsUrl?, lnbitsAdminKey? })');
  }
  const {
    issueId,
    amount,
    description = '',
    lnbitsUrl = process.env.GITTR_LNBITS_URL || '',
    lnbitsAdminKey = process.env.GITTR_LNBITS_ADMIN_KEY || '',
  } = options;
  if (!issueId || amount == null) {
    throw new Error('issueId and amount are required');
  }
  const response = await fetch(`${config.bridgeUrl}/api/bounty/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      issueId,
      amount,
      description,
      lnbitsUrl: lnbitsUrl || undefined,
      lnbitsAdminKey: lnbitsAdminKey || undefined,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.status || `Bounty invoice failed: ${response.status}`);
  }
  return body;
}

const createBounty = createBountyInvoice;

// Helper: Get public key from private key
function getPublicKey(privkey) {
  if (!privkey) {
    throw new Error('Private key is required');
  }
  
  let hex = privkey;
  
  // Handle nsec format
  if (typeof privkey === 'string' && privkey.startsWith('nsec')) {
    const decoded = nip19.decode(privkey);
    hex = typeof decoded.data === 'string' ? decoded.data : Buffer.from(decoded.data).toString('hex');
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
  updatePullRequest,
  
  // Status (issues / PRs / patches)
  publishStatusForRoot,
  
  // Bounty operations
  createBounty,
  createBountyInvoice,
  publishBountyToNostr,
  listBountiesForIssue,
  
  // Helpers
  getPublicKey,
  resolveRepoOwnerHex,
  
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
  KIND_BOUNTY,
  KIND_PR_UPDATE,
  
  // Export config for agent functions
  config
};
