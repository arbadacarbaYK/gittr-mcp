# Reality Check: What Actually Exists in gittr.space

## ❌ What the MCP Assumes (WRONG)

1. **CLI tool called `gittr`** - DOES NOT EXIST
2. **REST API for issues** (`issue.list`, `issue.create`) - DOES NOT EXIST  
3. **REST API for PRs** (`pr.create`, `pr.merge`) - DOES NOT EXIST
4. **REST API for bounty submission** (`bounty.submit`) - DOES NOT EXIST
5. **Event publishing endpoint** (`/api/nostr/event/publish`) - NOT CONFIRMED

## ✅ What Actually Exists

### 1. Repository Operations (CONFIRMED)
- **`POST /api/nostr/repo/push`** - Programmatic push to bridge (WORKS!)
  - Accepts: `ownerPubkey`, `repo`, `branch`, `files[]`, `commitMessage`, `privkey`
  - Returns: `refs[]` with commit SHAs
  - Supports chunked uploads for large repos

- **`POST /api/nostr/repo/clone`** - Trigger clone from remote
- **`GET /api/nostr/repo/files`** - Get file tree
- **`GET /api/nostr/repo/commits`** - Get commit history
- **`GET /api/nostr/repo/refs`** - Get branches/tags
- **`GET /api/nostr/repo/exists`** - Check if repo exists on bridge

### 2. Bounty Operations (CONFIRMED)
- **`POST /api/bounty/create`** - Create bounty invoice for an issue
  - Accepts: `amount`, `issueId`, `description`, `lnbitsUrl`, `lnbitsAdminKey`
  - Returns: `payment_hash`, `payment_request` (Lightning invoice)

- **`POST /api/bounty/release`** - Pay out bounty
- **`POST /api/bounty/check-withdraw`** - Check withdrawal status
- **`POST /api/bounty/claim-withdraw`** - Claim bounty
- **`POST /api/bounty/create-withdraw`** - Create withdrawal
- **`POST /api/bounty/delete-withdraw`** - Delete withdrawal

### 3. Zap Operations
- **`POST /api/zap/create-invoice`** - Create zap invoice
- **`POST /api/zap/distribute`** - Distribute accumulated zaps to contributors

### 4. Git-Nostr-Bridge
- **Go-based service** that watches Nostr and manages repos
- Located in `ui/gitnostr/` directory
- Handles actual git operations (clone, push, pull)
- Repos stored in filesystem at configured `repositoryDir`

### 5. Nostr Events (NIP-34)
Issues, PRs, and discussions are **Nostr events**, not REST API resources:

- **Repository State** - Kind 30617 (replaceable)
  - Tags: `d` (repo name), `clone` (URLs), `web` (website)
  - Files can be embedded or referenced via clone URLs

- **Issues** - Kind TBD (need to check NIP-34 spec)
- **Pull Requests** - Kind TBD
- **Discussions** - Kind TBD

To list/create these, you need to:
1. Query Nostr relays for events
2. Create signed Nostr events
3. Publish to relays

NO REST API for this - it's pure Nostr protocol.

## 🔧 What Needs to Change in the MCP

### Remove These (Don't Work)
- ❌ `gittr-shell.js` - Assumes CLI exists
- ❌ `issue.list` via CLI
- ❌ `pr.create` via CLI
- ❌ `bounty.submit` via CLI

### Keep These (Work)
- ✅ `repo.push_files` - Uses `/api/nostr/repo/push`
- ✅ `repo.list` - Can query Nostr for kind 30617 events
- ✅ `auth.use_identity` - Nostr key validation

### Add/Fix These
- ✅ **Direct Nostr event creation** for issues/PRs
- ✅ **Relay querying** for discovering repos/issues/PRs
- ✅ **Bounty invoice creation** via `/api/bounty/create`
- ✅ **Fix `repo.publish_nostr`** - need to publish directly to relays, not via API

## 🎯 Correct Agent Workflow

### 1. Discover Bounties
```javascript
// Query Nostr relays for issue events with bounty tags
const filter = {
  kinds: [ISSUE_KIND], // Need to find correct kind from NIP-34
  '#t': ['bounty', 'agent-friendly'],
  limit: 20
};
// Subscribe to relays, parse events
```

### 2. Push Code Fix
```javascript
// Use existing /api/nostr/repo/push endpoint (WORKS!)
const result = await fetch('https://gittr.space/api/nostr/repo/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ownerPubkey: '64char-hex',
    repo: 'repo-name',
    branch: 'agent-fix-123',
    files: [{ path: 'file.txt', content: 'fix...' }],
    commitMessage: 'Agent fix for issue #X',
    // NO privkey needed - push is public
  })
});
```

### 3. Create PR
```javascript
// Create Nostr event for PR
const prEvent = {
  kind: PR_KIND, // Need to find from NIP-34
  pubkey: agentPubkey,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', `pr-${Date.now()}`],
    ['repo', repoId],
    ['head', 'agent-fix-123'],
    ['base', 'main']
  ],
  content: JSON.stringify({
    title: 'Agent fix for issue #X',
    body: 'Automated fix...'
  })
};
// Sign with agent's Nostr key
// Publish to relays
```

### 4. Link to Bounty
```javascript
// If bounty exists, reference it in PR event or separate claim event
// Check gittr's bounty flow - may need to interact with LNbits directly
```

## 📝 Next Steps

1. **Find NIP-34 event kinds** for issues/PRs from gittr source
2. **Rewrite `gittr-shell.js`** to use:
   - Nostr relay queries
   - Direct event publishing
   - `/api/nostr/repo/push` for code
3. **Remove fake CLI calls** 
4. **Add Nostr relay connection** to MCP server
5. **Test against real gittr.space**

---

**Key Insight:** gittr is Nostr-native, not REST-native. The MCP needs to speak Nostr protocol, not invent APIs that don't exist.
