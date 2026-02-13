# gittr-mcp

**Model Context Protocol for gittr.space** - enables AI agents to interact with Git repositories on Nostr.

## Installation

```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install
```

## Quick Start

```javascript
const gittr = require('gittr-mcp');

// Push files to gittr (NO signing required)
const pushResult = await gittr.pushToBridge({
  ownerPubkey: 'your-64-char-hex-pubkey',
  repo: 'my-repo',
  branch: 'main',
  files: [
    { path: 'README.md', content: '# Hello World' },
    { path: 'src/index.js', content: 'console.log("Hello!");' }
  ]
});

// Publish to Nostr (REQUIRES signing with private key)
await gittr.publishRepoAnnouncement({
  repoId: 'my-repo',
  name: 'my-repo',
  description: 'My awesome project',
  web: ['https://gittr.space/npub.../my-repo'],
  clone: ['https://relay.ngit.dev/pubkey.../my-repo.git'],
  privkey: 'your-private-key-hex',
  relays: ['wss://relay.ngit.dev']
});

await gittr.publishRepoState({
  repoId: 'my-repo',
  refs: pushResult.refs,
  privkey: 'your-private-key-hex',
  relays: ['wss://relay.ngit.dev']
});
```

## Two-Step Workflow

### Step 1: Push Files (No Signing)

The bridge API accepts files without requiring Nostr signing:

```javascript
const result = await gittr.pushToBridge({
  ownerPubkey: '<64-char-hex-pubkey>',
  repo: 'repo-name',
  branch: 'main',
  files: [
    { path: 'file.txt', content: 'content' }
  ]
});

console.log('Commit:', result.refs[0].commit);
```

