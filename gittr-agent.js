// gittr-agent.js - Agent-friendly convenience functions for gittr-mcp
// These wrap the core functions with better defaults, auto-credentials, and compound operations

const gittrNostr = require('./gittr-nostr.js');
const fs = require('fs');
const path = require('path');

// Try to load credentials from various locations
function loadCredentials() {
  const possiblePaths = [
    '.nostr-keys.json',
    path.join(process.env.HOME || '', '.nostr-identity.json'),
    path.join(process.env.HOME || '', '.config', 'gittr', 'keys.json')
  ];
  
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const keys = JSON.parse(content);
        
        // Support various key formats
        let nsec = keys.nsec || keys.secretKey || keys.private_key;
        let npub = keys.npub || keys.publicKey || keys.pubkey;
        
        // If nsec is in nsec format (nsec1...), convert to hex
        if (nsec && nsec.startsWith('nsec1')) {
          const { nip19 } = require('nostr-tools');
          try {
            const decoded = nip19.decode(nsec);
            nsec = decoded.data;
          } catch (e) {
            // Keep as-is if decode fails
          }
        }
        
        if (nsec) {
          return { nsec, npub, ...keys };
        }
      }
    } catch (e) {
      // Try next path
    }
  }
  
  return null;
}

/**
 * Create a repository in one call - pushes files and publishes to Nostr
 * This is the main agent-friendly function for creating repos
 */
async function createRepo(options) {
  // Destructure without const to allow reassignment
  const name = options.name;
  const description = options.description || '';
  const files = options.files || [];
  const branch = options.branch || 'main';
  let privkey = options.privkey;
  let pubkey = options.pubkey;
  const relays = options.relays || gittrNostr.config.relays;
  const graspServer = options.graspServer || 'relay.ngit.dev';
  
  // Auto-load credentials if not provided
  if (!privkey) {
    const creds = loadCredentials();
    if (creds) {
      // Support both nsec format and secretKey hex format
      privkey = creds.nsec || creds.secretKey || creds.private_key;
      pubkey = pubkey || creds.npub || creds.publicKey || creds.pubkey;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required. Pass privkey option or ensure .nostr-keys.json exists.');
  }
  
  // Derive pubkey from privkey if not provided
  if (!pubkey && privkey) {
    pubkey = gittrNostr.getPublicKey(privkey);
  }
  
  // Step 1: Push files to bridge (requires authentication)
  let pushResult = null;
  if (files.length > 0) {
    pushResult = await gittrNostr.pushToBridge({
      ownerPubkey: pubkey,
      repo: name,
      branch,
      files,
      privkey  // Pass privkey for authenticated push
    });
  }
  
  // Step 2: Build clone URLs - include BOTH git.gittr.space (works!) and relay.ngit.dev
  // git.gittr.space is the ONLY server that actually exposes git access!
  const cloneUrls = [
    `https://git.gittr.space/${pubkey}/${name}.git`,
    `https://relay.ngit.dev/${pubkey}/${name}.git`
  ];
  
  // Include relay URLs in the announcement - this is REQUIRED for relays to accept
  const webUrls = [
    `https://gittr.space/${pubkey}/${name}`
  ];
  
  // Filter to open relays only (no auth required)
  const validRelays = relays.filter(r => 
    r.includes('relay.ngit.dev') || !r.includes('noderunners')
  );
  
  // Step 3: Publish announcement
  const announceResult = await gittrNostr.publishRepoAnnouncement({
    repoId: name,
    name,
    description,
    web: webUrls,
    clone: cloneUrls,
    privkey,
    relays: validRelays.length > 0 ? validRelays : ['wss://relay.ngit.dev']
  });
  
  // Step 4: Publish state (if we pushed files)
  let stateResult = null;
  if (pushResult && pushResult.refs) {
    stateResult = await gittrNostr.publishRepoState({
      repoId: name,
      refs: pushResult.refs,
      privkey,
      relays
    });
  }
  
  return {
    success: true,
    repoId: name,
    name,
    description,
    cloneUrl: cloneUrls[0],
    webUrl: webUrls[0],
    pushedFiles: pushResult?.pushedFiles || 0,
    commit: pushResult?.refs?.[0]?.commit,
    announcementEvent: announceResult.event,
    stateEvent: stateResult?.event,
    pubkey
  };
}

/**
 * Get a single repository by ID or owner+name
 */
async function getRepo(options) {
  const { repoId, ownerPubkey, relays = gittrNostr.config.relays } = options;
  
  let repos;
  if (ownerPubkey) {
    repos = await gittrNostr.listRepos({ pubkey: ownerPubkey, limit: 100, relays });
  } else {
    // Search all repos and filter
    repos = await gittrNostr.listRepos({ limit: 200, relays });
  }
  
  // Find the matching repo
  const match = repos.find(r => 
    r.id === repoId || 
    (r.name && r.name.toLowerCase() === repoId.toLowerCase())
  );
  
  if (!match) {
    return { error: 'Repository not found', repoId, ownerPubkey };
  }
  
  return match;
}

/**
 * Search repositories with full-text search
 */
async function searchRepos(query, options = {}) {
  const { limit = 50, relays = gittrNostr.config.relays } = options;
  
  return gittrNostr.listRepos({ search: query, limit, relays });
}

/**
 * List open bounties (issues with bounty labels or funding)
 * Note: This is a best-effort search - actual bounty discovery may vary
 */
async function listBounties(options = {}) {
  const config = require('./config');
  const { 
    minAmount = 0,      // Minimum bounty in sats
    limit = 50, 
    relays = config.relays || []
  } = options;
  
  if (!relays || relays.length === 0) {
    return [];
  }
  
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [1621], // Issue kind
      '#t': ['bounty', 'bounties', 'sats', 'lightning', 'paid'],
      limit: limit * 2 // Get more, filter later
    });
  } finally {
    try { pool.close(relays); } catch (_) { /* nostr-tools close may throw if relay state is odd */ }
  }
  
  const bounties = (events || []).map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    return {
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      subject: tags.subject || '',
      content: event.content,
      labels: event.tags.filter(t => t[0] === 't').map(t => t[1]),
      // Try to extract bounty amount
      amount: event.tags
        .filter(t => t[0] === 'amount' || t[0] === 'sats')
        .map(t => parseInt(t[1]))[0] || null,
      event
    };
  }).filter(b => !minAmount || !b.amount || b.amount >= minAmount);
  
  return bounties.slice(0, limit);
}

