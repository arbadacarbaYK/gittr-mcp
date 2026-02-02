# OpenClaw Integration Guide

## How OpenClaw Users Can Add gittr-mcp

OpenClaw uses **mcporter** to manage MCP servers. Users can add gittr-mcp two ways:

### Option 1: npm Package (Recommended after publish)

Once published to npm:

```bash
# Install globally
npm install -g gittr-mcp

# Add to mcporter config
mcporter config add gittr-mcp --command "node $(npm root -g)/gittr-mcp/index.js"
```

### Option 2: Clone from GitHub (Now)

```bash
# Clone repo
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install

# Add to mcporter
mcporter config add gittr-mcp --command "node $(pwd)/index.js"
```

### Verify Installation

```bash
# List configured servers
mcporter list

# Test gittr-mcp
mcporter call gittr-mcp.listRepos limit=10
```

---

## PR to OpenClaw Repo (Future)

Once package is published and proven, we could:

1. **PR to add to mcporter defaults** - Add gittr-mcp to recommended MCP servers list
2. **PR to add skill** - Create OpenClaw skill that wraps gittr-mcp functions
3. **Add to docs** - Document gittr integration in OpenClaw docs

### What to PR

**File:** `skills/gittr-mcp/SKILL.md`

```markdown
---
name: gittr-mcp
description: Interact with gittr.space - discover repos, hunt Lightning bounties, create issues/PRs on Nostr (NIP-34)
homepage: https://github.com/arbadacarbaYK/gittr-mcp
metadata:
  {
    "openclaw":
      {
        "emoji": "⚡",
        "requires": { "bins": ["mcporter"] },
        "install":
          [
            {
              "id": "npm",
              "kind": "node",
              "package": "gittr-mcp",
              "bins": [],
              "label": "Install gittr-mcp (npm)",
            },
          ],
      },
  }
---

# gittr-mcp

Interact with gittr.space - decentralized Git on Nostr with Lightning bounties.

## Quick Start

```bash
# Via mcporter
mcporter call gittr-mcp.listRepos limit=10
mcporter call gittr-mcp.listBounties minAmount=1000
```

## Features

- Discover repos from Nostr relays (NIP-34)
- Hunt Lightning bounties  
- Create issues/PRs
- Push code (no privkey needed!)

## Documentation

Full docs: https://github.com/arbadacarbaYK/gittr-mcp

---

## Triggers

When user mentions:
- "gittr", "git on Nostr"
- "hunt bounties", "Lightning bounties"
- "NIP-34", "Nostr git"

Use this skill to interact with gittr.space.
```

### Timeline

1. ✅ Now: Package ready
2. → Publish to npm
3. → Prove it works (downloads, usage)
4. → Create PR to OpenClaw after validation
5. → Add to ClawHub

---

## For Now

Users can manually add gittr-mcp using mcporter config commands above.

After npm publish + proven adoption → PR to OpenClaw makes sense!
