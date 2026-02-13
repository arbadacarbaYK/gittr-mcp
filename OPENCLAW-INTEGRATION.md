# OpenClaw Integration Guide

## How OpenClaw Users Can Add gittr-mcp

OpenClaw uses **mcporter** to manage MCP servers. Clone and use directly:

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

## For OpenClaw Skills

Create a skill at `skills/gittr-mcp/SKILL.md`:

```markdown
---
name: gittr-mcp
description: Interact with gittr.space - discover repos, hunt Lightning bounties, create issues/PRs on Nostr (NIP-34)
---

# gittr-mcp

Interact with gittr.space - decentralized Git on Nostr with Lightning bounties.

## Quick Start

```bash
mcporter call gittr-mcp.listRepos limit=10
mcporter call gittr-mcp.listBounties minAmount=1000
```

## Features

- Discover repos from Nostr relays (NIP-34)
- Hunt Lightning bounties  
- Create issues/PRs
- Push code (requires privkey for auth)

## Documentation

Full docs: https://github.com/arbadacarbaYK/gittr-mcp
```
