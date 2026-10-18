// grasp-detection.js - GRASP server detection utilities
// Based on gittr-helper-tools/snippets/grasp-detection

// Known GRASP server domains (git servers that are also Nostr relays)
const KNOWN_GRASP_DOMAINS = [
  'relay.ngit.dev',
  'gittr.space',
  'git.gittr.space',
  'relay.gittr.space',
  'gitnostr.com',
  'ngit.danconwaydev.com',
  'git.shakespeare.diy',
];

/** Hosts we advertise on clone[] when creating/mirroring (matches gittr UI Push).
 * Do NOT list relay.gittr.space — that is the Pyramid wss relay; git bytes live on git.gittr.space.
 */
const GRASP_CLONE_HOSTS_FOR_PUSH = [
  'git.gittr.space',
  'relay.ngit.dev',
  'gitnostr.com',
  'ngit.danconwaydev.com',
  'git.shakespeare.diy',
];

/**
 * Full NIP-34 clone set (npub paths) — do not derive from capped relay publish list.
 * Forge URLs belong in `source`/`forkedFrom`, not here.
 */
function buildFullGraspCloneUrls(ownerNpubOrHex, repoName) {
  const owner = String(ownerNpubOrHex || '').trim();
  const repo = String(repoName || '').trim().replace(/\.git$/i, '');
  if (!owner || !repo) return [];
  return GRASP_CLONE_HOSTS_FOR_PUSH.map(
    (host) => `https://${host}/${owner}/${repo}.git`
  );
}

/** Never turn these into a clone URL, even if kind 10317 lists them. */
const GRASP_PUSH_EXCLUDED = new Set([
  'relay.gittr.space',
  'git-01.uid.ovh',
  'git-02.uid.ovh',
  'git.jb55.com',
  'ngit-relay.nostrver.se',
]);

function userNamedGraspHost(host) {
  if (!host || GRASP_PUSH_EXCLUDED.has(host)) return false;
  if (GRASP_CLONE_HOSTS_FOR_PUSH.includes(host)) return true;
  if (host.includes('git.')) return true;
  if (/git-\d+\./.test(host)) return true;
  return false;
}

/**
 * Kind 10317 hosts first, then the public copies. Same order the website uses.
 * relay.gittr.space is dropped: it is the event relay, not a git disk.
 */
function mergeUserGraspCloneUrls(ownerNpubOrHex, repoName, userEntries) {
  const owner = String(ownerNpubOrHex || '').trim();
  const repo = String(repoName || '').trim().replace(/\.git$/i, '');
  if (!owner || !repo) return [];
  const clone = [];
  const seen = new Set();
  const add = (host) => {
    if (!userNamedGraspHost(host) || seen.has(host)) return;
    seen.add(host);
    clone.push(`https://${host}/${owner}/${repo}.git`);
  };
  for (const entry of userEntries || []) {
    add(gitHostname(String(entry || '').replace(/^wss:/i, 'https:')));
  }
  for (const host of GRASP_CLONE_HOSTS_FOR_PUSH) add(host);
  return clone;
}

const FORGE_CLONE_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org'];