/**
 * Fork a repository (creates a new one based on another)
 */
async function forkRepo(options) {
  const {
    sourceRepoId,      // Repo to fork
    sourceOwnerPubkey,
    newRepoName,      // Name for the forked repo
    newRepoDescription = '',
    privkey,
    relays = gittrNostr.config.relays,
    graspServer = 'git.gittr.space'  // Use the server that actually works!
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds) {
      privkey = creds.nsec || creds.secretKey || creds.private_key;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required for forking');
  }
  
  const pubkey = gittrNostr.getPublicKey(privkey);
  
  // Get source repo info
  const sourceRepo = await getRepo({ repoId: sourceRepoId, ownerPubkey: sourceOwnerPubkey });
  
  if (sourceRepo.error) {
    return { error: `Source repo not found: ${sourceRepo.error}` };
  }
  
  // Create new repo with reference to original
  const forkedDescription = newRepoDescription || 
    `Forked from ${sourceRepo.name}${sourceRepo.description ? ': ' + sourceRepo.description : ''}`;
  
  return createRepo({
    name: newRepoName,
    description: forkedDescription,
    files: [], // Fork starts empty, user can pull from source
    privkey,
    relays,
    graspServer
  });
}

/**
 * Get current user's profile/repos
 */
async function myRepos(options = {}) {
  const { relays = gittrNostr.config.relays } = options;
  
  const creds = loadCredentials();
  if (!creds || !creds.npub) {
    return { error: 'No credentials found. Ensure .nostr-keys.json exists with npub.' };
  }
  
  return gittrNostr.listRepos({ pubkey: creds.npub, limit: 100, relays });
}

