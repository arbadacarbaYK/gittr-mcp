// grasp-detection.js - GRASP server detection utilities
// Based on gittr-helper-tools/snippets/grasp-detection

// Known GRASP server domains (git servers that are also Nostr relays)
const KNOWN_GRASP_DOMAINS = [
  'relay.ngit.dev',
  'gittr.space',
  'git.gittr.space'
];

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
  isGraspServer,
  getGraspServers,
  getRegularRelays,
  detectGraspFromRepoEvent,
  detectGRASPServers
};
