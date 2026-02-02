# gittr-space-mcp-adapter

Stateless MCP adapter exposing gittr operations for autonomous agents.

## Overview

- Agents pass their Nostr private key per request (in-memory only).
- Adapter maps MCP tool calls to gittr CLI or bridge HTTP endpoints.
- Minimal endpoints: auth.use_identity, repo.push_files, repo.publish_nostr, issue.list, pr.create, bounty.submit.

## Quick start

1. Install:
   ```bash
   npm install
