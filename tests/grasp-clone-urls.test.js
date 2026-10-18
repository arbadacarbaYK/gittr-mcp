'use strict';

/**
 * Regression: createRepo/mirrorRepo must advertise the full GRASP push set,
 * not derive clone[] from a capped relay publish list.
 */
const {
  buildFullGraspCloneUrls,
  mergeUserGraspCloneUrls,
  GRASP_CLONE_HOSTS_FOR_PUSH,
  canonicalAnnouncementCloneUrls,
  graspRelaysForCloneUrls,
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

assert(
  !urls.some((u) => u.includes('relay.gittr.space')),
  'relay.gittr.space is wss only — must not be advertised as a clone host'
);
assert(
  GRASP_CLONE_HOSTS_FOR_PUSH.includes('git.gittr.space'),
  'push set must include the gittr bridge'
);

// Capped relay publish set must NOT shrink the advertise list
const cappedRelays = ['wss://relay.ngit.dev', 'wss://relay.gittr.space'];
const again = buildFullGraspCloneUrls(npub, repo);
assert(again.length === urls.length,
  'clone set must be independent of capped relay publish list');
assert(JSON.stringify(again) === JSON.stringify(urls), 'clone set must be stable');

// Empty inputs
assert(buildFullGraspCloneUrls('', repo).length === 0, 'empty owner');
assert(buildFullGraspCloneUrls(npub, '').length === 0, 'empty repo');

const short = canonicalAnnouncementCloneUrls(npub, repo, [
  `https://git.gittr.space/${npub}/${repo}.git`,
  'https://github.com/L3and3r/bitcoin-junioren.git',
]);
assert(short.clone.length === GRASP_CLONE_HOSTS_FOR_PUSH.length, 'short caller list still expands');
for (const host of GRASP_CLONE_HOSTS_FOR_PUSH) {
  assert(short.clone.some((u) => u.includes(`https://${host}/`)), `expanded set missing ${host}`);
}
assert(!short.clone.some((u) => u.includes('github.com')), 'forge URL must leave clone[]');
assert(short.forgeUrls[0].includes('github.com'), 'forge URL kept for the source tag');
const wss = graspRelaysForCloneUrls(short.clone);
assert(wss.includes('wss://relay.ngit.dev'), 'ngit relay');
assert(wss.includes('wss://gitnostr.com'), 'gitnostr relay');
assert(wss.includes('wss://git.shakespeare.diy'), 'shakespeare relay');
assert(!wss.includes('wss://git.gittr.space'), 'git.gittr.space is not a relay');

const named = mergeUserGraspCloneUrls(npub, repo, [
  'wss://git.example.com',
  'wss://relay.gittr.space',
  'wss://relay.ngit.dev',
]);
assert(named[0] === `https://git.example.com/${npub}/${repo}.git`, 'your server is first');
assert(named.some((u) => u.includes('https://git.gittr.space/')), 'public copies stay on the list');
assert(!named.some((u) => u.includes('relay.gittr.space')), 'relay hostname is not a clone');
assert(named.filter((u) => u.includes('relay.ngit.dev')).length === 1, 'no duplicate public host');

const withYours = canonicalAnnouncementCloneUrls(npub, repo, named);
assert(withYours.clone[0].includes('git.example.com'), 'announcement keeps your server first');
const yoursWss = graspRelaysForCloneUrls(withYours.clone);
assert(yoursWss.includes('wss://git.example.com'), 'your server is told about the repo');
assert(!yoursWss.includes('wss://relay.gittr.space'), 'relay hostname stays out');

console.log('✓ grasp-clone-urls: full push set (independent of relay cap)');
