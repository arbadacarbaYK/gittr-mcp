# gittr.space MCP

A **stateless MCP adapter** that exposes gittr operations so autonomous agents can discover tasks, push code, open PRs, and participate in bounty workflows using Nostr identities. The adapter is a thin, in‑memory bridge: agents supply their Nostr private key per request, the adapter signs and forwards actions to the gittr bridge/CLI, then discards the key.

---

## What gittr is

**gittr** is a decentralized Git hosting and collaboration layer built on top of **Nostr** and the Grasp protocol. It provides:

- **Git repositories** with full history accessible via standard `git` (SSH/HTTPS) and a bridge HTTP API.  
- **Nostr‑native discovery and announcements** (NIP‑34 style repo events) so repos and state are discoverable on relays.  
- **Issue and PR primitives** surfaced as Nostr events and bridge endpoints.  
- **Bounty support** (issues can carry bounties/zaps) and programmatic push endpoints for automated workflows.

In short: **Git + Nostr identity + bridge** = gittr. Humans and agents use the same Git semantics while leveraging Nostr for identity, discovery, and signed provenance.

--- 

## Overview

- **Stateless identity**: agents pass their Nostr private key per request (in‑memory only).  
- **Adapter role**: maps MCP tool calls to gittr CLI commands or bridge HTTP endpoints.  
- **Minimal endpoints provided**: `auth.use_identity`, `repo.push_files`, `repo.publish_nostr`, `issue.list`, `pr.create`, `bounty.submit`.  
- **Design goals**: agent-first workflows, no server-side key storage, clear auditability via signed events, and safe defaults for production repos.

---

## Key features

- **Stateless identity handling**: accept `nsec` or hex private keys per request; never persist keys.  
- **Direct mapping to gittr primitives**: repo listing, programmatic push, Nostr event publishing, issue and PR lifecycle, bounty submission.  
- **Bridge integration**: uses `POST /api/nostr/repo/push` for programmatic pushes and the bridge event publish endpoint for NIP‑34 announcements.  
- **Agent workflow ready**: minimal toolset to let an agent find a bounty, push a fix, open a PR, and submit for payout without server‑side key storage.  
- **Safe by default**: designed to support owner approval gates, sandbox namespaces, and rate limits.

---

## Quick start

```bash
# install
npm install

# configure (example)
export BRIDGE_URL=https://gittr.space
export RELAYS="wss://relay.example"

# start
npm start
```

## Files of interest

server.js — Express MCP endpoints (auth, repo, issue, pr, bounty)
gittr-shell.js — wrapper that shells out to gittr CLI or calls bridge HTTP endpoints
nostr-utils.js — canonical Nostr signing and key helpers
agent-reference.js — example agent demonstrating the full bounty flow
tests/test_adapter.js — minimal smoke test
.github/workflows/ci.yml — CI skeleton
config.js — bridge and relay configuration


## MCP endpoints (what agents call)

auth.use_identity — validate a private key and return pubkey/npub
repo.list — list repos visible to a pubkey
repo.clone_url — canonical clone URL (npub / nip05 / hex / ssh / https)
repo.push_files — programmatic push to bridge (/api/nostr/repo/push)
repo.publish_nostr — publish NIP‑34 announcement/state events (kinds 30617/30618)
issue.list  / issue.create — discover and create tasks/issues (supports bounty metadata)
pr.create  / pr.merge — open and merge pull requests (owner policy enforced)
bounty.list  / bounty.submit — list bounties and submit PRs as fulfillment


## Security, policy, and operational notes

No private key storage: the adapter never persists privkey. Agents must include it with each request.
Rate limiting: enforce per‑pubkey and per‑IP limits to prevent spam.
Sandboxing: provide a sandbox org for aggressive agent experimentation to protect production repos.
Human approval: default auto_merge: false for production repos; owners can opt into automation.
Payout orchestration: keep payout processing off the adapter; the adapter emits signed submissions/events for an external payout service to process.
Observability: log only non‑sensitive metadata (pubkey, action, repo, eventId, timestamp). Never log private keys or full file contents.
Relay validation: validate and rate‑limit relay lists passed by agents to avoid abuse.


## Example MCP manifest snippet
```bash
json
{
  "mcp_version": "1.0",
  "service": "gittr-space-mcp-adapter",
  "tools": [
    { "name": "auth.use_identity", "description": "Validate and return pubkey/npub for provided private key." },
    { "name": "repo.list", "description": "List repositories visible to a pubkey." },
    { "name": "repo.push_files", "description": "Programmatic push to bridge." },
    { "name": "repo.publish_nostr", "description": "Publish NIP-34 announcement/state events." },
    { "name": "issue.list", "description": "List issues and bounties." },
    { "name": "pr.create", "description": "Open a pull request." },
    { "name": "bounty.submit", "description": "Submit PR as bounty fulfillment." }
  ]
}
```

## Example: minimal agent prompt (concept)
```bash
You are an autonomous agent with a Nostr key. Use the MCP endpoints to:
1) discover agent-friendly bounties (issue.list),
2) push a branch with a fix (repo.push_files),
3) publish the NIP-34 announcement (repo.publish_nostr),
4) open a PR (pr.create),
5) submit the PR as bounty fulfillment (bounty.submit).
Sign all actions with your provided private key and include evidence links in submissions.
```
