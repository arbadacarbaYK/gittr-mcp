// server.js - Production MCP server for gittr with NIP-34 support
const express = require('express');
const bodyParser = require('body-parser');
const nostrUtils = require('./nostr-utils');
const gittrNostr = require('./gittr-nostr');
const config = require('./config');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;

// Middleware: log requests (no sensitive data)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'gittr-mcp', 
    version: '0.2.0',
    nip34: true,
    relays: config.relays
  });
});

// MCP manifest
app.get('/mcp/manifest', (req, res) => {
  res.json({
    mcp_version: '1.0',
    service: 'gittr-space-mcp-adapter',
    nip34_compliant: true,
    tools: [
      { name: 'auth.use_identity', description: 'Validate Nostr private key, return pubkey/npub' },
      { name: 'repo.list', description: 'Query Nostr for repository announcements (kind 30617)' },
      { name: 'repo.push_files', description: 'Push files to bridge via HTTP API (no privkey needed)' },
      { name: 'repo.publish_announcement', description: 'Publish repository announcement (kind 30617)' },
      { name: 'repo.publish_state', description: 'Publish repository state (kind 30618)' },
      { name: 'issue.list', description: 'Query Nostr for issues (kind 1621)' },
      { name: 'issue.create', description: 'Create and publish issue (kind 1621)' },
      { name: 'pr.list', description: 'Query Nostr for pull requests (kind 1618)' },
      { name: 'pr.create', description: 'Create and publish PR (kind 1618)' },
      { name: 'bounty.create', description: 'Create Lightning bounty invoice (HTTP API)' }
    ]
  });
});

// auth.use_identity - validate private key
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

// repo.list - query Nostr for repos
app.post('/mcp/repo.list', async (req, res) => {
  try {
    const { pubkey, relays } = req.body;
    
    if (!pubkey) {
      return res.status(400).json({ error: 'missing pubkey' });
    }

    const repos = await gittrNostr.listRepos(pubkey, relays);
    res.json({ repos, count: repos.length, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.push_files - push to bridge via HTTP
app.post('/mcp/repo.push_files', async (req, res) => {
  try {
    const { ownerPubkey, repo, branch, files, commitMessage } = req.body;
    
    if (!ownerPubkey || !repo || !files) {
      return res.status(400).json({ error: 'missing required fields: ownerPubkey, repo, files' });
    }

    const result = await gittrNostr.pushToBridge({
      ownerPubkey,
      repo,
      branch: branch || 'main',
      files,
      commitMessage: commitMessage || 'Push from MCP'
    });

    res.json({ ...result, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.publish_announcement - publish kind 30617
app.post('/mcp/repo.publish_announcement', async (req, res) => {
  try {
    const { repoId, name, description, web, clone, privkey, relays } = req.body;
    
    if (!repoId || !name || !privkey) {
      return res.status(400).json({ error: 'missing required fields: repoId, name, privkey' });
    }

    const result = await gittrNostr.publishRepoAnnouncement({
      repoId,
      name,
      description: description || '',
      web: web || [],
      clone: clone || [],
      privkey,
      relays
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// repo.publish_state - publish kind 30618
app.post('/mcp/repo.publish_state', async (req, res) => {
  try {
    const { repoId, refs, privkey, relays } = req.body;
    
    if (!repoId || !refs || !privkey) {
      return res.status(400).json({ error: 'missing required fields: repoId, refs, privkey' });
    }

    const result = await gittrNostr.publishRepoState({
      repoId,
      refs,
      privkey,
      relays
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// issue.list - query Nostr for issues
app.post('/mcp/issue.list', async (req, res) => {
  try {
    const { ownerPubkey, repoId, labels, relays } = req.body;
    
    if (!ownerPubkey || !repoId) {
      return res.status(400).json({ error: 'missing required fields: ownerPubkey, repoId' });
    }

    const issues = await gittrNostr.listIssues({
      ownerPubkey,
      repoId,
      labels: labels || [],
      relays
    });

    res.json({ issues, count: issues.length, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// issue.create - create and publish kind 1621
app.post('/mcp/issue.create', async (req, res) => {
  try {
    const { ownerPubkey, repoId, subject, content, labels, privkey, relays } = req.body;
    
    if (!ownerPubkey || !repoId || !subject || !content || !privkey) {
      return res.status(400).json({ error: 'missing required fields: ownerPubkey, repoId, subject, content, privkey' });
    }

    const result = await gittrNostr.createIssue({
      ownerPubkey,
      repoId,
      subject,
      content,
      labels: labels || [],
      privkey,
      relays
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// pr.list - query Nostr for PRs
app.post('/mcp/pr.list', async (req, res) => {
  try {
    const { ownerPubkey, repoId, relays } = req.body;
    
    if (!ownerPubkey || !repoId) {
      return res.status(400).json({ error: 'missing required fields: ownerPubkey, repoId' });
    }

    const prs = await gittrNostr.listPRs({
      ownerPubkey,
      repoId,
      relays
    });

    res.json({ prs, count: prs.length, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// pr.create - create and publish kind 1618
app.post('/mcp/pr.create', async (req, res) => {
  try {
    const { ownerPubkey, repoId, subject, content, commitId, cloneUrls, branchName, labels, privkey, relays } = req.body;
    
    if (!ownerPubkey || !repoId || !subject || !content || !commitId || !cloneUrls || !privkey) {
      return res.status(400).json({ error: 'missing required fields: ownerPubkey, repoId, subject, content, commitId, cloneUrls, privkey' });
    }

    const result = await gittrNostr.createPR({
      ownerPubkey,
      repoId,
      subject,
      content,
      commitId,
      cloneUrls,
      branchName: branchName || 'agent-branch',
      labels: labels || [],
      privkey,
      relays
    });

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// bounty.create - create Lightning invoice via HTTP API
app.post('/mcp/bounty.create', async (req, res) => {
  try {
    const { amount, issueId, description } = req.body;
    
    if (!amount || !issueId) {
      return res.status(400).json({ error: 'missing required fields: amount, issueId' });
    }

    // Call gittr's bounty API
    const response = await fetch(`${config.bridgeUrl}/api/bounty/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, issueId, description })
    });

    const result = await response.json();
    res.json(result);
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
  console.log(`🚀 gittr-mcp adapter v0.2.0 running on port ${PORT}`);
  console.log(`📡 Bridge URL: ${config.bridgeUrl}`);
  console.log(`🔗 Relays: ${config.relays.join(', ')}`);
  console.log(`✅ NIP-34 compliant`);
});

module.exports = app;