**What happens:**
- Files are pushed to git server (https://gittr.space)
- Git commit is created with provided files
- Returns commit SHA for Nostr state event

**No signing required** - this is a standard HTTP API call.

### Step 2: Publish to Nostr (Requires Signing)

For files to appear on gittr.space, you must publish Nostr events:

```javascript
// Announce repository (kind 30617)
const announceResult = await gittr.publishRepoAnnouncement({
  repoId: 'repo-name',
  name: 'My Repo',
  description: 'Description',
  web: ['https://gittr.space/npub.../repo-name'],
  clone: ['https://relay.ngit.dev/<pubkey>/repo-name.git'],
  privkey: '<your-private-key-hex>',
  relays: ['wss://relay.ngit.dev'] // MUST match clone URL domain
});

// Publish state (kind 30618)
const stateResult = await gittr.publishRepoState({
  repoId: 'repo-name',
  refs: result.refs, // From step 1
  privkey: '<your-private-key-hex>',
  relays: ['wss://relay.ngit.dev']
});
```

**What happens:**
- Creates Nostr events signed with your private key
- Announces repository metadata to Nostr relays
- Publishes current refs/commits

**⚠️ Security:** Never commit your private key. Use environment variables.

## API Reference

### Repository Operations

#### `pushToBridge(options)`

Push files to git server (NO signing required).

**Parameters:**
- `ownerPubkey` (string) - 64-char hex pubkey
- `repo` (string) - Repository name
- `branch` (string) - Branch name (default: 'main')
- `files` (array) - Array of `{ path, content }` objects
  - `path` (string) - File path (e.g., 'src/index.js')
  - `content` (string) - File content (UTF-8)
  - `isBinary` (boolean, optional) - If true, content is base64

**Returns:**
```javascript
{
  success: true,
  pushedFiles: 2,
  refs: [
    { ref: 'refs/heads/main', commit: 'abc123...' }
  ]
}
```

#### `publishRepoAnnouncement(options)`

Publish repository to Nostr (kind 30617). **REQUIRES signing.**

**Parameters:**
- `repoId` (string) - Repository identifier
- `name` (string) - Human-readable name
- `description` (string) - Repository description
- `web` (array) - Web URLs (e.g., gittr.space links)
- `clone` (array) - Git clone URLs (MUST match relay domains)
- `privkey` (string) - 64-char hex private key
- `relays` (array) - Relay URLs (MUST include GRASP server from clone URLs)

**Returns:**
```javascript
{
  success: true,
  event: { id: '...', sig: '...', ... }
}
```

**⚠️ CRITICAL:** Clone URL domain MUST be in relays array:
```javascript
// ✅ CORRECT
clone: ['https://relay.ngit.dev/<pubkey>/repo.git']
relays: ['wss://relay.ngit.dev']

// ❌ WRONG - domains don't match
clone: ['https://git.gittr.space/<pubkey>/repo.git']
relays: ['wss://relay.noderunners.network']
```

#### `publishRepoState(options)`

Publish repository state to Nostr (kind 30618). **REQUIRES signing.**

**Parameters:**
- `repoId` (string) - Repository identifier
- `refs` (array) - Array of `{ name, commit }` objects
  - `name` (string) - Ref name (e.g., 'refs/heads/main')
  - `commit` (string) - Commit SHA
- `privkey` (string) - 64-char hex private key
- `relays` (array) - Relay URLs

**Returns:**
```javascript
{
  success: true,
  event: { id: '...', sig: '...', ... }
}
```

#### `listRepos(options)`

Discover repositories from Nostr relays.

**Parameters:**
- `pubkey` (string, optional) - Filter by owner pubkey
- `search` (string, optional) - Search term
- `limit` (number, optional) - Max results (default: 100)
- `relays` (array, optional) - Custom relay list

**Returns:**
```javascript
[
  {
    id: 'repo-name',
    name: 'My Repo',
    description: 'Description',
    owner: 'pubkey...',
    web: ['https://...'],
    clone: ['https://...'],
    graspServers: ['relay.ngit.dev'],
    relays: ['wss://relay.ngit.dev'],
    event: { ... }
  }
]
```

### Issue Operations

#### `listIssues(options)`

List issues for a repository.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `labels` (array, optional) - Filter by labels
- `relays` (array, optional) - Custom relay list

#### `createIssue(options)`

Create an issue. **REQUIRES signing.**

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `subject` (string) - Issue title
- `content` (string) - Issue description (markdown)
- `labels` (array, optional) - Issue labels
- `privkey` (string) - 64-char hex private key
- `relays` (array, optional) - Relay URLs

### Pull Request Operations

#### `listPRs(options)`

List pull requests for a repository.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `relays` (array, optional) - Custom relay list

#### `createPR(options)`

Create a pull request. **REQUIRES signing.**

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `subject` (string) - PR title
- `content` (string) - PR description (markdown)
- `commitId` (string) - Tip commit SHA
- `cloneUrls` (array) - Git clone URLs for PR branch
- `branchName` (string) - PR branch name
- `labels` (array, optional) - PR labels
- `privkey` (string) - 64-char hex private key
- `relays` (array, optional) - Relay URLs

### Bounty Operations

**⚠️ Note:** Bounty system exists in gittr code but no active bounties yet on platform.

#### `createBounty(ownerPubkey, repoId, issueId, amount, description)`

Create a Lightning bounty for an issue.

**Parameters:**
- `ownerPubkey` (string) - Repository owner pubkey
- `repoId` (string) - Repository identifier
- `issueId` (string) - Issue event ID
- `amount` (number) - Bounty amount in sats
- `description` (string) - Bounty description

## Known GRASP Servers

GRASP servers are both Nostr relays (wss://) AND git servers (https://):

- `relay.ngit.dev` (recommended - accepts all repos)
- `git.shakespeare.diy`
- `ngit-relay.nostrver.se`
- `git-01.uid.ovh`
- `git-02.uid.ovh`
- `ngit.danconwaydev.com`
- `git.gittr.space` (gittr's server)

**Usage:**
```javascript
const graspDomain = 'relay.ngit.dev';

const announceResult = await gittr.publishRepoAnnouncement({
  // ...
  clone: [`https://${graspDomain}/<pubkey>/repo.git`],
  relays: [`wss://${graspDomain}`] // MUST match clone domain
});
```

## Common Issues

### "Announcement must list service in both clone and relays tags"

**Cause:** Clone URL domain doesn't match any relay.

**Solution:** Extract domain from clone URL and add as `wss://<domain>` to relays.

### Repo shows "0 files" on gittr.space

**Cause:** Only pushed files (step 1), didn't publish to Nostr (step 2).

**Solution:** Run both `publishRepoAnnouncement()` and `publishRepoState()`.

### "duplicate url" error

**Cause:** Publishing to same relay multiple times.

**Solution:** Non-fatal - events published successfully. De-duplicate relays array.

## Security

- **Never commit private keys** - use environment variables
- Only Nostr operations require signing (issues, PRs, announcements)
- Bridge push (files) does NOT require signing
- Store keys securely (e.g., `~/.nostr-identity.json` with 0600 permissions)

## Complete Example

See [docs/AGENT-WORKFLOW.md](docs/AGENT-WORKFLOW.md) for full end-to-end examples.

## Support

If you're earning sats with this MCP, consider zapping the builder!

⚡ **Lightning:** arbadacarba@btip.nl

**Fair deal:**
- Used successfully? → 1,000-5,000 sats
- Built bounty agent? → 10,000+ sats
- Earned big? → 1-5% of your take

Top supporters (10k+ sats) get:
- Listed in SUPPORTERS.md
- Priority feature requests
- Direct support access

## Links

- **GitHub:** https://github.com/arbadacarbaYK/gittr-mcp
- **gittr.space:** https://gittr.space
- **NIP-34 Spec:** https://github.com/nostr-protocol/nips/blob/master/34.md
- **Builder:** @arbadacarba (Telegram), @arbadacarbaYK (Twitter)

## License

MIT
