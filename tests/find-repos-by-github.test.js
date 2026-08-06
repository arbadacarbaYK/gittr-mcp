'use strict';

const {
  normalizeForgeSourceKey,
  normalizeGithubOwnerRepo,
  forgeKeysFrom30617Tags,
  matchedViaTags,
} = require('../github-source-match');

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

assert(
  normalizeForgeSourceKey('https://github.com/Coldcard/firmware') ===
    'github.com/coldcard/firmware',
  'github https'
);
assert(
  normalizeForgeSourceKey('https://gitlab.com/Group/sub/project.git') ===
    'gitlab.com/group/sub/project',
  'gitlab nested path'
);
assert(
  normalizeForgeSourceKey('https://codeberg.org/Org/Repo/src/branch/main') ===
    'codeberg.org/org/repo',
  'codeberg strip /src/'
);
assert(
  normalizeForgeSourceKey('git@codeberg.org:Org/Repo.git') ===
    'codeberg.org/org/repo',
  'codeberg scp'
);
assert(
  normalizeForgeSourceKey('https://gitea.example.com/a/b') ===
    'gitea.example.com/a/b',
  'self-hosted gitea'
);
assert(
  normalizeForgeSourceKey('Coldcard/firmware') === 'github.com/coldcard/firmware',
  'bare owner/repo → github shorthand'
);
assert(
  normalizeForgeSourceKey('https://git.gittr.space/npub1abc/repo.git') === null,
  'skip GRASP/gittr clone hosts'
);
assert(
  normalizeForgeSourceKey('my cool repo') === null,
  'reject display names'
);

// legacy helper still returns owner/repo for github only
assert(
  normalizeGithubOwnerRepo('https://github.com/Coldcard/firmware') ===
    'coldcard/firmware',
  'legacy github owner/repo'
);
assert(
  normalizeGithubOwnerRepo('https://gitlab.com/a/b') === null,
  'legacy helper rejects gitlab'
);

const tags = [
  ['d', 'my-cool-repo'],
  ['name', 'My Cool Repo'],
  ['source', 'https://gitlab.com/Acme/My-Cool-Repo'],
  ['clone', 'https://git.gittr.space/npub1abc/my-cool-repo.git'],
];
const keys = forgeKeysFrom30617Tags(tags);
assert(keys.has('gitlab.com/acme/my-cool-repo'), 'gitlab source key');
assert(!keys.has('my-cool-repo'), 'does not use d slug');
assert(
  matchedViaTags(tags, 'gitlab.com/acme/my-cool-repo').includes('source'),
  'matchedVia source'
);

console.log('All forge-source-match tests passed');
