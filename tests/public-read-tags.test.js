// public-read / public-write tag emission and round-trip parse
'use strict';

const path = require('path');
const gittrNostr = require(path.join(__dirname, '..', 'gittr-nostr.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

function buildTags(publicRead, publicWrite) {
  // Mirror publishRepoAnnouncement tag normalization without signing/publishing.
  return [
    ['public-read', publicRead === false ? 'false' : 'true'],
    ['public-write', publicWrite === true ? 'true' : 'false'],
  ];
}

function parseVisibility(tags) {
  const event = { kind: 30617, tags, content: '' };
  const parsed = gittrNostr.parse30617Announcement(event);
  return parsed
    ? { publicRead: parsed.publicRead, publicWrite: parsed.publicWrite }
    : null;
}

// Default: public read, owner-only write
let tags = buildTags(undefined, undefined);
let vis = parseVisibility(tags);
assert(vis.publicRead === true, 'missing publicRead → public');
assert(vis.publicWrite === false, 'missing publicWrite → owner-only write');

// Explicit private
tags = buildTags(false, false);
vis = parseVisibility(tags);
assert(vis.publicRead === false, 'publicRead:false → private');
assert(vis.publicWrite === false, 'publicWrite:false stays closed');

// Explicit public write (rare)
tags = buildTags(true, true);
vis = parseVisibility(tags);
assert(vis.publicRead === true, 'publicRead:true → public');
assert(vis.publicWrite === true, 'publicWrite:true → open write');

console.log('\n✓ public-read tag tests passed');
