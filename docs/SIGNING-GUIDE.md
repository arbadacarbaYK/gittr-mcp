# gittr-mcp Signing Guide

This document explains what requires signing in gittr-mcp and what doesn't.

---

## Authentication Required for Bridge Pushes (UPDATED 2026-02-13)

**The bridge API now requires Nostr authentication.** This prevents:
- Unauthenticated spam/DOS on your server
- Unauthorized file pushes
- Abuse of the temporary storage layer

### What Changed

| Before | After |
|--------|-------|
| `pushToBridge()` required only `ownerPubkey` | Now requires `privkey` for authentication |
| No server-side verification | Bridge verifies Nostr signature before accepting files |
| Anyone could push to any repo | Only authenticated users can push to their own repos |

---

## What Does NOT Require Signing

### Read Operations
- `listRepos()` — queries Nostr relays, no auth needed
- `searchRepos()` — full-text search, no auth
- `getRepo()` — fetch repo metadata, no auth
- `listIssues()` / `listPRs()` — read-only relay queries
- `getFile()` — read file content, no auth
- `listStars()`, `getTrendingRepos()`, `exploreRepos()` — discovery features

---

## What Requires Signing

### Write Operations (Nostr Events)

All these publish signed Nostr events to relays:

| Function | Kind | Requires |
|----------|------|----------|
| `publishRepoAnnouncement()` | 30617 | `privkey` |
| `publishRepoState()` | 30618 | `privkey` |
| `createIssue()` | 1621 | `privkey` |
| `createPR()` | 1618 | `privkey` |
| `createRepo()` | 30617 + bridge push | `privkey` (for both) |
| `forkRepo()` | 30617 | `privkey` |
| `addCollaborator()` | (meta event) | `privkey` |
| `starRepo()` / `unstarRepo()` | (meta event) | `privkey` |
| `watchRepo()` | (meta event) | `privkey` |
| `createRelease()` | (meta event) | `privkey` |
| `submitBounty()` | (meta event) | `privkey` |

---

## Bridge Authentication (Technical Details)

### How It Works

1. **Agent requests a challenge** from `/api/nostr/repo/push-challenge`
2. **Agent signs the challenge** with their Nostr private key
3. **Agent includes signed challenge** in `Authorization: Nostr <base64>` header
4. **Bridge verifies signature** before accepting the push
5. **Push succeeds** only if signature is valid and matches the claimed pubkey

### Auth Headers

Two methods supported:

```bash
# NIP-98 style (recommended)
Authorization: Nostr eyJwdWJrZXkiOiAiLi4uIiwgInNpZyI6ICJuZXcifQ==

# Or direct headers
X-Nostr-Pubkey: <hex-pubkey>
X-Nostr-Signature: <hex-signature>
```

### gittr-mcp Usage

```javascript
const gittr = require('gittr-mcp');

// Authenticated push (REQUIRED now)
const result = await gittr.pushToBridge({
  ownerPubkey: '64-char-hex-pubkey',
  repo: 'my-repo',
  branch: 'main',
  files: [{ path: 'README.md', content: '# Hello' }],
  privkey: '64-char-hex-privkey'  // ← Required!
});
```

Or use `createRepo()` which handles auth automatically:

```javascript
const result = await gittr.createRepo({
  name: 'my-repo',
  description: 'My awesome repo',
  files: [{ path: 'README.md', content: '# Hello' }],
  privkey: '64-char-hex-privkey'  // Auto-loads if .nostr-keys.json exists
});
```

---

## MCP identity binding (mandatory, relay-backed)

There is **no environment flag** to skip this. The MCP will not let a caller use one identity’s `privkey` while targeting another user’s repository unless that pubkey is **explicitly authorized on the owner’s latest kind 30617** as read from relays.

| Action | Who may sign |
|--------|----------------|
| **`pushToBridge`** | Repository **owner**, or any hex pubkey listed on the latest 30617 **`maintainers`** tags (plus the event author). |
| **`mergePullRequest`**, **`markPullRequestMerged`** (kind **1631**) | Repository **owner**, or — if the latest 30617 includes any **`merge_maintainers`** tag — **only** owner + pubkeys on those tags. If **`merge_maintainers` is absent**, merge follows the same set as push (owner + `maintainers`). |
| **Other `publishStatusForRoot` kinds** (1630 reopen, 1632 close, 1633 draft) | Same rule as **push** (owner + `maintainers`). |

Non-owners **must** pass **`repoId`** so the MCP can query `30617` with `#d` and `authors=[owner]`. If relays return no announcement, non-owner actions are **denied** (fail closed).

Contributors who are **not** on `maintainers` / `merge_maintainers` can still open **PRs** (`createPR` signs as themselves; no repo-owner impersonation).

---

## Security Benefits

1. **No unauthenticated bridge pushes** — challenge + `Authorization: Nostr …` is always required when pushing.
2. **No cross-repo identity confusion in the MCP** — owner actions require the owner’s key unless explicitly relaxed.
3. **Rate limiting** — per-pubkey limits prevent abuse (bridge-side).
4. **Audit trail** — pushes and signed events are attributable to a pubkey.

---

## SSH Key Support (Future)

Users can set SSH keys in gittr.space settings. Future enhancement:
- Bridge could accept SSH key verification
- Allows git CLI pushes with SSH keys
- Would query Nostr for SSH key events (kind 52)

---

## Credentials File

gittr-mcp auto-loads credentials from:

1. `.nostr-keys.json` (workspace)
2. `~/.nostr-identity.json`
3. `~/.config/gittr/keys.json`

Format:
```json
{
  "nsec": "nsec1...",  // or hex private key
  "npub": "npub1...",
  "pubkey": "64-char-hex"
}
```
