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
  const {
    name,           // Repository name (required)
    description = '',
    files = [],     // Array of { path, content } (required for initial push)
    branch = 'main',
    privkey,        // Your private key (hex)
    pubkey,         // Your public key (hex) - auto-derived if privkey provided
    relays = gittrNostr.config.relays,
    graspServer = 'relay.ngit.dev'
  } = options;
  
  // Auto-load credentials if not provided
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) {
      privkey = creds.nsec;
      pubkey = creds.npub;
    }
  }
  
  if (!privkey) {
    throw new Error('Private key required. Pass privkey option or ensure .nostr-keys.json exists.');
  }
  
  // Derive pubkey from privkey if not provided
  if (!pubkey && privkey) {
    pubkey = gittrNostr.getPublicKey(privkey);
  }
  
  // Step 1: Push files to bridge (no signing needed)
  let pushResult = null;
  if (files.length > 0) {
    pushResult = await gittrNostr.pushToBridge({
      ownerPubkey: pubkey,
      repo: name,
      branch,
      files
    });
  }
  
  // Step 2: Build clone URLs
  const cloneUrls = [
    `https://${graspServer}/${pubkey}/${name}.git`
  ];
  const webUrls = [
    `https://gittr.space/${pubkey}/${name}`
  ];
  
  // Step 3: Publish announcement
  const announceResult = await gittrNostr.publishRepoAnnouncement({
    repoId: name,
    name,
    description,
    web: webUrls,
    clone: cloneUrls,
    privkey,
    relays
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
    r.name.toLowerCase() === repoId.toLowerCase()
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
  const { 
    minAmount = 0,      // Minimum bounty in sats
    limit = 50, 
    relays = gittrNostr.config.relays 
  } = options;
  
  const pool = new (require('nostr-tools')).SimplePool();
  
  try {
    const events = await pool.querySync(relays, {
      kinds: [1621], // Issue kind
      '#t': ['bounty', 'bounties', 'sats', 'lightning', 'paid'],
      limit: limit * 2 // Get more, filter later
    });
  } finally {
    pool.close?.();
  }
  
  const bounties = events.map(event => {
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
    graspServer = 'relay.ngit.dev'
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) {
      privkey = creds.nsec;
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
    if (creds && creds.nsec) {
      privkey = creds.nsec;
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
  await pool.publish(relays, event);
  pool.close?.();
  
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
  
  // Try each grasp server
  const servers = ['relay.ngit.dev', 'git.gittr.space', 'git.shakespeare.diy'];
  
  for (const server of servers) {
    try {
      const url = `https://${server}/${ownerPubkey}/${repoId}/raw/${branch}/${filePath}`;
      const response = await fetch(url);
      if (response.ok) {
        const content = await response.text();
        return { content, path: filePath, repo: repoId, branch, server };
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
    graspServer = 'relay.ngit.dev'
  } = options;
  
  // Auto-load credentials
  if (!privkey) {
    const creds = loadCredentials();
    if (creds && creds.nsec) {
      privkey = creds.nsec;
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
  mirrorRepo
};
