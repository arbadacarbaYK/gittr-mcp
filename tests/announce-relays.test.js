'use strict';

/**
 * A GitHub-only kind 30617 is rejected by git servers. The publish must still
 * target relays that store it, and a dead socket must not count as success.
 */
const {
  mergeRepoRelays,
  publishSettledCountsAsStored,
} = require('../gittr-nostr.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

const graspOnly = [
  'wss://relay.noderunners.network',
  'wss://relay.ngit.dev',
  'wss://git.shakespeare.diy',
  'wss://ngit-relay.nostrver.se',
  'wss://git-01.uid.ovh',
  'wss://git-02.uid.ovh',
  'wss://ngit.danconwaydev.com',
  'wss://nostr.wine',
];

const merged = mergeRepoRelays(graspOnly);
assert(merged[0] === 'wss://relay.gittr.space', `discovery relay first, got ${merged[0]}`);
assert(merged.includes('wss://relay.damus.io'), 'damus stores a GitHub-only announcement');
assert(merged.includes('wss://relay.ngit.dev'), 'caller relays are kept');

assert(
  publishSettledCountsAsStored({ status: 'fulfilled', value: '' }) === true,
  'empty OK reason is a stored event'
);
assert(
  publishSettledCountsAsStored({
    status: 'fulfilled',
    value: 'connection failure: connection failed',
  }) === false,
  'a failed socket is not a stored event'
);
assert(
  publishSettledCountsAsStored({
    status: 'rejected',
    reason: new Error("invalid: Announcement must list service in both 'clone' and 'relays' tags"),
  }) === false,
  'a git-server rejection is not success'
);

console.log('announce-relays.test.js ok');