/**
 * Add collaborator to a repo
 */
async function addCollaborator(options) {
  const {
    repoId,
    collaboratorPubkey,
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds) {
      privkey = creds.nsec || creds.secretKey || creds.private_key;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required');
  }
  
  // Publish a maintainer event (kind 30617 with maintainers tag)
  const { finalizeEvent } = require('nostr-tools');
  const pubkey = gittrNostr.getPublicKey(privkey);
  
  const unsignedEvent = {
    kind: 30617,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ['maintainers', pubkey, collaboratorPubkey]
    ],
    content: ''
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, collaborator: collaboratorPubkey };
}

/**
 * Get file content from a repo (via git server API)
 */
async function getFile(options) {
  const {
    ownerPubkey,
    repoId,
    filePath,
    branch = 'main'
  } = options;
  
  // First try bridge API (for files that are on bridge but not yet synced to Nostr)
  const bridgeUrl = 'https://gittr.space';
  const bridgeAttempts = [
    `${bridgeUrl}/api/nostr/repo/raw/${ownerPubkey}/${repoId}/${branch}/${filePath}`,
    `${bridgeUrl}/api/raw/${ownerPubkey}/${repoId}/${branch}/${filePath}`,
    `${bridgeUrl}/raw/${ownerPubkey}/${repoId}/${branch}/${filePath}`
  ];
  
  for (const url of bridgeAttempts) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        return { content, path: filePath, repo: repoId, branch, source: 'bridge', url };
      }
    } catch (e) {
      // Try next URL
    }
  }
  
  // If bridge fails, try GRASP servers (for files synced to Nostr)
  const servers = ['relay.ngit.dev', 'git.gittr.space', 'git.shakespeare.diy'];
  
  for (const server of servers) {
    try {
      const url = `https://${server}/${ownerPubkey}/${repoId}/raw/${branch}/${filePath}`;
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        return { content, path: filePath, repo: repoId, branch, server, source: 'grasp' };
      }
    } catch (e) {
      // Try next server
    }
  }
  
  return { error: 'File not found or repo not accessible', path: filePath, repo: repoId };
}

/**
 * Mirror a GitHub/GitLab repo to gittr
 */
async function mirrorRepo(options) {
  const {
    sourceUrl,        // GitHub or GitLab clone URL
    repoName,        // Name for the new repo
    description = '',
    privkey,
    relays = gittrNostr.config.relays,
    graspServer = 'git.gittr.space'  // Use the server that actually works!
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds) {
      privkey = creds.nsec || creds.secretKey || creds.private_key;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required for mirroring');
  }
  
  const pubkey = gittrNostr.getPublicKey(privkey);
  
  // Determine if GitHub or GitLab
  let webUrl = '';
  let cloneUrl = sourceUrl;
  
  if (sourceUrl.includes('github.com')) {
    const match = sourceUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      webUrl = `https://github.com/${match[1]}/${match[2]}`;
    }
  } else if (sourceUrl.includes('gitlab.com')) {
    const match = sourceUrl.match(/gitlab\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      webUrl = `https://gitlab.com/${match[1]}/${match[2]}`;
    }
  }
  
  // Create clone URLs including source
  const graspCloneUrl = `https://${graspServer}/${pubkey}/${repoName}.git`;
  const cloneUrls = [graspCloneUrl, sourceUrl];
  
  // Publish announcement with source reference
  const result = await gittrNostr.publishRepoAnnouncement({
    repoId: repoName,
    name: repoName,
    description: description || `Mirrored from ${sourceUrl}`,
    web: webUrl ? [webUrl] : [],
    clone: cloneUrls,
    privkey,
    relays
  });
  
  return {
    success: true,
    repoId: repoName,
    cloneUrl: graspCloneUrl,
    sourceUrl,
    webUrl,
    announcementEvent: result.event
  };
}

/**
 * Submit work on a bounty (claim it with PR/evidence)
 * This is how developers claim and complete bounties
 */
