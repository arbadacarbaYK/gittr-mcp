# gittr.space MCP

Stateless MCP adapter exposing gittr operations for autonomous agents.

## Overview

- Agents pass their Nostr private key per request (in-memory only).
- Adapter maps MCP tool calls to gittr CLI or bridge HTTP endpoints.
- Minimal endpoints: auth.use_identity, repo.push_files, repo.publish_nostr, issue.list, pr.create, bounty.submit.

## Quick start

1. Install:
   ```bash
   npm install```

Configure environment:

```bash
export BRIDGE_URL=https://gittr.space
export RELAYS="wss://relay.example"
```

Run:

```bash
npm start
```

Files
server.js — Express MCP endpoints

gittr-shell.js — wrapper for gittr CLI / bridge calls

nostr-utils.js — signing and key helpers

agent-reference.js — example agent performing bounty flow

tests/test_adapter.js — minimal smoke test

.github/workflows/ci.yml — CI skeleton


```Code

---

#### 3. `server.js`
```js
// server.js
const express = require('express');
const bodyParser = require('body-parser');
const gittr = require('./gittr-shell');
const nostr = require('./nostr-utils');
const config = require('./config');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// auth.use_identity
app.post('/mcp/auth.use_identity', async (req, res) => {
  try {
    const { nsec, hex_privkey } = req.body;
    const priv = nsec || hex_privkey;
    if (!priv) return res.status(400).json({ error: 'missing key' });
    const pubkey = nostr.privToPub(priv);
    return res.json({ pubkey, npub: nostr.toNpub(pubkey) });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// repo.list
app.post('/mcp/repo.list', async (req, res) => {
  try {
    const { pubkey, include_private } = req.body;
    const repos = await gittr.listRepos(pubkey, !!include_private);
    return res.json(repos);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// repo.push_files
app.post('/mcp/repo.push_files', async (req, res) => {
  try {
    const { ownerPubkey, repo, branch, files, commitMessage, privkey } = req.body;
    if (!privkey) return res.status(400).json({ error: 'missing privkey' });
    const payload = { ownerPubkey, repo, branch, files, commitMessage };
    const signed = nostr.signPayload(payload, privkey);
    const bridgeResp = await gittr.pushToBridge({ ...payload, signature: signed.sig });
    return res.json({ commitRef: bridgeResp.commitRef || bridgeResp.ref || null, status: 'ok', bridgeResponse: bridgeResp });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// repo.publish_nostr
app.post('/mcp/repo.publish_nostr', async (req, res) => {
  try {
    const { ownerPubkey, repo, eventKind, payload, privkey, relays } = req.body;
    const event = nostr.buildEvent({ kind: eventKind, content: JSON.stringify(payload), pubkey: ownerPubkey, tags: [['repo', repo]] });
    const signed = nostr.signEvent(event, privkey);
    const publishResp = await gittr.publishEvent(signed, relays);
    return res.json({ eventId: signed.id, relays: publishResp });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// issue.list
app.post('/mcp/issue.list', async (req, res) => {
  try {
    const issues = await gittr.listIssues(req.body);
    return res.json(issues);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// pr.create
app.post('/mcp/pr.create', async (req, res) => {
  try {
    const { repo, head, base, title, body, privkey } = req.body;
    const pr = await gittr.createPR({ repo, head, base, title, body, privkey });
    return res.json(pr);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// bounty.submit
app.post('/mcp/bounty.submit', async (req, res) => {
  try {
    const { issueId, prUrl, evidence, privkey } = req.body;
    const submission = await gittr.submitBounty({ issueId, prUrl, evidence, privkey });
    return res.json(submission);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCP adapter listening on ${PORT}`));
```

