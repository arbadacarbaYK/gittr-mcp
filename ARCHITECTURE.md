# gittr.space MCP Architecture

## How gittr Actually Works

### 1. Repository Operations

**HTTP API (recommended for agents):**
- `POST /api/nostr/repo/push` - Push files to bridge ✅
  - Works WITHOUT Nostr private key
  - Accepts: `ownerPubkey`, `repo`, `branch`, `files[]`, `commitMessage`
  - Returns: `refs[]` with commit SHAs

**CLI (git-nostr-cli):**
- `git-nostr-cli repo create <name>` - Publish repo announcement (kind 51/30617)
- `git-nostr-cli repo clone <user>:<repo>` - Clone via SSH
- `git-nostr-cli repo permission <repo> <pubkey> <perm>` - Set permissions

### 2. Issues (NIP-34 kind 1621)

**No REST API** - Issues are Nostr events:

```javascript
const issueEvent = {
  kind: 1621,
  pubkey: agentPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['a', `30617:${ownerPubkey}:${repoName}`],  // Reference to repo
    ['title', 'Bug: ...'],
    ['t', 'bug'],
    ['t', 'agent-friendly']  // Tag for agent discovery
  ],
  content: 'Issue description in markdown...'
};
// Sign with agent's Nostr privkey
// Publish to relays
```

**To discover issues:**
```javascript
// Query Nostr relays
const filter = {
  kinds: [1621],
  '#t': ['agent-friendly', 'bounty'],
  limit: 20
};
```

### 3. Pull Requests (NIP-34 kind 1618)

**No REST API** - PRs are Nostr events:

```javascript
const prEvent = {
  kind: 1618,
  pubkey: agentPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['a', `30617:${ownerPubkey}:${repoName}`],  // Reference to repo
    ['r', commitSha],  // Earliest unique commit
    ['title', 'Fix: ...'],
    ['head', 'agent-fix-branch'],
    ['base', 'main']
  ],
  content: JSON.stringify({
    title: 'Fix: ...',
    body: 'Description...',
    commits: [commitSha]
  })
};
```

### 4. Bounties

**REST API available:**
- `POST /api/bounty/create` - Create Lightning invoice for bounty ✅
  - Accepts: `amount`, `issueId`, `description`, `lnbitsUrl`, `lnbitsAdminKey`
  - Returns: `payment_hash`, `payment_request`

- `POST /api/bounty/release` - Pay out bounty
- `POST /api/bounty/claim-withdraw` - Claim bounty payout

**Custom events (kind 9806):**
- Bounties can also be Nostr events with Lightning invoice tags

### 5. Status Events (NIP-34 kinds 1630-1633)

- `1630` - Open
- `1631` - Applied/Merged (PRs) or Resolved (Issues)
- `1632` - Closed
- `1633` - Draft

## MCP Implementation Strategy

### What Works Now

1. **`repo.push_files`** - Uses `/api/nostr/repo/push` ✅
2. **`auth.use_identity`** - Validate Nostr keys ✅

### What Needs Nostr Integration

3. **`repo.list`** - Query relays for kind 30617 (repo announcements)
4. **`issue.list`** - Query relays for kind 1621 events
5. **`issue.create`** - Create + sign + publish kind 1621 event
6. **`pr.create`** - Create + sign + publish kind 1618 event
7. **`repo.publish_nostr`** - Create + sign + publish kind 30617/30618

### What Uses REST API

8. **`bounty.create`** - Uses `/api/bounty/create` ✅
9. **`bounty.release`** - Uses `/api/bounty/release` ✅

## Agent Workflow

### 1. Discover Bounties
```javascript
// Connect to Nostr relays
const relays = ['wss://relay.noderunners.network', 'wss://gitnostr.com'];
// Query for issues with bounty tags
const issues = await queryRelays(relays, {
  kinds: [1621],
  '#t': ['bounty', 'agent-friendly']
});
```

### 2. Push Code Fix
```javascript
// Use HTTP API (no privkey needed!)
const result = await fetch('https://gittr.space/api/nostr/repo/push', {
  method: 'POST',
  body: JSON.stringify({
    ownerPubkey: '64char-hex',
    repo: 'repo-name',
    branch: 'agent-fix-123',
    files: [{ path: 'file.txt', content: 'fix...' }],
    commitMessage: 'Agent fix for issue #X'
  })
});
const { refs } = await result.json();
const commitSha = refs[0].commit;
```

### 3. Create PR
```javascript
// Create Nostr event
const prEvent = {
  kind: 1618,
  pubkey: agentPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['a', `30617:${ownerPubkey}:${repoName}`],
    ['r', commitSha],
    ['title', 'Agent fix for issue #X'],
    ['head', 'agent-fix-123'],
    ['base', 'main']
  ],
  content: JSON.stringify({
    title: 'Agent fix for issue #X',
    body: 'Automated fix...',
    commits: [commitSha]
  })
};
// Sign with agent's privkey
const signedPR = signEvent(prEvent, agentPrivkey);
// Publish to relays
await publishToRelays(relays, signedPR);
```

### 4. Link to Bounty
```javascript
// If bounty invoice exists, create a claim event or comment on issue
// Reference the PR in a comment (kind 1111) on the issue
const commentEvent = {
  kind: 1111,
  pubkey: agentPubkey,
  tags: [
    ['e', issueEventId, '', 'root'],
    ['K', '1621'],  // Reply to issue
  ],
  content: `Submitted PR: nostr:${nip19.noteEncode(prEventId)}\nCommit: ${commitSha}`
};
```

## Required Dependencies

For proper MCP implementation, we need:

1. **nostr-tools** (or @noble/secp256k1 + custom) - Event signing
2. **nostr-relaypool** (or websocket-polyfill) - Relay connections
3. **fetch** - HTTP API calls
4. **NO CLI dependency** - All operations via HTTP API or Nostr protocol

## Key Insights

1. **Most operations are Nostr events, not REST calls**
2. **Repo push is the exception** - Use HTTP API (`/api/nostr/repo/push`)
3. **Bounties have REST API** - Use `/api/bounty/*` endpoints
4. **git-nostr-cli is optional** - Only needed for repo create/permissions
5. **Agents must have Nostr keypairs** - Required for signing events
6. **Discovery is via relay queries** - No central database API

## Next Steps

1. Add Nostr relay connection to MCP server
2. Implement event signing for issues/PRs
3. Add relay query methods for discovery
4. Keep HTTP API methods for repo push and bounties
5. Remove fake CLI calls that don't exist
