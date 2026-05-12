// gittr-agent.js - Agent-friendly convenience functions for gittr-mcp
// These wrap the core functions with better defaults, auto-credentials, and compound operations

const gittrNostr = require('./gittr-nostr.js');
const bridgeApi = require('./gittr-bridge-api.js');
const { withAgentHints, suggestNextStepsForTool } = require('./gittr-agent-outcomes.js');
const { privkeyToUint8Array } = require('./gittr-keys.js');
const { nip19 } = require('nostr-tools');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile: execFileCb } = require('child_process');
const { promisify } = require('util');
const execFile = promisify(execFileCb);

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

/** Hex pubkey + npub + masked secret summary for agents (no private key in response). */
function describeAgentAuth() {
  const creds = loadCredentials();
  if (!creds) {
    return {
      configured: false,
      hint: 'Set .nostr-keys.json (from repo template) or pass privkey on each tool. Optional: GITTR_LNBITS_URL, GITTR_LNBITS_ADMIN_KEY for bounties.',
      nextSteps: [
        'Run `cp .nostr-keys.json.example .nostr-keys.json`, add `nsec` (or hex secret), keep the file local (gitignored). Or use `~/.nostr-identity.json`.',
        'Or pass `privkey` on each mutating tool (pushToBridge, createRepo, mergePullRequest, …).',
      ],
      whatHappensNext: 'Once configured, mutating calls will sign bridge challenges and Nostr events.',
    };
  }
  const pk = creds.nsec || creds.secretKey || creds.private_key;
  if (!pk) {
    return {
      configured: false,
      hint: 'Credential file missing private key (nsec / secretKey).',
      nextSteps: ['Add nsec or hex private key to your keys file, or pass privkey per call.'],
    };
  }
  const hex = gittrNostr.getPublicKey(pk);
  const { nip19 } = require('nostr-tools');
  let npub = creds.npub;
  if (!npub || !npub.startsWith('npub')) {
    try {
      npub = nip19.npubEncode(hex);
    } catch (_) {
      npub = null;
    }
  }
  return {
    configured: true,
    pubkeyHex: hex,
    npub,
    bridgeUrl: gittrNostr.config.bridgeUrl,
    relayCount: (gittrNostr.config.relays || []).length,
    agentSummary: 'Identity loaded; this pubkey is used for bridge auth and Nostr signing when privkey is not passed explicitly.',
    nextSteps: [
      'Use this pubkeyHex/npub as ownerPubkey when calling bridge APIs for your repos.',
      'For bounties, set GITTR_LNBITS_URL and GITTR_LNBITS_ADMIN_KEY if you need invoices.',
    ],
  };
}

function relayToHttpsDomain(relayUrl) {
  try {
    const u = new URL(relayUrl);
    return u.hostname;
  } catch (_) {
    return null;
  }
}

