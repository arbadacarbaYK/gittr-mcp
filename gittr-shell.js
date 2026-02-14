// gittr-shell.js
const { execFile } = require('child_process');
const fetchModule = require('node-fetch');
const fetch = fetchModule.default || fetchModule;
const config = require('./config');

function execGittr(args) {
  return new Promise((resolve, reject) => {
    execFile('gittr', args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try { return resolve(JSON.parse(stdout)); } catch (e) { return resolve(stdout.toString()); }
    });
  });
}

// Full PR creation - NOTE: Requires gittr CLI (not available in this environment)
// Use gittr.space web UI to push branch, then createPR via Nostr
async function createPRViaGittrCLI({ repo, head, base, title, body, privkey }) {
  return { 
    note: 'gittr CLI not installed. Workflow: 1) Push branch via gittr.space web UI 2) Use createPR with commit hash',
    webUI: 'https://gittr.space'
  };
}

async function listRepos(pubkey, includePrivate) {
  try {
    return await execGittr(['repo', 'list', '--pubkey', pubkey, includePrivate ? '--private' : '--public']);
  } catch (e) {
    const r = await fetch(`${config.bridgeUrl}/api/repos?owner=${pubkey}`);
    return r.json();
  }
}

async function pushToBridge(payload) {
  const r = await fetch(`${config.bridgeUrl}/api/nostr/repo/push`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function publishEvent(event, relays = []) {
  const r = await fetch(`${config.bridgeUrl}/api/nostr/event/publish`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ event, relays })
  });
  return r.json();
}

async function listIssues(filters) {
  return execGittr(['issue', 'list', '--json', JSON.stringify(filters)]);
}

async function createPR({ repo, head, base, title, body, privkey }) {
  return execGittr(['pr', 'create', '--repo', repo, '--head', head, '--base', base, '--title', title, '--body', body, '--sign', privkey]);
}

async function submitBounty({ issueId, prUrl, evidence, privkey }) {
  return execGittr(['bounty', 'submit', '--issue', issueId, '--pr', prUrl, '--evidence', evidence, '--sign', privkey]);
}

module.exports = { 
  listRepos, 
  pushToBridge, 
  publishEvent, 
  listIssues, 
  createPR, 
  submitBounty,
  createPRViaGittrCLI 
};
