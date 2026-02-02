// server.js - MCP server for gittr operations
const express = require('express');
const bodyParser = require('body-parser');
const nostrUtils = require('./nostr-utils');
const gittrShell = require('./gittr-shell');
const config = require('./config');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Middleware to log requests (no sensitive data)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'gittr-mcp', version: '0.1.0' });
});

// MCP manifest
app.get('/mcp/manifest', (req, res) => {
  res.json({
    mcp_version: '1.0',
    service: 'gittr-space-mcp-adapter',
    tools: [
      { name: 'auth.use_identity', description: 'Validate and return pubkey/npub for provided private key' },
      { name: 'repo.list', description: 'List repositories visible to a pubkey' },
      { name: 'repo.clone_url', description: 'Get canonical clone URL for a repo' },
      { name: 'repo.push_files', description: 'Programmatic push to bridge' },
      { name: 'repo.publish_nostr', description: 'Publish NIP-34 announcement/state events' },
      { name: 'issue.list', description: 'List issues and bounties' },
      { name: 'issue.create', description: 'Create a new issue' },
      { name: 'pr.create', description: 'Open a pull request' },
      { name: 'pr.merge', description: 'Merge a pull request (owner only)' },
      { name: 'bounty.list', description: 'List available bounties' },
      { name: 'bounty.submit', description: 'Submit PR as bounty fulfillment' }
    ]
  });
});

// auth.use_identity - validate private key and return pubkey/npub
app.post('/mcp/auth.use_identity', (req, res) => {
  try {
    const { nsec, privkey } = req.body;
    const key = nsec || privkey;
    
    if (!key) {
      return res.status(400).json({ error: 'missing nsec or privkey' });
    }

    const pubkey = nostrUtils.privToPub(key);
    const npub = nostrUtils.toNpub(pubkey);

    res.json({ pubkey, npub, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.list - list repos visible to a pubkey
app.post('/mcp/repo.list', async (req, res) => {
  try {
    const { pubkey, includePrivate } = req.body;
    
    if (!pubkey) {
      return res.status(400).json({ error: 'missing pubkey' });
    }

    const repos = await gittrShell.listRepos(pubkey, includePrivate);
    res.json({ repos, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.clone_url - get clone URL for a repo
app.post('/mcp/repo.clone_url', (req, res) => {
  try {
    const { repo, format } = req.body;
    
    if (!repo) {
      return res.status(400).json({ error: 'missing repo' });
    }

    const fmt = format || 'https';
    let url;

    if (fmt === 'ssh') {
      url = `git@gittr.space:${repo}.git`;
    } else {
      url = `${config.bridgeUrl}/${repo}`;
    }

    res.json({ url, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.push_files - programmatic push to bridge
app.post('/mcp/repo.push_files', async (req, res) => {
  try {
    const { ownerPubkey, repo, branch, commitMessage, files, privkey } = req.body;
    
    if (!ownerPubkey || !repo || !branch || !commitMessage || !files || !privkey) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const pubkey = nostrUtils.privToPub(privkey);
    
    if (pubkey !== ownerPubkey) {
      return res.status(403).json({ error: 'privkey does not match ownerPubkey' });
    }

    const payload = {
      ownerPubkey,
      repo,
      branch,
      commitMessage,
      files
    };

    // Sign the payload
    const { id, sig } = nostrUtils.signPayload(payload, privkey.startsWith('nsec') ? nostrUtils.bech32Decode(privkey) : privkey);
    payload.signature = sig;
    payload.signatureId = id;

    const result = await gittrShell.pushToBridge(payload);
    res.json({ ...result, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.publish_nostr - publish NIP-34 events
app.post('/mcp/repo.publish_nostr', async (req, res) => {
  try {
    const { ownerPubkey, repo, eventKind, payload, privkey, relays } = req.body;
    
    if (!ownerPubkey || !repo || !eventKind || !payload || !privkey) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const pubkey = nostrUtils.privToPub(privkey);
    
    if (pubkey !== ownerPubkey) {
      return res.status(403).json({ error: 'privkey does not match ownerPubkey' });
    }

    const content = JSON.stringify(payload);
    const event = nostrUtils.buildEvent({
      kind: eventKind,
      pubkey,
      content,
      tags: [['d', repo]]
    });

    const privhex = privkey.startsWith('nsec') ? nostrUtils.bech32Decode(privkey) : privkey;
    const signedEvent = nostrUtils.signEvent(event, privhex);

    const result = await gittrShell.publishEvent(signedEvent, relays || config.relays);
    res.json({ event: signedEvent, result, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// issue.list - list issues and bounties
app.post('/mcp/issue.list', async (req, res) => {
  try {
    const filters = req.body;
    const issues = await gittrShell.listIssues(filters);
    res.json({ issues, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// issue.create - create a new issue
app.post('/mcp/issue.create', async (req, res) => {
  try {
    const { repo, title, body, tags, bounty, privkey } = req.body;
    
    if (!repo || !title || !privkey) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    // TODO: Implement issue creation via bridge or CLI
    res.status(501).json({ error: 'not yet implemented' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// pr.create - create a pull request
app.post('/mcp/pr.create', async (req, res) => {
  try {
    const { repo, head, base, title, body, privkey } = req.body;
    
    if (!repo || !head || !base || !title || !privkey) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const result = await gittrShell.createPR({ repo, head, base, title, body, privkey });
    res.json({ ...result, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// pr.merge - merge a pull request
app.post('/mcp/pr.merge', async (req, res) => {
  try {
    // TODO: Implement PR merge via bridge or CLI
    res.status(501).json({ error: 'not yet implemented' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// bounty.list - list available bounties
app.post('/mcp/bounty.list', async (req, res) => {
  try {
    const filters = { ...req.body, only_bounties: true };
    const bounties = await gittrShell.listIssues(filters);
    res.json({ bounties, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// bounty.submit - submit bounty fulfillment
app.post('/mcp/bounty.submit', async (req, res) => {
  try {
    const { issueId, prUrl, evidence, privkey } = req.body;
    
    if (!issueId || !prUrl || !privkey) {
      return res.status(400).json({ error: 'missing required fields' });
    }

    const result = await gittrShell.submitBounty({ issueId, prUrl, evidence, privkey });
    res.json({ ...result, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`gittr-mcp adapter running on port ${PORT}`);
  console.log(`Bridge URL: ${config.bridgeUrl}`);
  console.log(`Relays: ${config.relays.join(', ')}`);
});

module.exports = app;