async function submitBounty(options) {
  const {
    issueId,      // Issue ID to claim
    prUrl,        // URL to the PR with the work
    evidence,     // Evidence/work description
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds) {
      privkey = creds.nsec || creds.secretKey || creds.private_key;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required for submitting bounty work');
  }
  
  const { finalizeEvent } = require('nostr-tools');
  
  // Submit bounty work as a Patch event (kind 1617)
  const unsignedEvent = {
    kind: 1617, // Patch
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', issueId],  // Reference to the issue
      ['r', prUrl],    // PR/branch URL
      ['status', 'open']
    ],
    content: evidence
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, issueId, prUrl };
}

/**
 * Star a repository (show appreciation)
 */
async function starRepo(options) {
  const {
    ownerPubkey,
    repoId,
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) privkey = creds.nsec || creds.secretKey || creds.private_key;
  }
  
  if (!privkey) {
    throw new Error('Private key required');
  }
  
  const { finalizeEvent } = require('nostr-tools');
  const pubkey = gittrNostr.getPublicKey(privkey);
  
  // Publish a like/reaction event
  const unsignedEvent = {
    kind: 7, // Kind 7 = reaction
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', ownerPubkey],
      ['a', `30617:${ownerPubkey}:${repoId}`]
    ],
    content: '⭐'
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, action: 'starred', repo: `${ownerPubkey}/${repoId}` };
}

/**
 * Unstar a repository
 */
async function unstarRepo(options) {
  const {
    ownerPubkey,
    repoId,
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) privkey = creds.nsec || creds.secretKey || creds.private_key;
  }
  
  if (!privkey) {
    throw new Error('Private key required');
  }
  
  const { finalizeEvent } = require('nostr-tools');
  const pubkey = gittrNostr.getPublicKey(privkey);
  
  // Publish removal of reaction (kind 7 with content empty or '-' to remove)
  const unsignedEvent = {
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['p', ownerPubkey],
      ['a', `30617:${ownerPubkey}:${repoId}`]
    ],
    content: ''  // Empty removes the reaction
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, action: 'unstarred', repo: `${ownerPubkey}/${repoId}` };
}

/**
 * Get repositories a user has starred
 */
async function listStars(options = {}) {
  const { pubkey, relays = gittrNostr.config.relays } = options;
  
  let targetPubkey = pubkey;
  if (!targetPubkey) {
    const creds = loadCredentials();
    targetPubkey = creds?.npub;
  }
  
  if (!targetPubkey) {
    return { error: 'No pubkey provided and no credentials found' };
  }
  
  // Query kind 7 events (reactions) that reference repo events
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [7],
      authors: [targetPubkey],
      '#a': ['30617*'],  // Any repo reference
      limit: 100
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  // Extract repo refs from the events
  const starredRepos = events
    .filter(e => e.content === '⭐')
    .map(e => {
      const repoTag = e.tags.find(t => t[0] === 'a' && t[1]?.startsWith('30617:'));
      const parts = repoTag?.[1]?.split(':') || [];
      return {
        ownerPubkey: parts[1],
        repoId: parts[2],
        starredAt: e.created_at
      };
    })
    .filter(r => r.ownerPubkey && r.repoId);
  
  return starredRepos;
}

/**
 * Watch a repository for updates (notifications)
 */
async function watchRepo(options) {
  const {
    ownerPubkey,
    repoId,
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) privkey = creds.nsec || creds.secretKey || creds.private_key;
  }
  
  if (!privkey) {
    throw new Error('Private key required');
  }
  
  const { finalizeEvent } = require('nostr-tools');
  
  // Use kind 10001 for follows (or create custom)
  // For now, we'll use a generic follow kind
  const unsignedEvent = {
    kind: 10001, // Kind 10001 = relay list metadata (used for follows here)
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['a', `30617:${ownerPubkey}:${repoId}`]
    ],
    content: `Watching ${repoId}`
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, action: 'watching', repo: `${ownerPubkey}/${repoId}` };
}

/**
 * Get trending/popular repositories
 */
