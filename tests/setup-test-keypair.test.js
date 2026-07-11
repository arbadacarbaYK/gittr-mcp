// setupTestKeypair flow test — runs in a temp dir so real keys are never touched.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gittr-mcp-keytest-'));
// loadCredentials also checks $HOME paths — point HOME at the temp dir so a
// real ~/.nostr-identity.json on this machine cannot leak into the test.
process.env.HOME = tmp;
process.chdir(tmp);

const gittr = require(path.join(__dirname, '..', 'index.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

// 1. Unconfigured: describeAgentAuth must tell the agent to ask the user.
const authBefore = gittr.describeAgentAuth();
assert(authBefore.configured === false, 'unconfigured: configured=false');
assert(
  typeof authBefore.askUser === 'string' && authBefore.askUser.includes('setupTestKeypair'),
  'unconfigured: askUser prompt mentions setupTestKeypair'
);

// 2. Without confirm: must NOT create anything, must return the question.
const noConfirm = gittr.setupTestKeypair();
assert(noConfirm.created === false && noConfirm.needsConfirmation === true, 'no confirm: nothing created, asks for confirmation');
assert(!fs.existsSync(path.join(tmp, '.nostr-keys.json')), 'no confirm: .nostr-keys.json not written');

// 3. With confirm: creates the file with a valid, flagged test identity.
const created = gittr.setupTestKeypair({ confirm: true });
assert(created.created === true, 'confirm: created=true');
assert(/^npub1[a-z0-9]+$/.test(created.npub), 'confirm: returns npub');
assert(/^[0-9a-f]{64}$/.test(created.pubkeyHex), 'confirm: returns hex pubkey');
assert(created.nsec === undefined, 'confirm: nsec is NOT returned to the agent');
const file = JSON.parse(fs.readFileSync(path.join(tmp, '.nostr-keys.json'), 'utf8'));
assert(/^nsec1[a-z0-9]+$/.test(file.nsec), 'file: contains valid nsec');
assert(file.generated === true, 'file: flagged as generated test key');

// 4. describeAgentAuth now reports the generated key with a replace reminder.
const authAfter = gittr.describeAgentAuth();
assert(authAfter.configured === true, 'configured: configured=true');
assert(authAfter.generatedTestKey === true, 'configured: generatedTestKey=true');
assert(authAfter.pubkeyHex === created.pubkeyHex, 'configured: same pubkey as created');
assert(typeof authAfter.testKeyReminder === 'string', 'configured: reminder to replace with real key');

// 5. Second call without force: refuses to overwrite.
const again = gittr.setupTestKeypair({ confirm: true });
assert(again.created === false && again.alreadyConfigured === true, 're-run: refuses to overwrite existing keys');

// 6. force: true creates a fresh identity.
const forced = gittr.setupTestKeypair({ confirm: true, force: true });
assert(forced.created === true && forced.pubkeyHex !== created.pubkeyHex, 'force: fresh identity written');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n✓ setupTestKeypair flow test passed');