function buildRelayPublishSet(requestedRelays = []) {
  const safeFallbacks = [
    'wss://ngit-relay.nostrver.se',
    'wss://relay.ngit.dev',
    'wss://git.shakespeare.diy',
  ];
  const merged = Array.from(new Set([
    ...(Array.isArray(requestedRelays) ? requestedRelays : []),
    ...safeFallbacks,
  ]));
  return merged
    .filter((r) => !String(r).includes('noderunners.network'))
    .slice(0, 4); // cap to avoid broad relay fan-out
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
  const pushCostSats = options.pushCostSats;
  let privkey = options.privkey;
  let pubkey = options.pubkey;
  const relays = options.relays || gittrNostr.config.relays;
  const requireDiscoverable = options.requireDiscoverable !== false;
  const discoverabilityTimeoutMs = Number(options.discoverabilityTimeoutMs || 12000);
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
  
  // Derive hex pubkey from privkey for URLs and tags (never use raw npub in clone paths)
  let pubkeyHex = pubkey && pubkey.startsWith('npub') ? null : pubkey;
  if (!pubkeyHex || !/^[0-9a-f]{64}$/i.test(pubkeyHex)) {
    pubkeyHex = gittrNostr.getPublicKey(privkey);
  }
  pubkey = pubkeyHex;
  
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
  
  // Step 2: Build user-facing URLs (npub-first) + announcement clone URLs aligned to relay domains.
  const ownerNpub = nip19.npubEncode(pubkey);
  const userCloneUrls = [
    `https://git.gittr.space/${ownerNpub}/${name}.git`,
    `https://git.gittr.space/${pubkey}/${name}.git`,
    `https://relay.ngit.dev/${pubkey}/${name}.git`
  ];
  // Keep relay targeting deterministic: publish only to explicitly provided relays.
  // Cross-relay policy differences can reject announcements when clone/relay tags do not align.
  const announceRelays = buildRelayPublishSet(relays);
  // Publish clone tags that match listed relay domains, otherwise many relays reject 30617.
  const relayDomains = (Array.isArray(announceRelays) ? announceRelays : [])
    .map(relayToHttpsDomain)
    .filter(Boolean);
  const announcementCloneUrls = Array.from(new Set(relayDomains.map((d) => `https://${d}/${pubkey}/${name}.git`)));

  // Include web URLs in announcement; npub-first matches gittr UI convention.
  const webUrls = [
    `https://gittr.space/${ownerNpub}/${name}`,
    `https://gittr.space/${pubkey}/${name}`
  ];
  
  // Step 3: Publish announcement (optional push_cost_sats for pay-to-push; synced to bridge DB next)
  let announceResult = null;
  let announceError = null;
  try {
    announceResult = await gittrNostr.publishRepoAnnouncement({
      repoId: name,
      name,
      description,
      web: webUrls,
      clone: announcementCloneUrls.length > 0 ? announcementCloneUrls : [`https://relay.ngit.dev/${pubkey}/${name}.git`],
      privkey,
      relays: announceRelays.length > 0 ? announceRelays : ['wss://relay.ngit.dev'],
      pushCostSats,
    });
  } catch (e) {
    announceError = e.message || String(e);
  }

  let pushPolicySync = null;
  try {
    if (announceResult?.event) {
      pushPolicySync = await bridgeApi.syncRepoPushPolicy(
        announceResult.event,
        gittrNostr.config.bridgeUrl
      );
    } else {
      pushPolicySync = { ok: false, error: 'Announcement event missing; push policy sync skipped' };
    }
  } catch (e) {
    pushPolicySync = { ok: false, error: e.message };
  }

  // Send announcement directly to bridge API (same strategy as ngit UI) for faster indexing.
  let bridgeEventForward = null;
  try {
    if (announceResult?.event) {
      bridgeEventForward = await bridgeApi.sendEventToBridge(
        announceResult.event,
        gittrNostr.config.bridgeUrl
      );
    }
  } catch (e) {
    bridgeEventForward = { ok: false, error: e.message };
  }
  
  // Step 4: Publish state (if we pushed files) - wait for announcement to be accepted first
  let stateResult = null;
  if (pushResult && pushResult.refs) {
    // Wait for relay to accept the announcement before publishing state
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Retry state publish up to 3 times if it fails
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        stateResult = await gittrNostr.publishRepoState({
          repoId: name,
          refs: pushResult.refs,
          privkey,
          relays: announceRelays
        });
        break; // Success
      } catch (e) {
        console.log(`State publish attempt ${attempt} failed:`, e.message);
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  // Step 5: Verify relay discoverability (repo announcement accepted and queryable)
  let discoverable = false;
  let discoverabilityCheckedRelays = announceRelays.length > 0 ? announceRelays : ['wss://relay.ngit.dev'];
  let discoverabilityError = null;
  const started = Date.now();
  while (Date.now() - started < discoverabilityTimeoutMs) {
    try {
      const found = await getRepo({ repoId: name, ownerPubkey: pubkey, relays: discoverabilityCheckedRelays });
      if (found && !found.error) {
        discoverable = true;
        break;
      }
    } catch (e) {
      discoverabilityError = e.message || String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (requireDiscoverable && !discoverable) {
    const effectiveAnnouncementError = announceError || 'Announcement not queryable on target relays after publish';
    return withAgentHints(
      {
        success: false,
        error: 'Repository push succeeded on bridge, but repo announcement is not discoverable on relays yet.',
        repoId: name,
        name,
        description,
        cloneUrl: userCloneUrls[0],
        webUrl: webUrls[0],
        pushedFiles: pushResult?.pushedFiles || 0,
        commit: pushResult?.refs?.[0]?.commit,
        announcementEvent: announceResult?.event,
        announcementError: effectiveAnnouncementError,
        stateEvent: stateResult?.event,
        pushPolicySync,
        bridgeEventForward,
        pubkey,
        discoverable,
        discoverabilityError,
        discoverabilityCheckedRelays,
        hint: 'Retry discovery later or publish on additional relays. Issues/PRs depend on accepted repository announcement.',
      },
      {
        reason: 'Relays have not yet accepted or replicated the kind 30617 announcement, or filters/timeouts missed it.',
        nextSteps: [
          'Wait 30–120s and call listRepos or getRepo with the same relays used in createRepo.',
          'Widen relays (e.g. wss://relay.ngit.dev, wss://ngit-relay.nostrver.se, wss://git.shakespeare.diy) and retry publishRepoAnnouncement if needed.',
          'Bridge already has files: you may use bridgeListRefs / bridgeListFiles while waiting for Nostr visibility.',
          'Do not create issues/PRs until the repo announcement is discoverable, or relays may reject child events.',
        ],
      }
    );
  }

  if (!announceResult?.event) {
    return withAgentHints(
      {
        success: false,
        error: 'Repository announcement failed or was not accepted/queryable on relays.',
        repoId: name,
        name,
        description,
        cloneUrl: userCloneUrls[0],
        webUrl: webUrls[0],
        pushedFiles: pushResult?.pushedFiles || 0,
        commit: pushResult?.refs?.[0]?.commit,
        announcementEvent: null,
        announcementError: announceError || 'Missing announcement event',
        stateEvent: stateResult?.event,
        pushPolicySync,
        bridgeEventForward,
        pubkey,
        discoverable,
        discoverabilityError,
        discoverabilityCheckedRelays,
      },
      {
        reason: announceError || '30617 publish or visibility step failed.',
        nextSteps: [
          'Read announcementError in this response for relay rejection text (clone/relays tag shape, rate limits).',
          'Fix clone/relays alignment per README, wait if rate-limited, then retry createRepo or publishRepoAnnouncement.',
          'If push succeeded, data is on the bridge; you can still importRemoteToBridge or read via bridge APIs.',
        ],
      }
    );
  }

  return withAgentHints(
    {
      success: true,
      repoId: name,
      name,
      description,
      cloneUrl: userCloneUrls[0],
      webUrl: webUrls[0],
      pushedFiles: pushResult?.pushedFiles || 0,
      commit: pushResult?.refs?.[0]?.commit,
      announcementEvent: announceResult?.event,
      announcementError: announceError,
      stateEvent: stateResult?.event,
      pushPolicySync,
      bridgeEventForward,
      pubkey,
      discoverable,
      discoverabilityError,
      discoverabilityCheckedRelays,
    },
    {
      agentSummary: `Repo "${name}" is on the bridge and announced on Nostr (discoverable=${discoverable}).`,
      whatHappensNext: 'Relays and gittr.space will index the announcement; downstream issues/PRs can be created once visible.',
      nextSteps: [
        `Open webUrl in a browser or share cloneUrl for git clone.`,
        `Next: createIssue / createPR using owner pubkey and repoId "${name}" with the same relay set when possible.`,
        pushPolicySync && pushPolicySync.ok === false
          ? 'Push policy sync had a problem; inspect pushPolicySync in this response.'
          : null,
      ].filter(Boolean),
    }
  );
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
    return withAgentHints(
      { error: 'Repository not found', repoId, ownerPubkey },
      {
        reason: 'No kind 30617 on the queried relays matched this repoId (and optional owner filter).',
        nextSteps: [
          ownerPubkey
            ? 'Confirm repoId spelling; try listRepos with this ownerPubkey and the same relays.'
            : 'Pass ownerPubkey (hex or npub) to narrow results, or use resolveRepoByNostrId.',
          'If the repo was just created, wait for relay propagation and retry.',
        ],
      }
    );
  }
  
  return match;
}

/**
 * Resolve repo by Nostr identity (npub or hex) + repo name.
 * Returns cloneUrl (prefer git.gittr.space), cloneUrls, relays for location-agnostic agents.
 */
async function resolveRepoByNostrId(ownerNpubOrHex, repoId, options = {}) {
  const { relays = gittrNostr.config.relays } = options;
  let ownerPubkey = ownerNpubOrHex;
  if (ownerNpubOrHex.startsWith('npub')) {
    try {
      const { nip19 } = require('nostr-tools');
      const decoded = nip19.decode(ownerNpubOrHex);
      if (decoded.type === 'npub' && decoded.data) {
        ownerPubkey = typeof decoded.data === 'string' ? decoded.data : Buffer.from(decoded.data).toString('hex');
      }
    } catch (e) {
      return { error: `Invalid npub: ${e.message}`, ownerNpubOrHex, repoId };
    }
  } else if (!/^[0-9a-f]{64}$/i.test(ownerNpubOrHex)) {
    return { error: 'ownerNpubOrHex must be npub (NIP-19) or 64-char hex', ownerNpubOrHex, repoId };
  }
  const repo = await getRepo({ ownerPubkey, repoId, relays });
  if (repo.error) return repo;
  const cloneUrls = repo.clone && repo.clone.length ? repo.clone : [];
  const cloneUrl = cloneUrls.find(u => u.includes('git.gittr.space')) || cloneUrls[0] || null;
  return {
    ...repo,
    cloneUrl,
    cloneUrls,
    relays: repo.relays || relays
  };
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
  const pk = creds && (creds.nsec || creds.secretKey || creds.private_key);
  if (!pk) {
    return { error: 'No credentials found. Ensure .nostr-keys.json exists with a private key.' };
  }
  const pubkeyHex = gittrNostr.getPublicKey(pk);
  return gittrNostr.listRepos({ pubkey: pubkeyHex, limit: 100, relays });
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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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
  
  const base = gittrNostr.config.bridgeUrl || 'https://gittr.space';
  try {
    const r = await bridgeApi.bridgeGetFileContent(
      { ownerPubkey, repo: repoId, path: filePath, branch },
      base
    );
    if (r.ok && r.content != null && !r.error) {
      return {
        content: typeof r.content === 'string' ? r.content : String(r.content),
        path: filePath,
        repo: repoId,
        branch,
        source: 'bridge',
        contentType: r.contentType,
      };
    }
  } catch (_) { /* fall through */ }

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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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
    const pk = creds && (creds.nsec || creds.secretKey || creds.private_key);
    targetPubkey = pk ? gittrNostr.getPublicKey(pk) : null;
  } else if (targetPubkey.startsWith('npub')) {
    const { nip19 } = require('nostr-tools');
    try {
      const d = nip19.decode(targetPubkey);
      targetPubkey = typeof d.data === 'string' ? d.data : null;
    } catch (_) {
      return { error: 'Invalid npub' };
    }
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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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
  
  const event = finalizeEvent(unsignedEvent, privkeyToUint8Array(privkey));
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

/** Import / refresh a remote git URL into the gittr bridge working tree (server-side git clone). */
async function importRemoteToBridge(options) {
  const { cloneUrl, ownerPubkey, repo, bridgeUrl } = options;
  return bridgeApi.bridgeImportRepo(
    { cloneUrl, ownerPubkey, repo },
    bridgeUrl || gittrNostr.config.bridgeUrl
  );
}

/** Fetch a single issue event by hex id from relays. */
async function getIssueById(options) {
  const { issueId, relays = gittrNostr.config.relays } = options;
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    const evs = await pool.querySync(relays, { kinds: [1621], ids: [issueId], limit: 1 });
    if (!evs.length) {
      return withAgentHints(
        { error: 'Issue not found on queried relays', issueId },
        {
          reason: 'No kind 1621 with this id was returned from the relay query (wrong id, relays, or propagation delay).',
          nextSteps: [
            'Retry after 30–60s; widen or align relays with those used when the issue was created.',
            'Call listIssues for the repo to see current issue ids.',
          ],
        }
      );
    }
    const event = evs[0];
    const tags = Object.fromEntries(event.tags.filter((t) => t.length >= 2));
    return {
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      subject: tags.subject || '',
      content: event.content,
      labels: event.tags.filter((t) => t[0] === 't').map((t) => t[1]),
      event,
    };
  } finally {
    try {
      if (relays && relays.length) pool.close(relays);
    } catch (_) { /* ignore */ }
  }
}

/** All URL values from NIP-34 tags (supports single tag with multiple values). */
function tagValuesAll(event, tagName) {
  const out = [];
  for (const t of event.tags || []) {
    if (t[0] === tagName) {
      for (let i = 1; i < t.length; i++) {
        if (t[i]) out.push(t[i]);
      }
    }
  }
  return out;
}

/** Fetch a single PR event by id (kind 1618). */
async function getPullRequestById(options) {
  const { prId, relays = gittrNostr.config.relays } = options;
  const pool = new (require('nostr-tools')).SimplePool();
  try {
    const evs = await pool.querySync(relays, { kinds: [1618], ids: [prId], limit: 1 });
    if (!evs.length) {
      return withAgentHints(
        { error: 'PR not found on queried relays', prId },
        {
          reason: 'No kind 1618 with this id was returned from the relay query (wrong id, relays, or propagation delay).',
          nextSteps: [
            'Retry after 30–60s; widen or align relays with those used when the PR was created.',
            'Call listPRs for the repo to see current PR event ids.',
          ],
        }
      );
    }
    const event = evs[0];
    const tags = Object.fromEntries(event.tags.filter((t) => t.length >= 2));
    return {
      id: event.id,
      author: event.pubkey,
      created_at: event.created_at,
      subject: tags.subject || '',
      content: event.content,
      commit: tags.c,
      branchName: tags['branch-name'],
      clone: tagValuesAll(event, 'clone'),
      event,
    };
  } finally {
    try {
      if (relays && relays.length) pool.close(relays);
    } catch (_) { /* ignore */ }
  }
}

/** Convenience wrapper: publish status 1632 (closed) for issue. */
async function closeIssue(options) {
  const { issueId, ownerPubkey, repoId, content = 'Closed via MCP', privkey, relays = gittrNostr.config.relays } = options;
  if (!issueId || !ownerPubkey || !repoId) {
    return {
      success: false,
      error: 'issueId, ownerPubkey, repoId are required',
      reason: 'Cannot publish status without issue id, repo owner, and repo slug.',
      nextSteps: ['Pass issueId (1621 event id), ownerPubkey, repoId, and privkey.'],
    };
  }
  const issue = await getIssueById({ issueId, relays });
  if (issue.error) {
    return { success: false, error: issue.error, nextSteps: issue.nextSteps, reason: issue.reason };
  }
  let out;
  try {
    out = await gittrNostr.publishStatusForRoot({
      statusKind: 1632,
      rootEventId: issueId,
      ownerPubkey,
      rootEventAuthor: issue.author,
      repoId,
      content,
      privkey,
      relays,
    });
  } catch (e) {
    return {
      success: false,
      error: e.message,
      reason: 'Relays rejected the status event or signing failed.',
      nextSteps: suggestNextStepsForTool('publishStatusForRoot', e.message),
    };
  }
  return withAgentHints(out, {
    agentSummary: `Published kind 1632 (closed) for issue ${issueId.slice(0, 8)}…`,
    whatHappensNext: 'Relays and Gittr UI should show closed after indexing; refresh may be delayed.',
    nextSteps: [
      'Wait and re-query listIssues or open the issue page; if still open, check relay rejection logs.',
      'If close was rejected by relays, ensure repo 30617 is accepted and signer is allowed.',
    ],
  });
}

/** Convenience wrapper: publish status 1630 (open) for issue. */
async function reopenIssue(options) {
  const { issueId, ownerPubkey, repoId, content = 'Reopened via MCP', privkey, relays = gittrNostr.config.relays } = options;
  if (!issueId || !ownerPubkey || !repoId) {
    return {
      success: false,
      error: 'issueId, ownerPubkey, repoId are required',
      reason: 'Cannot publish status without issue id, repo owner, and repo slug.',
      nextSteps: ['Pass issueId, ownerPubkey, repoId, and privkey.'],
    };
  }
  const issue = await getIssueById({ issueId, relays });
  if (issue.error) {
    return { success: false, error: issue.error, nextSteps: issue.nextSteps, reason: issue.reason };
  }
  let out;
  try {
    out = await gittrNostr.publishStatusForRoot({
      statusKind: 1630,
      rootEventId: issueId,
      ownerPubkey,
      rootEventAuthor: issue.author,
      repoId,
      content,
      privkey,
      relays,
    });
  } catch (e) {
    return {
      success: false,
      error: e.message,
      reason: 'Relays rejected the status event or signing failed.',
      nextSteps: suggestNextStepsForTool('publishStatusForRoot', e.message),
    };
  }
  return withAgentHints(out, {
    agentSummary: `Published kind 1630 (open) for issue ${issueId.slice(0, 8)}…`,
    whatHappensNext: 'UI should return to open after relay/Gittr indexing.',
    nextSteps: ['Refresh issue page or listIssues after a short delay.'],
  });
}

/** Convenience wrapper: publish status 1631 (merged/applied) for PR root event. */
async function markPullRequestMerged(options) {
  const {
    prId,
    ownerPubkey,
    repoId,
    mergeCommitId,
    content = 'Merged via MCP',
    privkey,
    relays = gittrNostr.config.relays,
  } = options;
  if (!prId || !ownerPubkey || !repoId) {
    return {
      success: false,
      error: 'prId, ownerPubkey, repoId are required',
      reason: 'Nostr-only merge status needs PR id, repo owner, and repo slug.',
      nextSteps: [
        'For full git merge + bridge push, use mergePullRequest instead.',
        'Otherwise pass prId (1618 id), ownerPubkey, repoId, privkey; optional mergeCommitId if known.',
      ],
    };
  }
  const pr = await getPullRequestById({ prId, relays });
  if (pr.error) {
    return { success: false, error: pr.error, nextSteps: pr.nextSteps, reason: pr.reason };
  }
  let out;
  try {
    out = await gittrNostr.publishStatusForRoot({
      statusKind: 1631,
      rootEventId: prId,
      ownerPubkey,
      rootEventAuthor: pr.author,
      repoId,
      content,
      mergeCommitId,
      privkey,
      relays,
    });
  } catch (e) {
    return {
      success: false,
      error: e.message,
      reason: 'Relays rejected the merge status or signing failed.',
      nextSteps: suggestNextStepsForTool('publishStatusForRoot', e.message),
    };
  }
  return withAgentHints(out, {
    agentSummary: `Published kind 1631 (merged/applied) for PR ${prId.slice(0, 8)}… (Nostr signal only unless you already merged git).`,
    whatHappensNext: 'Gittr should show merged when UI trusts this status and any required git state exists.',
    nextSteps: mergeCommitId
      ? ['Refresh PR page after delay; verify bridge refs match if UI requires git merge.']
      : [
          'Prefer mergePullRequest for real merge + bridge commit, then UI stays consistent.',
          'If you only need Nostr signal, consider passing mergeCommitId from bridgeListRefs after a manual merge.',
        ],
  });
}

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', LANG: 'C' };
const BRIDGE_PUSH_BUDGET_BYTES = 24 * 1024 * 1024;

async function collectMergedFilesForBridge(workDir) {
  const { stdout } = await execFile('git', ['-C', workDir, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: GIT_ENV,
  });
  const names = stdout.split('\0').filter(Boolean);
  const files = [];
  let total = 0;
  for (const name of names) {
    if (!name || name.includes('..')) continue;
    const full = path.join(workDir, name);
    let st;
    try {
      st = await fsPromises.stat(full);
    } catch (_) {
      continue;
    }
    if (!st.isFile()) continue;
    const buf = await fsPromises.readFile(full);
    total += buf.length;
    if (total > BRIDGE_PUSH_BUDGET_BYTES) {
      throw new Error(`Merged working tree exceeds ~${BRIDGE_PUSH_BUDGET_BYTES / (1024 * 1024)}MB bridge push limit`);
    }
    const isBinary = buf.includes(0);
    const rel = name.split(path.sep).join('/');
    if (isBinary) files.push({ path: rel, content: buf.toString('base64'), isBinary: true });
    else files.push({ path: rel, content: buf.toString('utf8') });
  }
  return files;
}

async function gitTry(cmd, args, opts = {}) {
  return execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, env: GIT_ENV, ...opts });
}

