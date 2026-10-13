'use strict';

const gittr = require('../gittr-nostr');

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

const juniorenRefs = [
  { ref: 'refs/heads/gh-pages', commit: 'f0fa5c4acb319402814b239833bb8825d7a92a5e' },
  { ref: 'refs/heads/main', commit: '12a64b393e67c384565c88b374189bcc946ba6a7' },
];

const sorted = gittr.nip34StateRefs(juniorenRefs, 'main');
const head = sorted.find((r) => r.ref === 'HEAD');
assert(head && head.commit === 'ref: refs/heads/main', 'forge default branch wins over gh-pages');

const omitted = gittr.nip34StateRefs(juniorenRefs);
const omittedHead = omitted.find((r) => r.ref === 'HEAD');
assert(omittedHead && omittedHead.commit === 'ref: refs/heads/main', 'main beats the alphabetically first branch');

const develop = gittr.nip34StateRefs(
  [
    { ref: 'refs/heads/develop', commit: 'aaa' },
    { ref: 'refs/heads/main', commit: 'bbb' },
  ],
  'develop'
);
assert(
  develop.find((r) => r.ref === 'HEAD').commit === 'ref: refs/heads/develop',
  'a non-main default branch is kept when the sync names it'
);

const real = gittr.resolveNip34HeadBranchName(
  [
    { ref: 'refs/heads/dependabot/npm/left-pad', commit: 'abc' },
    { ref: 'refs/heads/docs', commit: 'def' },
  ],
  ''
);
assert(real === 'docs', 'a real branch wins over a bot branch');

const keptHead = gittr.nip34StateRefs([
  { ref: 'refs/heads/develop', commit: 'aaa' },
  { ref: 'HEAD', commit: 'ref: refs/heads/develop' },
]);
assert(
  keptHead.find((r) => r.ref === 'HEAD').commit === 'ref: refs/heads/develop',
  'an explicit HEAD is kept when no default branch is passed'
);

const existing = {
  name: 'Bitcoin voor Junioren',
  description: 'custom text',
  web: [
    'https://gittr.space/npub152rm3l97pzc3pjmg8l33v6vcuf027s540tprzymtcv4rnxlqrecqkn6k8c/bitcoin-junioren',
    'https://gittr.space/a287b8fcbe08b110cb683fe3166998e25eaf42957ac231136bc32a399be01e70/bitcoin-junioren',
  ],
  publicRead: false,
  publicWrite: false,
  pushCostSats: 21,
  maintainers: ['aa'.repeat(32)],
  forkedFrom: 'https://github.com/someone/parent',
};

const kept = gittr.mirrorAnnouncementFields({
  existing,
  repoName: 'bitcoin-junioren',
  sourceUrl: 'https://github.com/L3and3r/bitcoin-junioren',
  ownerNpub: 'npub1example',
  pubkey: 'ab'.repeat(32),
});
assert(kept.name === 'Bitcoin voor Junioren', 'existing title is kept');
assert(kept.description === 'custom text', 'existing description is kept');
assert(kept.web.length === 2 && kept.web[0].includes('gittr.space'), 'existing web links are kept');
assert(kept.publicRead === false, 'private read is kept');
assert(kept.pushCostSats === 21, 'pay-to-push is kept');
assert(kept.maintainers[0] === 'aa'.repeat(32), 'maintainers are kept');
assert(kept.forkedFrom === 'https://github.com/someone/parent', 'forkedFrom is kept');

const overridden = gittr.mirrorAnnouncementFields({
  existing,
  repoName: 'bitcoin-junioren',
  sourceUrl: 'https://github.com/L3and3r/bitcoin-junioren',
  name: 'New title',
  description: 'New text',
  web: ['https://example.com/junioren'],
  ownerNpub: 'npub1example',
  pubkey: 'ab'.repeat(32),
});
assert(overridden.name === 'New title', 'a passed title replaces the old one');
assert(overridden.description === 'New text', 'a passed description replaces the old one');
assert(overridden.web[0] === 'https://example.com/junioren', 'passed web links replace the old ones');

const first = gittr.mirrorAnnouncementFields({
  existing: null,
  repoName: 'bitcoin-junioren',
  sourceUrl: 'https://github.com/L3and3r/bitcoin-junioren',
  ownerNpub: 'npub1example',
  pubkey: 'cd'.repeat(32),
});
assert(first.name === 'bitcoin-junioren', 'first mirror uses the repo name');
assert(
  first.description === 'Mirrored from https://github.com/L3and3r/bitcoin-junioren',
  'first mirror describes the forge URL'
);
assert(
  first.web.length === 2 && first.web.every((u) => u.startsWith('https://gittr.space/')),
  'first mirror links to gittr.space, not GitHub'
);
assert(
  !first.web.some((u) => u.includes('github.com')),
  'the forge URL is not stored as a web link'
);

console.log('\n✓ mirror announcement fields');
