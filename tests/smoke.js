// gittr-mcp smoke test
const gittr = require('../index.js');

console.log('Testing gittr-mcp...');

const functions = Object.keys(gittr).filter(k => typeof gittr[k] === 'function');
console.log(`\n✓ ${functions.length} functions exposed\n`);

// List all functions
functions.forEach(fn => console.log(`  - ${fn}`));

console.log('\n✓ Smoke test passed');