/**
 * Full PR merge for agents: clone base repo, fetch PR head (from PR clone URLs + branch or tip commit),
 * merge into base branch, push merged tree to gittr bridge, publish 30618 + 1631 on Nostr.
 * Requires `git` on PATH. Set GITTR_MERGE_CLONE_DEPTH (default 80) to tune shallow clones.
 * Always returns an object (success true/false) with agent-oriented nextSteps / reason — does not throw.
 */
async function mergePullRequest(options) {
  const {
    prId,
    ownerPubkey,
    repoId: repoIdArg,
    privkey,
    baseBranch: baseBranchOpt,
    mergeMessage,
    relays: relaysOpt,
    skipNostrStatus = false,
  } = options || {};

  if (process.env.GITTR_DISABLE_GIT_MERGE === '1') {
    return {
      success: false,
      error: 'Git merge disabled (GITTR_DISABLE_GIT_MERGE=1).',
      reason: 'Local git merge is turned off by environment flag.',
      nextSteps: [
        'Unset GITTR_DISABLE_GIT_MERGE, or use markPullRequestMerged only after merging by other means.',
      ],
    };
  }

  if (!prId || !ownerPubkey || !privkey) {
    return {
      success: false,
      error: 'mergePullRequest requires prId, ownerPubkey, privkey',
      reason: 'Missing PR id, repo owner identity, or signing key.',
      nextSteps: [
        'Pass prId (kind 1618 event id), ownerPubkey (hex/npub of repo owner), privkey, optional repoId if ambiguous.',
      ],
    };
  }

  let tmpRoot = null;
  try {
    const ownerHex = await gittrNostr.resolveRepoOwnerHex(ownerPubkey);
    const relays = buildRelayPublishSet(relaysOpt || gittrNostr.config.relays);
    const pr = await getPullRequestById({ prId, relays: relaysOpt || gittrNostr.config.relays });
    if (pr.error) {
      return {
        success: false,
        error: pr.error,
        reason: pr.reason || 'Could not load PR from relays.',
        nextSteps: pr.nextSteps || suggestNextStepsForTool('mergePullRequest', pr.error),
        prId,
      };
    }

    const aVals = tagValuesAll(pr.event, 'a');
    const aTag = aVals[0] || pr.event.tags.find((t) => t[0] === 'a')?.[1];
    if (!aTag) {
      return {
        success: false,
        error: 'PR event missing a-tag (30617:owner:repo)',
        reason: 'Malformed or incomplete PR event; NIP-34 expects an a-tag pointing at the repo.',
        nextSteps: ['Inspect the raw PR event on relays; recreate PR with createPR if tags are wrong.'],
        prId,
      };
    }
    const am = /^30617:([0-9a-f]{64}):(.+)$/i.exec(aTag);
    if (!am) {
      return {
        success: false,
        error: `Invalid PR a-tag: ${aTag}`,
        reason: 'a-tag must look like 30617:<64-hex-pubkey>:<repoId>.',
        nextSteps: ['Fix PR event or pass ownerPubkey/repoId that match a real announcement.'],
        prId,
      };
    }
    const repoOwnerHex = am[1].toLowerCase();
    const repoId = repoIdArg || am[2];
    if (repoOwnerHex !== ownerHex) {
      return {
        success: false,
        error: `ownerPubkey does not match PR target repo owner (PR targets ${repoOwnerHex.slice(0, 12)}…, you passed ${ownerHex.slice(0, 12)}…)`,
        reason: 'The key you passed is not the owner of the repository this PR targets.',
        nextSteps: [
          `Use ownerPubkey derived from the PR a-tag (repo owner is ${repoOwnerHex.slice(0, 16)}…).`,
          'Or use the same npub/hex that owns the target repo on gittr.',
        ],
        prId,
        repoId,
      };
    }

    const headBranch = pr.branchName || 'main';
    const tipCommit = pr.commit && /^[0-9a-f]{7,40}$/i.test(pr.commit) ? pr.commit.toLowerCase() : null;
    const cloneUrls = [...new Set((pr.clone || []).filter(Boolean))];
    if (!cloneUrls.length) {
      return {
        success: false,
        error: 'PR has no clone URLs; cannot fetch head for merge',
        reason: 'PR 1618 needs at least one clone URL where the head branch/commit exists.',
        nextSteps: [
          'Publish an updated PR (or 1619 update) with correct clone tag(s) pointing at the fork/branch.',
          'If this was a test PR, recreate createPR with cloneUrls matching the repo that has the commits.',
        ],
        prId,
        repoId,
      };
    }

    let baseBranch = baseBranchOpt || 'main';
    const ownerNpub = nip19.npubEncode(ownerHex);
    const baseCloneCandidates = [
      `https://git.gittr.space/${ownerNpub}/${repoId}.git`,
      `https://git.gittr.space/${ownerHex}/${repoId}.git`,
      `https://relay.ngit.dev/${ownerHex}/${repoId}.git`,
      `https://ngit-relay.nostrver.se/${ownerHex}/${repoId}.git`,
    ];

    const depth = Math.max(10, Math.min(500, Number(process.env.GITTR_MERGE_CLONE_DEPTH || 80)));
    tmpRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'gittr-mcp-merge-'));
    const workDir = path.join(tmpRoot, 'work');

    let cloned = false;
    let lastCloneErr = null;
    for (const url of baseCloneCandidates) {
      try {
        await gitTry('git', ['clone', '--depth', String(depth), url, workDir]);
        cloned = true;
        break;
      } catch (e) {
        lastCloneErr = e;
      }
    }
    if (!cloned) {
      return {
        success: false,
        error: `Could not clone base repository (tried git.gittr.space and relays). Last error: ${lastCloneErr?.message || lastCloneErr}`,
        reason: 'Base repo is not readable from HTTPS git endpoints (missing on server, network, or never pushed to bridge).',
        nextSteps: [
          'Confirm bridgeRepoExists and pushToBridge created the repo; open git.gittr.space clone URL in browser.',
          'Try importRemoteToBridge or push files again, then retry mergePullRequest.',
        ],
        prId,
        repoId,
      };
    }

    let resolvedBase = baseBranch;
    try {
      await gitTry('git', ['-C', workDir, 'checkout', resolvedBase]);
    } catch (_) {
      try {
        await gitTry('git', ['-C', workDir, 'checkout', 'main']);
        resolvedBase = 'main';
      } catch (e2) {
        try {
          await gitTry('git', ['-C', workDir, 'checkout', 'master']);
          resolvedBase = 'master';
        } catch (e3) {
          return {
            success: false,
            error: `Could not checkout base branch ${baseBranch}: ${e2?.message || e3?.message}`,
            reason: 'The cloned repo has no branch matching baseBranch/main/master.',
            nextSteps: [
              'Pass baseBranch that exists on the remote (see bridgeListRefs).',
              'Ensure the default branch on the bridge matches what you expect.',
            ],
            prId,
            repoId,
          };
        }
      }
    }

    let merged = false;
    let mergeErr = null;
    for (const headUrl of cloneUrls) {
      try {
        await gitTry('git', ['-C', workDir, 'fetch', '--depth', String(depth), headUrl, `${headBranch}:refs/gittr-merge-head`]);
        await gitTry('git', ['-C', workDir, 'merge', 'refs/gittr-merge-head', '--no-ff', '-m', mergeMessage || `Merge pull request ${prId.slice(0, 8)}`]);
        merged = true;
        break;
      } catch (e) {
        mergeErr = e;
      }
    }
    if (!merged && tipCommit) {
      for (const headUrl of cloneUrls) {
        try {
          await gitTry('git', ['-C', workDir, 'fetch', '--depth', String(depth), headUrl, tipCommit]);
          await gitTry('git', ['-C', workDir, 'merge', 'FETCH_HEAD', '--no-ff', '-m', mergeMessage || `Merge pull request ${prId.slice(0, 8)}`]);
          merged = true;
          break;
        } catch (e) {
          mergeErr = e;
        }
      }
    }
    if (!merged) {
      return {
        success: false,
        error: `Git merge failed (fetch branch "${headBranch}" or tip ${tipCommit || 'n/a'}). ${mergeErr?.message || ''} Ensure PR clone URL points at the repo/branch that contains the PR commits (wrong clone URL is a common cause).`,
        reason: 'Could not fetch or merge the PR head; clone URL, branch name, or commit tip does not exist on the remote.',
        nextSteps: [
          'Inspect PR clone tags vs actual repo: head may live on a different repo than base (fix createPR cloneUrls).',
          'Increase GITTR_MERGE_CLONE_DEPTH if history is deeper than the shallow fetch.',
          'Resolve merge conflicts manually with git, then pushToBridge + markPullRequestMerged with mergeCommitId.',
        ],
        prId,
        repoId,
        headBranch,
        tipCommit,
        cloneUrlsTried: cloneUrls,
      };
    }

    let files;
    try {
      files = await collectMergedFilesForBridge(workDir);
    } catch (e) {
      return {
        success: false,
        error: e.message,
        reason: 'Reading merged files failed or tree exceeds bridge size budget.',
        nextSteps: suggestNextStepsForTool('mergePullRequest', e.message),
        prId,
        repoId,
      };
    }

    let pushResult;
    try {
      pushResult = await gittrNostr.pushToBridge({
        ownerPubkey: ownerHex,
        repo: repoId,
        branch: resolvedBase,
        files,
        commitMessage: mergeMessage || `Merge PR ${prId.slice(0, 8)}`,
        privkey,
      });
    } catch (e) {
      return {
        success: false,
        error: e.message,
        reason: 'Bridge rejected the push (auth, paywall, size, or validation).',
        nextSteps: suggestNextStepsForTool('pushToBridge', e.message),
        prId,
        repoId,
      };
    }

    let bridgeCommit = pushResult?.refs?.[0]?.commit || null;
    if (!bridgeCommit) {
      const refSnap = await bridgeApi.bridgeListRefs(
        { ownerPubkey: ownerHex, repo: repoId },
        gittrNostr.config.bridgeUrl
      );
      bridgeCommit = refSnap?.refs?.find((x) => x.ref === `refs/heads/${resolvedBase}`)?.commit || null;
    }

    let stateResult = null;
    let stateError = null;
    if (pushResult?.refs?.length) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          stateResult = await gittrNostr.publishRepoState({
            repoId,
            refs: pushResult.refs,
            privkey,
            relays,
          });
          break;
        } catch (e) {
          stateError = e.message;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 2500));
        }
      }
    }

    try {
      if (stateResult?.event) {
        await bridgeApi.sendEventToBridge(stateResult.event, gittrNostr.config.bridgeUrl);
      }
    } catch (_) { /* best-effort */ }

    let statusResult = null;
    let statusError = null;
    if (!skipNostrStatus && bridgeCommit) {
      try {
        statusResult = await gittrNostr.publishStatusForRoot({
          statusKind: 1631,
          rootEventId: prId,
          ownerPubkey: ownerHex,
          rootEventAuthor: pr.author,
          repoId,
          content: mergeMessage || `Merged PR ${prId}`,
          mergeCommitId: bridgeCommit,
          privkey,
          relays,
        });
        try {
          await bridgeApi.sendEventToBridge(statusResult.event, gittrNostr.config.bridgeUrl);
        } catch (_) { /* best-effort */ }
      } catch (e) {
        statusError = e.message;
      }
    }

    const nextSteps = [
      `Confirm bridge tip: bridgeListRefs(ownerPubkey, "${repoId}") for refs/heads/${resolvedBase}.`,
      'Wait 30–120s and refresh the PR page on gittr.space (UI can lag relays).',
    ];
    if (stateError) {
      nextSteps.push(`publishRepoState failed after push: ${stateError}. Retry publishRepoState with the same refs or wait for relay acceptance of 30617.`);
    }
    if (statusError) {
      nextSteps.push(`Merged on bridge but Nostr 1631 failed: ${statusError}. Retry markPullRequestMerged with mergeCommitId from bridgeListRefs.`);
    }
    if (skipNostrStatus) {
      nextSteps.push('You set skipNostrStatus: call markPullRequestMerged with mergeCommitId so the UI sees merged state on Nostr.');
    }

    return withAgentHints(
      {
        success: true,
        repoId,
        ownerPubkey: ownerHex,
        baseBranch: resolvedBase,
        pushResult,
        bridgeCommit,
        stateResult,
        stateError,
        statusEvent: statusResult?.event || null,
        statusError,
        prId,
      },
      {
        agentSummary: `Merged PR into ${resolvedBase}; bridge commit ${bridgeCommit || '(see pushResult)'}. Nostr state ${stateResult?.event?.id ? 'published' : 'not published'}; merge status ${statusResult?.event?.id ? 'published' : skipNostrStatus ? 'skipped' : statusError || 'n/a'}.`,
        whatHappensNext: 'Gittr indexes bridge + relay events; users see the merge after propagation.',
        nextSteps,
      }
    );
  } catch (e) {
    return {
      success: false,
      error: e.message,
      reason: 'Unexpected failure during merge pipeline.',
      nextSteps: suggestNextStepsForTool('mergePullRequest', e.message),
      prId,
    };
  } finally {
    if (tmpRoot) {
      try {
        await fsPromises.rm(tmpRoot, { recursive: true, force: true });
      } catch (_) { /* ignore */ }
    }
  }
}

