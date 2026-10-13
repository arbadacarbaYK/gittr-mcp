'use strict';

const { suggestNextStepsForTool } = require('../gittr-agent-outcomes');

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

const suspended = suggestNextStepsForTool(
  'mirrorRepo',
  'Could not copy the forge commits onto gittr (history kept): fatal: The requested URL returned error: 403'
);

assert(
  suspended.some((s) => s.includes('bridgeListFiles')),
  'suspended forge tells the agent to read the gittr copy'
);
assert(
  suspended.some((s) => s.includes('do not call mirrorRepo') || s.includes('Do not call mirrorRepo')),
  'suspended forge forbids pointing mirrorRepo at another URL'
);
assert(
  !suspended.some((s) => s.includes('authenticated pubkey')),
  'a forge 403 is not treated as a bridge ownership failure'
);

const denied = suggestNextStepsForTool(
  'mirrorRepo',
  'Could not copy the forge commits onto gittr (history kept): Access denied'
);
assert(
  denied.some((s) => s.includes('authenticated pubkey')),
  'bridge access denied still points at the owner key'
);
assert(
  !denied.some((s) => s.includes('bridgeListFiles')),
  'access denied is not the suspended-forge path'
);

console.log('\n✓ forge 403 next steps');