async function getTrendingRepos(options = {}) {
  const { limit = 20, timeRange = 'week', relays = gittrNostr.config.relays } = options;
  
  // Get recent repos and sort by engagement
  // This is a simplified version - full implementation would track stars/PRs
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  const since = Math.floor(Date.now() / 1000);
  const period = timeRange === 'day' ? 86400 : timeRange === 'week' ? 604800 : 2592000;
  
  try {
    events = await pool.querySync(relays, {
      kinds: [30617],
      since: since - period,
      limit: limit * 3  // Get more to filter
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  // For now, return recently created repos as "trending"
  // A full implementation would count stars/PRs
  const repos = events.slice(0, limit).map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    return {
      id: tags.d,
      name: tags.name,
      description: tags.description,
      owner: event.pubkey,
      created_at: event.created_at,
      event
    };
  });
  
  return repos;
}

/**
 * Get contributors to a repository
 */
async function getRepoContributors(options) {
  const { ownerPubkey, repoId, relays = gittrNostr.config.relays } = options;
  
  if (!ownerPubkey || !repoId) {
    throw new Error('ownerPubkey and repoId required');
  }
  
  // Query for PRs and Issues to find contributors
  const pool = new (require('nostr-tools')).SimplePool();
  let prEvents = [];
  let issueEvents = [];
  
  try {
    // Get PR authors
    prEvents = await pool.querySync(relays, {
      kinds: [1618], // PR kind
      '#a': [`30617:${ownerPubkey}:${repoId}`],
      limit: 100
    });
    
    // Get issue authors  
    issueEvents = await pool.querySync(relays, {
      kinds: [1621], // Issue kind
      '#a': [`30617:${ownerPubkey}:${repoId}`],
      limit: 100
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  // Count contributions per pubkey
  const contributors = {};
  
  for (const e of prEvents) {
    contributors[e.pubkey] = contributors[e.pubkey] || { pubkey: e.pubkey, prs: 0, issues: 0 };
    contributors[e.pubkey].prs++;
  }
  
  for (const e of issueEvents) {
    contributors[e.pubkey] = contributors[e.pubkey] || { pubkey: e.pubkey, prs: 0, issues: 0 };
    contributors[e.pubkey].issues++;
  }
  
  // Add owner explicitly
  if (!contributors[ownerPubkey]) {
    contributors[ownerPubkey] = { pubkey: ownerPubkey, prs: 0, issues: 0, isOwner: true };
  } else {
    contributors[ownerPubkey].isOwner = true;
  }
  
  return Object.values(contributors).sort((a, b) => (b.prs + b.issues) - (a.prs + a.issues));
}

/**
 * Get branches for a repository
 */
async function getBranches(options) {
  const { ownerPubkey, repoId, relays = gittrNostr.config.relays } = options;
  
  if (!ownerPubkey || !repoId) {
    throw new Error('ownerPubkey and repoId required');
  }
  
  // Get repo state events (kind 30618) to find branches
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [30618],
      '#d': [repoId],
      authors: [ownerPubkey],
      limit: 20
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  // Extract refs/branches from state events
  const branches = new Set(['main', 'master']);
  
  for (const event of events) {
    for (const tag of event.tags) {
      if (tag[0].startsWith('refs/heads/')) {
        branches.add(tag[0].replace('refs/heads/', ''));
      } else if (tag[0] === 'ref') {
        branches.add(tag[1]);
      }
    }
  }
  
  return Array.from(branches).map(name => ({ name }));
}

/**
 * Get commit history for a repository
 */
async function getCommitHistory(options) {
  const { ownerPubkey, repoId, branch = 'main', limit = 50, relays = gittrNostr.config.relays } = options;
  
  // Get state events to find commits
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [30618],
      '#d': [repoId],
      authors: [ownerPubkey],
      limit: limit
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  const commits = [];
  
  for (const event of events) {
    for (const tag of event.tags) {
      if (tag[0].startsWith('refs/heads/') && tag[0].includes(branch)) {
        commits.push({
          sha: tag[1],
          ref: tag[0],
          timestamp: event.created_at,
          eventId: event.id
        });
      }
    }
  }
  
  return commits.slice(0, limit);
}

/**
 * Create a release (tag a version)
 */
async function createRelease(options) {
  const {
    ownerPubkey,
    repoId,
    version,        // e.g., "v1.0.0"
    tagName,        // e.g., "v1.0.0"
    targetCommit,   // Commit SHA to tag
    releaseNotes,   // Markdown release notes
    privkey,
    relays = gittrNostr.config.relays
  } = options;
  
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) privkey = creds.nsec || creds.secretKey || creds.private_key;
  }
  
  if (!privkey) {
    throw new Error('Private key required');
  }
  
  const { finalizeEvent } = require('nostr-tools');
  
  // Use kind 30617 with special tags for release
  const unsignedEvent = {
    kind: 30617,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', repoId],
      ['version', version || tagName],
      ['t', tagName || version],
      ...(targetCommit ? [['commit', targetCommit]] : [])
    ],
    content: releaseNotes || `Release ${version || tagName}`
  };
  
  const event = finalizeEvent(unsignedEvent, Buffer.from(privkey, 'hex'));
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    await pool.publish(relays, event);
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return { success: true, event, version: version || tagName };
}

/**
 * List releases for a repository
 */
async function listReleases(options) {
  const { ownerPubkey, repoId, limit = 20, relays = gittrNostr.config.relays } = options;
  
  if (!ownerPubkey || !repoId) {
    throw new Error('ownerPubkey and repoId required');
  }
  
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [30617],
      '#d': [repoId],
      authors: [ownerPubkey],
      '#t': ['*'],  // Tags with versions
      limit: limit
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  const releases = events.map(event => {
    const versionTag = event.tags.find(t => t[0] === 't');
    const commitTag = event.tags.find(t => t[0] === 'commit');
    return {
      version: versionTag?.[1],
      releaseNotes: event.content,
      commit: commitTag?.[1],
      created_at: event.created_at,
      eventId: event.id
    };
  }).filter(r => r.version);
  
  return releases;
}

/**
 * Explore repos by category/topic
 */
async function exploreRepos(options = {}) {
  const { 
    category,    // 'bitcoin', 'lightning', 'nostr', 'defi', etc.
    limit = 20, 
    relays = gittrNostr.config.relays 
  } = options;
  
  if (!category) {
    // Return popular categories if none specified
    return [
      { name: 'bitcoin', description: 'Bitcoin-related projects' },
      { name: 'lightning', description: 'Lightning Network projects' },
      { name: 'nostr', description: 'Nostr clients and tools' },
      { name: 'defi', description: 'Decentralized finance' },
      { name: 'ai', description: 'AI and machine learning' },
      { name: 'tools', description: 'Developer tools' },
      { name: 'cli', description: 'Command line tools' },
      { name: 'mobile', description: 'Mobile applications' }
    ];
  }
  
  // Search repos by topic
  const pool = new (require('nostr-tools')).SimplePool();
  let events = [];
  
  try {
    events = await pool.querySync(relays, {
      kinds: [30617],
      search: category,
      limit: limit
    });
  } finally {
    try { if (relays && relays.length) pool.close(relays); } catch (_) { /* ignore */ }
  }
  
  return events.map(event => {
    const tags = Object.fromEntries(event.tags.filter(t => t.length >= 2));
    return {
      id: tags.d,
      name: tags.name,
      description: tags.description,
      owner: event.pubkey,
      web: event.tags.filter(t => t[0] === 'web').map(t => t[1]),
      clone: event.tags.filter(t => t[0] === 'clone').map(t => t[1]),
      created_at: event.created_at
    };
  });
}

module.exports = {
  loadCredentials,
  createRepo,
  getRepo,
  searchRepos,
  listBounties,
  forkRepo,
  myRepos,
  addCollaborator,
  getFile,
  mirrorRepo,
  // New features from gittr-shell and gittr.space
  submitBounty,
  starRepo,
  unstarRepo,
  listStars,
  watchRepo,
  getTrendingRepos,
  getRepoContributors,
  getBranches,
  getCommitHistory,
  createRelease,
  listReleases,
  exploreRepos
};
