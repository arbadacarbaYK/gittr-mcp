'use strict';

const assert = require('assert');
const pages = require('../gittr-pages');

assert.strictEqual(pages.KIND_NSITE_NAMED, 35128);
assert.ok(pages.isGittrPagesManifestPath('index.html'));
assert.ok(pages.isGittrPagesManifestPath('assets/app.css'));
assert.ok(!pages.isGittrPagesManifestPath('node_modules/foo.js'));
assert.ok(!pages.isGittrPagesManifestPath('src/main.go'));
assert.strictEqual(pages.toWebPath('index.html'), '/index.html');
assert.strictEqual(pages.contentTypeForPath('app.js'), 'text/javascript; charset=utf-8');
console.log('✓ pages path + MIME helpers');

{
  const staged = pages.stagePagesFiles([
    { path: 'index.html', content: '<html><body>hi</body></html>' },
    { path: 'style.css', content: 'body{color:red}' },
    { path: 'node_modules/skip.js', content: 'nope' },
  ]);
  assert.strictEqual(staged.length, 2);
  assert.ok(staged.every((s) => /^[0-9a-f]{64}$/.test(s.sha256)));
  const tags = pages.buildNamedSiteManifestTags({
    dTag: 'demo',
    uploads: staged,
    title: 'Demo',
    relays: ['wss://relay.gittr.space'],
  });
  assert.ok(tags.some((t) => t[0] === 'd' && t[1] === 'demo'));
  assert.ok(tags.some((t) => t[0] === 'path' && t[1] === '/index.html'));
  assert.ok(tags.some((t) => t[0] === 'relay' && t[1] === 'wss://relay.gittr.space'));
  console.log('✓ stagePagesFiles + 35128 tags');
}

{
  let threw = false;
  try {
    pages.stagePagesFiles([{ path: 'readme.md', content: '# hi' }]);
  } catch (e) {
    threw = /index\.html/.test(e.message);
  }
  assert.ok(threw, 'index.html required');
  console.log('✓ index.html required');
}

{
  const auth = pages.unsignedPagesBlossomUploadAuth({
    pubkeyHex: 'a'.repeat(64),
    sha256Hex: ['b'.repeat(64)],
  });
  assert.strictEqual(auth.kind, 24242);
  assert.ok(auth.tags.some((t) => t[0] === 't' && t[1] === 'upload'));
  assert.ok(auth.tags.some((t) => t[0] === 'x' && t[1] === 'b'.repeat(64)));
  console.log('✓ unsigned Pages blossom auth');
}

console.log('\n✓ gittr-pages tests passed');
