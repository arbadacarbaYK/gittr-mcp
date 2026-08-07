'use strict';

/**
 * Regression: createRepo/mirrorRepo must advertise the full GRASP push set,
 * not derive clone[] from a capped relay publish list.
 */
const {
  buildFullGraspCloneUrls,
  GRASP_CLONE_HOSTS_FOR_PUSH,
} = require('../grasp-detection.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const npub = 'npub1n2ph08n4pqz4d3jk6n2p35p2f4ldhc5g5tu7dhftfpueajf4rpxqfjhzmc';
const repo = 'gittr-mcp';
const urls = buildFullGraspCloneUrls(npub, repo);

assert(Array.isArray(urls) && urls.length === GRASP_CLONE_HOSTS_FOR_PUSH.length,
  `expected ${GRASP_CLONE_HOSTS_FOR_PUSH.length} clones, got ${urls.length}`);

for (const host of GRASP_CLONE_HOSTS_FOR_PUSH) {
  const hit = urls.find((u) => u.includes(`https://${host}/`));
  assert(hit, `missing host ${host}`);
  assert(hit.includes(`/${npub}/${repo}.git`), `npub path required for ${host}: ${hit}`);
  assert(!hit.includes('github.com'), 'forge must not be in clone set');
}

// Capped relay publish set must NOT shrink the advertise list
const cappedRelays = ['wss://relay.ngit.dev', 'wss://relay.gittr.space'];
const again = buildFullGraspCloneUrls(npub, repo);
assert(again.length === urls.length,
  'clone set must be independent of capped relay publish list');
assert(JSON.stringify(again) === JSON.stringify(urls), 'clone set must be stable');

// Empty inputs
assert(buildFullGraspCloneUrls('', repo).length === 0, 'empty owner');
assert(buildFullGraspCloneUrls(npub, '').length === 0, 'empty repo');

console.log('✓ grasp-clone-urls: full push set (independent of relay cap)');
