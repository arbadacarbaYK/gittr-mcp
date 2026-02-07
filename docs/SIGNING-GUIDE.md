# Signing Guide

This document explains what requires signing in gittr-mcp and what doesn't.

## What Does NOT Require Signing

### Push Files to Git Server

**Function:** `pushToBridge()`

**Why no signing?** This is a standard HTTP API call to gittr.space. The bridge accepts files and creates git commits without requiring Nostr authentication.

**Example:**
```javascript
const result = await gittr.pushToBridge({
  ownerPubkey: '<64-char-hex-pubkey>',
  repo: 'my-repo',
  branch: 'main',
  files: [
    { path: 'README.md', content: '# Hello' }
  ]
});
// No private key needed! ✅
```

**How it works:**
1. You specify the owner's public key
2. Bridge creates git commits in that owner's repository directory
3. Files are stored on git server (https://gittr.space)
4. **BUT:** Files won't appear on gittr.space UI until Nostr events are published

**Security:** Anyone can push to any repository via the bridge API. This is intentional - Nostr events (which require signing) are the authoritative record. The bridge is just temporary storage until signed events arrive.

## What REQUIRES Signing

### Repository Announcement (kind 30617)

**Function:** `publishRepoAnnouncement()`

**Why signing?** This announces the repository to Nostr. The signature proves you own the repository.

**Example:**
```javascript
const result = await gittr.publishRepoAnnouncement({
  repoId: 'my-repo',
  name: 'My Repo',
  description: 'Description',
  web: ['https://gittr.space/npub.../my-repo'],
  clone: ['https://relay.ngit.dev/<pubkey>/my-repo.git'],
  privkey: '<your-private-key-hex>', // ✍️ SIGNING REQUIRED
  relays: ['wss://relay.ngit.dev']
});
```

**What gets signed:**
- Repository metadata (name, description)
- Clone URLs (where to fetch the code)
- Web URLs (where to view it)
- Maintainers list (who can modify)
- Relay list (where to find updates)

**Security:** Only someone with the private key can create valid announcement events. This prevents impersonation.

### Repository State (kind 30618)

**Function:** `publishRepoState()`

**Why signing?** This publishes the current refs/commits. The signature proves these are the official commits.

**Example:**
```javascript
const result = await gittr.publishRepoState({
  repoId: 'my-repo',
  refs: [
    { name: 'refs/heads/main', commit: 'abc123...' }
  ],
  privkey: '<your-private-key-hex>', // ✍️ SIGNING REQUIRED
  relays: ['wss://relay.ngit.dev']
});
```

**What gets signed:**
- Current branch/tag refs
- Commit SHAs
- Repository identifier

**Security:** Only the owner can publish authoritative refs. This prevents fake commits.

### Issues (kind 1621)

**Function:** `createIssue()`

**Why signing?** Issues are public records. The signature proves who created them.

**Example:**
```javascript
const result = await gittr.createIssue({
  ownerPubkey: '<repo-owner-pubkey>',
  repoId: 'my-repo',
  subject: 'Bug: Something broke',
  content: 'Description of the bug...',
  labels: ['bug'],
  privkey: '<your-private-key-hex>', // ✍️ SIGNING REQUIRED
  relays: ['wss://relay.ngit.dev']
});
```

**What gets signed:**
- Issue title
- Issue description
- Labels
- Repository reference

**Security:** Prevents anonymous spam. Issues are tied to Nostr identities.

### Pull Requests (kind 1618)

**Function:** `createPR()`

**Why signing?** PRs are public records. The signature proves who created them.

**Example:**
```javascript
const result = await gittr.createPR({
  ownerPubkey: '<repo-owner-pubkey>',
  repoId: 'my-repo',
  subject: 'feat: Add new feature',
  content: 'Description of changes...',
  commitId: 'abc123...',
  cloneUrls: ['https://relay.ngit.dev/<your-pubkey>/my-fork.git'],
  branchName: 'feature-branch',
  privkey: '<your-private-key-hex>', // ✍️ SIGNING REQUIRED
  relays: ['wss://relay.ngit.dev']
});
```

**What gets signed:**
- PR title
- PR description
- Commit reference
- Clone URLs for PR branch
- Branch name

**Security:** Prevents fake PRs. PRs are tied to Nostr identities.

## How Signing Works

### Private Key Format

Private keys are 64-character hexadecimal strings:

```javascript
// ✅ Valid format
const privkey = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

// ❌ Invalid formats
const badKey1 = 'nsec1...'; // nsec format not accepted (yet)
const badKey2 = '12345';    // Too short
const badKey3 = 'not-hex';  // Not hexadecimal
```

### Public Key Derivation

gittr-mcp can derive your public key from your private key:

```javascript
const gittr = require('gittr-mcp');

const pubkey = gittr.getPublicKey(privkey);
console.log('Your pubkey:', pubkey);
```

### Signature Verification

When you sign an event:
1. gittr-mcp creates a Nostr event structure
2. Hashes the event content
3. Signs the hash with your private key (ECDSA secp256k1)
4. Attaches signature to event
5. Publishes to Nostr relays

Relays verify:
- Signature matches event content
- Public key matches signature
- Event structure is valid

If verification fails, relays reject the event.

## Security Best Practices

### Never Commit Private Keys

```bash
# ❌ NEVER DO THIS
echo "PRIVKEY=abc123..." > .env
git add .env
git commit -m "Add config"
git push  # 🚨 PRIVATE KEY IS NOW PUBLIC!

# ✅ DO THIS INSTEAD
echo ".env" >> .gitignore
echo "PRIVKEY=abc123..." > .env
git add .gitignore
git commit -m "Add .gitignore"
git push  # ✅ Safe
```

### Store Keys Securely

```bash
# Option 1: Environment variable
export NOSTR_PRIVKEY="abc123..."

# Option 2: Secure file (chmod 600)
mkdir -p ~/.nostr
echo '{"privateKey":"abc123...","publicKey":"def456..."}' > ~/.nostr/identity.json
chmod 600 ~/.nostr/identity.json

# Option 3: System keyring (macOS/Linux)
security add-generic-password -a "nostr" -s "privkey" -w "abc123..."
```

### Load Keys at Runtime

```javascript
const fs = require('fs');
const os = require('os');
const path = require('path');

// Option 1: From file
const identity = JSON.parse(
  fs.readFileSync(path.join(os.homedir(), '.nostr/identity.json'), 'utf8')
);
const privkey = identity.privateKey;

// Option 2: From environment
const privkey = process.env.NOSTR_PRIVKEY;
if (!privkey) {
  throw new Error('NOSTR_PRIVKEY environment variable not set');
}
```

### Rotate Keys if Compromised

If your private key is exposed:

1. **Generate new key:**
   ```javascript
   const { generateSecretKey, getPublicKey } = require('nostr-tools/pure');
   const sk = generateSecretKey();
   const pk = getPublicKey(sk);
   console.log('New privkey:', Buffer.from(sk).toString('hex'));
   console.log('New pubkey:', Buffer.from(pk).toString('hex'));
   ```

2. **Update all services:**
   - Update gittr-mcp scripts
   - Update .nostr/identity.json
   - Update environment variables

3. **Publish deprecation event:**
   - Announce old key is compromised
   - Point to new public key

4. **Delete old repositories if needed:**
   - Publish deletion events (kind 5)
   - Re-publish with new key

## Two Workflows

### Workflow A: Agent-Owned Repository

**Use case:** Agent creates and manages its own repository.

```javascript
// Agent has its own private key
const agentPrivkey = '<agent-private-key>';
const agentPubkey = gittr.getPublicKey(agentPrivkey);

// Step 1: Push files (no signing)
await gittr.pushToBridge({
  ownerPubkey: agentPubkey,
  repo: 'agent-repo',
  files: [...]
});

// Step 2: Announce (agent signs)
await gittr.publishRepoAnnouncement({
  repoId: 'agent-repo',
  privkey: agentPrivkey, // Agent signs with its own key
  ...
});

// Step 3: Publish state (agent signs)
await gittr.publishRepoState({
  repoId: 'agent-repo',
  privkey: agentPrivkey, // Agent signs with its own key
  ...
});
```

**Security:** Agent owns repository. Only agent can update it.

### Workflow B: Agent Pushes to Human's Repository

**Use case:** Human wants agent to push code to their repository.

```javascript
// Human's keys
const humanPrivkey = '<human-private-key>';
const humanPubkey = gittr.getPublicKey(humanPrivkey);

// Step 1: Agent pushes files (no signing)
await gittr.pushToBridge({
  ownerPubkey: humanPubkey, // Human's pubkey
  repo: 'human-repo',
  files: [...]
});

// Step 2: Human signs announcement
// (Agent cannot do this - it doesn't have human's private key)
await gittr.publishRepoAnnouncement({
  repoId: 'human-repo',
  privkey: humanPrivkey, // HUMAN must sign
  ...
});

// Step 3: Human signs state
await gittr.publishRepoState({
  repoId: 'human-repo',
  privkey: humanPrivkey, // HUMAN must sign
  ...
});
```

**Security:** Human owns repository. Agent can push files, but human must sign Nostr events.

**Alternative:** Human could add agent as maintainer in announcement event, then agent could publish updates with its own signature.

## Common Questions

### Q: Can an agent push code without any signing?

**A:** Yes, but the files won't appear on gittr.space UI until someone publishes signed Nostr events (announcement + state).

### Q: Can I use someone else's public key?

**A:** You can push files to their repository via `pushToBridge()`, but you cannot publish Nostr events as them (you need their private key).

### Q: What if someone pushes malicious files to my repository?

**A:** The bridge accepts pushes from anyone, but only YOU can publish signed Nostr events. Clients (like gittr.space UI) only show commits referenced in signed state events. So malicious pushes are invisible until you sign them.

### Q: Can I use NIP-07 (browser extension)?

**A:** Not yet in gittr-mcp. Currently only supports raw private keys. NIP-07 support planned for future versions.

### Q: How do I verify a signature?

**A:** Use nostr-tools:
```javascript
const { verifyEvent } = require('nostr-tools/pure');
const isValid = verifyEvent(event);
console.log('Signature valid:', isValid);
```

## Summary

| Operation | Signing Required? | Why? |
|-----------|------------------|------|
| Push files | ❌ No | HTTP API, no authentication |
| Announce repository | ✅ Yes | Proves ownership |
| Publish state | ✅ Yes | Proves commits are official |
| Create issue | ✅ Yes | Prevents spam |
| Create PR | ✅ Yes | Proves PR author |
| Create patch | ✅ Yes | Proves code author |
| List repos | ❌ No | Read-only query |
| List issues | ❌ No | Read-only query |
| List PRs | ❌ No | Read-only query |

**Key insight:** Write operations require signing. Read operations don't.

---

For complete examples, see [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md).
