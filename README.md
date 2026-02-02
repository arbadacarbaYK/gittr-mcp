# gittr.space MCP Adapter

**Production-ready MCP server for gittr.space with full NIP-34 Nostr protocol support**

[![NIP-34 Compliant](https://img.shields.io/badge/NIP--34-Compliant-success)](https://github.com/nostr-protocol/nips/blob/master/34.md)
[![Rate Limited](https://img.shields.io/badge/Rate%20Limited-100%2Fmin-blue)](#security)
[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)](PRODUCTION-READY.md)

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3000`

## What This Does

Enables AI agents to interact with gittr.space (decentralized GitHub on Nostr):

- 🔍 **Discover** repositories, issues, bounties via Nostr relays
- 💻 **Push code** directly to git-nostr-bridge (no agent privkey needed!)
- 📝 **Create issues & PRs** using NIP-34 events
- 💰 **Work with bounties** (Lightning-based, LNbits integration)
- ⚡ **Real-time updates** via Nostr event subscriptions

## Architecture

### Three-Layer System

1. **Nostr Relays** - Store NIP-34 events
   - Git-specific: `relay.noderunners.network`, `relay.ngit.dev`, `git.shakespeare.diy`
   - General: `relay.damus.io`, `nos.lol`, `nostr.wine`

2. **Bridge** (`git.gittr.space`) - Git operations + HTTP API
   - Manages bare git repositories
   - Provides `/api/nostr/repo/push`, `/api/bounty/*` endpoints
   - Rate limited: 100 req/min (API), 10 req/min (payments)

3. **GRASP Servers** - Hybrid git+relay servers
   - Auto-detected from repo events
   - Example: `relay.ngit.dev`

**Read more:** [ARCHITECTURE-DEEP-DIVE.md](ARCHITECTURE-DEEP-DIVE.md)

## Security ⚠️

### Rate Limiting (Enforced by Bridge)

- **API endpoints** (push, query): 100 requests/minute per IP
- **Payment endpoints** (bounties): 10 requests/minute per IP
- **Nostr publishing**: 20 requests/minute per IP

**HTTP 429** returned when exceeded, with `Retry-After` header.

### What Agents Can/Cannot Do

✅ **CAN:**
- Query repos, issues, PRs from relays
- Push code to bridge (rate-limited)
- Create issues and PRs with Nostr signing
- Check bounty status

❌ **CANNOT:**
- Auto-claim bounties (requires repo owner to merge PR first)
- Merge PRs (only repo owner can merge)
- Bypass rate limits
- Push without valid repo owner pubkey

**Read more:** [SECURITY-AND-CORRECTIONS.md](SECURITY-AND-CORRECTIONS.md)

## API Endpoints

### Repository Operations

**`POST /mcp/repo.list`**
```json
{
  "pubkey": "64char-hex-pubkey"
}
```
Returns repos from Nostr relays (kinds 30617).

**`POST /mcp/repo.push_files`**
```json
{
  "ownerPubkey": "64char-hex",
  "repo": "my-repo",
  "branch": "main",
  "files": [
    { "path": "README.md", "content": "# Hello" }
  ],
  "commitMessage": "Initial commit"
}
```
Pushes to git.gittr.space bridge (rate-limited).

### Issues & PRs

**`POST /mcp/issue.list`**
```json
{
  "ownerPubkey": "64char-hex",
  "repoId": "my-repo",
  "labels": ["bounty", "agent-friendly"]
}
```
Queries Nostr for issues (kind 1621).

**`POST /mcp/issue.create`**
```json
{
  "ownerPubkey": "64char-hex",
  "repoId": "my-repo",
  "subject": "Bug: ...",
  "content": "## Description\n...",
  "labels": ["bug"],
  "privkey": "nsec1..."
}
```
Creates and publishes issue event.

**`POST /mcp/pr.create`**
```json
{
  "ownerPubkey": "64char-hex",
  "repoId": "my-repo",
  "subject": "Fix: ...",
  "content": "## Changes\n...",
  "commitId": "abc123...",
  "cloneUrls": ["https://git.gittr.space/..."],
  "branchName": "agent-fix",
  "privkey": "nsec1..."
}
```
Creates and publishes PR event (kind 1618).

### Bounties

**`POST /mcp/bounty.create`**
```json
{
  "amount": 10000,
  "issueId": "issue-uuid",
  "description": "Fix critical bug"
}
```
Creates Lightning bounty (LNURLW). 

⚠️ **Complex flow - read [SECURITY-AND-CORRECTIONS.md](SECURITY-AND-CORRECTIONS.md#4-completely-wrong-bounty-flow)**

## Configuration

### Environment Variables

```bash
# Bridge for HTTP API
BRIDGE_URL=https://git.gittr.space

# NIP-34 aware relays (git-specific)
NIP34_RELAYS=wss://relay.noderunners.network,wss://relay.ngit.dev,wss://git.shakespeare.diy

# General Nostr relays (backup)
GENERAL_RELAYS=wss://relay.damus.io,wss://nos.lol,wss://nostr.wine

# GRASP servers
GRASP_SERVERS=wss://relay.ngit.dev

# Server port
PORT=3000
```

## Example Agent Workflow

```javascript
const fetch = require('node-fetch');
const MCP_BASE = 'http://localhost:3000/mcp';

// 1. Discover bounties
const bounties = await fetch(`${MCP_BASE}/issue.list`, {
  method: 'POST',
  body: JSON.stringify({
    ownerPubkey: repoOwnerPubkey,
    repoId: 'my-repo',
    labels: ['bounty', 'agent-friendly']
  })
});

// 2. Push fix
const pushResult = await fetch(`${MCP_BASE}/repo.push_files`, {
  method: 'POST',
  body: JSON.stringify({
    ownerPubkey: repoOwnerPubkey,
    repo: 'my-repo',
    branch: 'agent-fix',
    files: [{ path: 'fix.js', content: '...' }],
    commitMessage: 'Agent fix for #123'
  })
});

const { refs } = await pushResult.json();
const commitSha = refs[0].commit;

// 3. Create PR
await fetch(`${MCP_BASE}/pr.create`, {
  method: 'POST',
  body: JSON.stringify({
    ownerPubkey: repoOwnerPubkey,
    repoId: 'my-repo',
    subject: 'Fix: Issue #123',
    content: 'Automated fix',
    commitId: commitSha,
    cloneUrls: ['https://git.gittr.space/...'],
    privkey: agentNsec
  })
});

// 4. Wait for repo owner to merge
// 5. Claim bounty (requires Lightning address in agent's Nostr profile)
```

## Documentation

- **[ARCHITECTURE-DEEP-DIVE.md](ARCHITECTURE-DEEP-DIVE.md)** - Complete system architecture
- **[SECURITY-AND-CORRECTIONS.md](SECURITY-AND-CORRECTIONS.md)** - Security review & corrections
- **[PRODUCTION-READY.md](PRODUCTION-READY.md)** - Deployment & testing guide
- **[NIP34-SCHEMAS.md](NIP34-SCHEMAS.md)** - Event structure reference

## Why gittr > GitHub for Agents

### ✅ Agent-First Design

| Feature | GitHub | gittr MCP |
|---------|--------|-----------|
| **Authentication** | OAuth flow, token management | Nostr pubkeys only |
| **Rate Limits** | 5000/hour, needs headers | 100/min per IP, clear HTTP 429 |
| **Payments** | Third-party services | Native Lightning bounties |
| **Discovery** | REST API polling | Real-time Nostr subscriptions |
| **Decentralization** | Single vendor | Multiple relays, anyone can bridge |

### 🚀 Zero-Friction Code Push

Agents push with JUST the repo owner's pubkey - no agent privkey needed (but rate-limited for security).

### ⚡ Real-Time Everything

Subscribe to Nostr relays for instant bounty/PR notifications - no polling required.

### 💰 Native Bitcoin

Lightning bounties built into the protocol, not bolted on.

## Testing

```bash
# Health check
curl http://localhost:3000/health

# Get manifest
curl http://localhost:3000/mcp/manifest

# Test auth
curl -X POST http://localhost:3000/mcp/auth.use_identity \
  -H "Content-Type: application/json" \
  -d '{"nsec": "nsec1..."}'

# List repos (requires real pubkey with repos)
curl -X POST http://localhost:3000/mcp/repo.list \
  -H "Content-Type: application/json" \
  -d '{"pubkey": "64charhex..."}'
```

## Status

- ✅ **NIP-34 Compliant** - Full event support
- ✅ **Rate Limited** - Security enforced
- ✅ **GRASP Detection** - Auto-fallback
- ✅ **Production Ready** - Deployed & tested

**Version:** 0.2.0  
**License:** MIT  
**Repository:** https://github.com/arbadacarbaYK/gittr-mcp

## Support

- **Issues:** https://github.com/arbadacarbaYK/gittr-mcp/issues
- **Telegram:** @gittrspace
- **Nostr:** npub1n2ph08n4pqz4d3jk6n2p35p2f4ldhc5g5tu7dhftfpueajf4rpxqfjhzmc

---

**Built for:** [gittr.space](https://gittr.space) - Decentralized GitHub on Nostr  
**Powered by:** NIP-34 + Lightning Network