function gitHostname(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^git@/i.test(raw)) {
    return (raw.slice(4).split(':')[0] || '').toLowerCase();
  }
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isForgeGitUrl(url) {
  const host = gitHostname(url);
  return FORGE_CLONE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Same clone list the gittr website writes on Push: every pushable GRASP host
 * (npub path), plus any non-forge extra the caller already had. GitHub /
 * GitLab / Codeberg stay out of clone[] once a GRASP copy exists — they belong
 * in `source`. A second URL for a host we already list (hex vs npub) is dropped.
 */
function canonicalAnnouncementCloneUrls(ownerNpubOrHex, repoName, callerClone) {
  const grasp = buildFullGraspCloneUrls(ownerNpubOrHex, repoName);
  const graspHosts = new Set(grasp.map(gitHostname));
  const leading = [];
  const forgeUrls = [];
  const seen = new Set();
  for (const raw of callerClone || []) {
    if (!raw || typeof raw !== 'string') continue;
    const url = raw.trim();
    if (!url) continue;
    if (isForgeGitUrl(url)) {
      forgeUrls.push(url);
      continue;
    }
    const host = gitHostname(url);
    if (!host || seen.has(host) || graspHosts.has(host)) continue;
    if (!userNamedGraspHost(host)) continue;
    seen.add(host);
    leading.push(`https://${host}/${String(ownerNpubOrHex || '').trim()}/${String(repoName || '').trim().replace(/\.git$/i, '')}.git`);
  }
  const clone = [...leading];
  for (const url of grasp) {
    const host = gitHostname(url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    clone.push(url);
  }
  return { clone, forgeUrls };
}

/** wss relays that must see the announcement or they reject it (clone host missing). git.gittr.space is git bytes, not a relay. */
function graspRelaysForCloneUrls(cloneUrls) {
  const out = [];
  for (const url of cloneUrls || []) {
    const host = gitHostname(url);
    if (!host || host === 'git.gittr.space' || host === 'gittr.space') continue;
    if (GRASP_PUSH_EXCLUDED.has(host)) continue;
    const wss = `wss://${host}`;
    if (!out.includes(wss)) out.push(wss);
  }
  return out;
}

/**
 * Check if a URL is a GRASP server
 * @param {string} url - URL to check (can be wss://, https://, or git@)
 * @returns {boolean}
 */
function isGraspServer(url) {
  try {
    // Handle git@ URLs
    if (url.startsWith('git@')) {
      const hostname = url.split('@')[1].split(':')[0];
      return KNOWN_GRASP_DOMAINS.includes(hostname);
    }
    
    const hostname = new URL(url).hostname;
    return KNOWN_GRASP_DOMAINS.includes(hostname);
  } catch (e) {
    return false;
  }
}

/**
 * Filter array to get only GRASP servers
 * @param {string[]} urls - Array of URLs
 * @returns {string[]}
 */
function getGraspServers(urls) {
  return urls.filter(isGraspServer);
}

/**
 * Filter array to get only regular relays (non-GRASP)
 * @param {string[]} urls - Array of URLs
 * @returns {string[]}
 */
function getRegularRelays(urls) {
  return urls.filter(url => !isGraspServer(url));
}

/**
 * Detect GRASP servers from repository event tags
 * A GRASP server appears in BOTH clone and relays tags
 * @param {Array} tags - Repository event tags
 * @returns {Object} { graspServers: string[], regularRelays: string[], cloneUrls: string[] }
 */
function detectGraspFromRepoEvent(tags) {
  const cloneUrls = tags.filter(t => t[0] === 'clone').map(t => t[1]);
  const relayUrls = tags.filter(t => t[0] === 'relays').map(t => t[1]);
  
  // GRASP server = same domain in both clone and relays
  const graspServers = cloneUrls.filter(clone => {
    try {
      const cloneDomain = new URL(clone).hostname;
      return relayUrls.some(relay => {
        try {
          const relayUrl = relay.startsWith('wss://') ? relay : `wss://${relay}`;
          return new URL(relayUrl).hostname === cloneDomain;
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
      return false;
    }
  });
  
  const regularRelays = relayUrls.filter(relay => {
    try {
      const relayUrl = relay.startsWith('wss://') ? relay : `wss://${relay}`;
      const relayDomain = new URL(relayUrl).hostname;
      return !cloneUrls.some(clone => {
        try {
          return new URL(clone).hostname === relayDomain;
        } catch (e) {
          return false;
        }
      });
    } catch (e) {
      return true;
    }
  });
  
  return {
    graspServers,
    regularRelays,
    cloneUrls
  };
}

/**
 * Detect which relays from a list are GRASP servers
 * @param {string[]} relays - Array of relay URLs
 * @returns {Promise<string[]>} Array of GRASP server URLs
 */
async function detectGRASPServers(relays) {
  // For now, just check against known domains
  // In production, this would query each relay's capabilities
  return relays.filter(isGraspServer);
}

module.exports = {
  KNOWN_GRASP_DOMAINS,
  GRASP_CLONE_HOSTS_FOR_PUSH,
  buildFullGraspCloneUrls,
  mergeUserGraspCloneUrls,
  canonicalAnnouncementCloneUrls,
  graspRelaysForCloneUrls,
  isForgeGitUrl,
  isGraspServer,
  getGraspServers,
  getRegularRelays,
  detectGraspFromRepoEvent,
  detectGRASPServers
};
