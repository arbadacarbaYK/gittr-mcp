'use strict';

const assert = require('assert');
const audit = require('../gittr-security-audit');

assert.ok(audit.isManifestPath('ui/package.json'));
assert.ok(audit.isManifestPath('yarn.lock'));
assert.ok(!audit.isManifestPath('README.md'));

{
  const pkgs = audit.parseManifest(
    'package.json',
    JSON.stringify({
      dependencies: { lodash: '^4.17.21' },
      devDependencies: { prettier: '3.0.0' },
    })
  );
  assert.ok(pkgs.some((p) => p.name === 'lodash' && p.version === '4.17.21' && p.precision === 'range-min'));
  assert.ok(pkgs.some((p) => p.name === 'prettier' && p.precision === 'range-min' && p.direct));
  console.log('✓ parse package.json range-min');
}

{
  const pkgs = audit.parseManifest(
    'yarn.lock',
    `"lodash@^4.17.0":
  version "4.17.21"
  resolved "https://example"
`
  );
  assert.strictEqual(pkgs.length, 1);
  assert.strictEqual(pkgs[0].name, 'lodash');
  assert.strictEqual(pkgs[0].version, '4.17.21');
  assert.strictEqual(pkgs[0].precision, 'pinned');
  console.log('✓ parse yarn.lock pinned');
}

{
  const pkgs = audit.parseManifest(
    'go.mod',
    `module example.com/demo

require (
  golang.org/x/crypto v0.17.0
  golang.org/x/sys v0.15.0 // indirect
)
`
  );
  const crypto = pkgs.find((p) => p.name === 'golang.org/x/crypto');
  const sys = pkgs.find((p) => p.name === 'golang.org/x/sys');
  assert.ok(crypto && crypto.direct);
  assert.ok(sys && sys.direct === false);
  console.log('✓ parse go.mod');
}

{
  const merged = audit.mergeManifestPackages([
    audit.parseManifest('package.json', JSON.stringify({ dependencies: { lodash: '^4.17.0' } })),
    audit.parseManifest(
      'yarn.lock',
      `"lodash@^4.17.0":
  version "4.17.21"
`
    ),
  ]);
  const lodash = merged.find((p) => p.name === 'lodash');
  assert.strictEqual(lodash.version, '4.17.21');
  assert.strictEqual(lodash.precision, 'pinned');
  assert.strictEqual(lodash.direct, true);
  const payload = audit.toAuditPayload(merged);
  assert.ok(!('sourceFile' in payload[0]));
  console.log('✓ merge prefers lockfile pin + keeps direct');
}

console.log('\n✓ security-audit-parse tests passed');