module.exports = {
  loadCredentials,
  describeAgentAuth,
  createRepo,
  getRepo,
  resolveRepoByNostrId,
  searchRepos,
  listBounties,
  forkRepo,
  myRepos,
  addCollaborator,
  getFile,
  mirrorRepo,
  importRemoteToBridge,
  getIssueById,
  getPullRequestById,
  closeIssue,
  reopenIssue,
  markPullRequestMerged,
  mergePullRequest,
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
  exploreRepos,
  // Bridge HTTP (gittr/ngit API routes)
  bridgeRepoExists: (a) => bridgeApi.bridgeRepoExists(a.ownerPubkey, a.repo, a.bridgeUrl),
  bridgeListFiles: (a) => bridgeApi.bridgeListFiles(a, a.bridgeUrl),
  bridgeGetFileContent: (a) => bridgeApi.bridgeGetFileContent(a, a.bridgeUrl),
  bridgeListRefs: (a) => bridgeApi.bridgeListRefs(a, a.bridgeUrl),
  bridgeListCommits: (a) => bridgeApi.bridgeListCommits(a, a.bridgeUrl),
  getPushPaywallStatus: (a) => bridgeApi.getPushPaywallStatus(a, a.bridgeUrl),
  createPushPaywallIntent: (a) => bridgeApi.createPushPaywallIntent(a, a.bridgeUrl),
  syncRepoPushPolicy: (a) => bridgeApi.syncRepoPushPolicy(a.signedAnnouncementEvent, a.bridgeUrl),
  bountyCreateInvoice: (a) => bridgeApi.bountyCreateInvoice(a, a.bridgeUrl),
  bountyRelease: (a) => bridgeApi.bountyRelease(a, a.bridgeUrl),
  bountyCreateWithdraw: (a) => bridgeApi.bountyCreateWithdraw(a, a.bridgeUrl),
  bountyClaimWithdraw: (a) => bridgeApi.bountyClaimWithdraw(a, a.bridgeUrl),
};
