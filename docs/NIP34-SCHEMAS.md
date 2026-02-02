# NIP-34 Schema Reference

Source: https://github.com/nostrability/schemata

## Event Structures

### Repository Announcement (kind 30617)

**Required tags:**
- `d` - Repository identifier (kebab-case short name)

**Optional tags:**
- `name` - Human-readable project name
- `description` - Brief description
- `web` - Browsing URL (can be multiple)
- `clone` - Git clone URL (can be multiple)
- `relays` - Nostr relay URLs (can be multiple)
- `maintainers` - Other recognized maintainer pubkeys
- `r` with marker `"euc"` - Earliest unique commit ID
- `t` - Hashtags/labels

**Content:** Empty string

**Example:**
```json
{
  "kind": 30617,
  "pubkey": "...",
  "created_at": 1234567890,
  "tags": [
    ["d", "my-awesome-repo"],
    ["name", "My Awesome Project"],
    ["description", "A cool project"],
    ["web", "https://gittr.space/user/my-awesome-repo"],
    ["clone", "https://gittr.space/user/my-awesome-repo.git"],
    ["relays", "wss://relay.noderunners.network"],
    ["r", "abc123commitid", "euc"]
  ],
  "content": ""
}
```

### Repository State (kind 30618)

**Required tags:**
- `d` - Repository identifier (matches announcement)

**Optional tags:**
- `refs/heads/<branch>` - Branch commit SHA
- `refs/tags/<tag>` - Tag commit SHA
- `HEAD` - Current HEAD ref

**Content:** Empty string

**Example:**
```json
{
  "kind": 30618,
  "pubkey": "...",
  "created_at": 1234567890,
  "tags": [
    ["d", "my-awesome-repo"],
    ["refs/heads/main", "def456commitsha"],
    ["refs/heads/develop", "ghi789commitsha"],
    ["HEAD", "ref: refs/heads/main"]
  ],
  "content": ""
}
```

### Issue (kind 1621)

**Required tags:**
- `a` - Reference to repository (`30617:<owner-pubkey>:<repo-id>`)
- `p` - Repository owner pubkey

**Optional tags:**
- `subject` - Issue subject/title
- `t` - Labels (can be multiple)

**Content:** Issue body as Markdown (required, min length 1)

**Example:**
```json
{
  "kind": 1621,
  "pubkey": "...",
  "created_at": 1234567890,
  "tags": [
    ["a", "30617:abc123ownerpubkey:my-awesome-repo"],
    ["p", "abc123ownerpubkey"],
    ["subject", "Bug: Application crashes on startup"],
    ["t", "bug"],
    ["t", "agent-friendly"]
  ],
  "content": "## Description\n\nThe application crashes when...\n\n## Steps to Reproduce\n1. ..."
}
```

### Patch (kind 1617)

**Required tags:**
- `a` - Reference to repository (`30617:<owner-pubkey>:<repo-id>`)
- `p` - Repository owner pubkey

**Optional tags:**
- `commit` - Current commit ID
- `parent-commit` - Parent commit ID
- `commit-pgp-sig` - PGP signature
- `committer` - Committer info (name, email, timestamp, timezone)
- `r` - Current commit ID (for discovery)
- `t` - Tags like `root`, `root-revision`

**Content:** Patch contents (git format-patch output)

**Example:**
```json
{
  "kind": 1617,
  "pubkey": "...",
  "created_at": 1234567890,
  "tags": [
    ["a", "30617:abc123ownerpubkey:my-awesome-repo"],
    ["p", "abc123ownerpubkey"],
    ["t", "root"]
  ],
  "content": "From abc123...\nDate: ...\nSubject: [PATCH] Fix crash on startup\n\n..."
}
```

### Pull Request (kind 1618) - NOT IN SCHEMA YET

According to NIP-34 spec (not in schemata repo yet):

**Required tags:**
- `a` - Reference to repository
- `p` - Repository owner
- `subject` - PR subject/title
- `c` - Current commit ID (tip of PR branch)
- `clone` - At least one clone URL where commit can be downloaded

**Optional tags:**
- `t` - Labels
- `branch-name` - Recommended branch name
- `merge-base` - Most recent common ancestor
- `e` - Root patch event ID (if PR is revision of patch)

**Content:** PR description as Markdown

**Example:**
```json
{
  "kind": 1618,
  "pubkey": "...",
  "created_at": 1234567890,
  "tags": [
    ["a", "30617:abc123ownerpubkey:my-awesome-repo"],
    ["p", "abc123ownerpubkey"],
    ["subject", "Fix: Application crash on startup"],
    ["c", "xyz789commitsha"],
    ["clone", "https://gittr.space/agent/my-awesome-repo.git"],
    ["branch-name", "fix-startup-crash"],
    ["t", "bugfix"]
  ],
  "content": "## Changes\n\nFixed the crash by...\n\n## Testing\nTested on..."
}
```

### Status Events

**Open (kind 1630)**
**Applied/Merged (kind 1631)**
**Closed (kind 1632)**
**Draft (kind 1633)**

**Required tags:**
- `e` with marker `root` - Issue/PR/patch event ID
- `p` - Repository owner
- `p` - Root event author

**Optional tags:**
- `a` - Reference to repository (for efficient filtering)
- `r` - Earliest unique commit ID
- For 1631: `merge-commit`, `applied-as-commits`

**Content:** Optional comment as Markdown

## Validation

Use the JSON Schema files from https://github.com/nostrability/schemata for validation:

```bash
git clone https://github.com/nostrability/schemata.git
cd schemata/nips/nip-34
# Find schemas: kind-1621/schema.yaml, kind-30617/schema.yaml, etc.
```

## Agent Implementation Notes

1. **Issues must have content** - Empty content will fail validation
2. **Always include `a` tag** - Required for linking to repository
3. **Repository announcements use `d` tag** - This is the repo ID
4. **PRs need `clone` URLs** - Agents must provide where code can be fetched
5. **Use proper tag markers** - `euc` for earliest unique commit, `root` for status events
