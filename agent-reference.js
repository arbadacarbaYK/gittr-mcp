// agent-reference.js
const fetch = require('node-fetch');
const MCP_BASE = process.env.MCP_BASE || 'http://localhost:3000/mcp';

async function callTool(tool, payload) {
  const r = await fetch(`${MCP_BASE}/${tool}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function run(nsec) {
  const identity = await callTool('auth.use_identity', { nsec });
  const pubkey = identity.pubkey;

  const repos = await callTool('repo.list', { pubkey });
  const issues = await callTool('issue.list', { tags: ['agent-friendly'], only_bounties: true });

  if (!issues || issues.length === 0) return console.log('no bounties found');

  const issue = issues[0];
  const repo = issue.repo || repos[0].repo;

  const files = [{ path: 'agent-fix.txt', content: 'automated fix\n' }];

  const pushResp = await callTool('repo.push_files', {
    ownerPubkey: pubkey,
    repo,
    branch: `agent/${Date.now()}`,
    commitMessage: `Agent fix for ${issue.issueId}`,
    files,
    privkey: nsec
  });

  await callTool('repo.publish_nostr', {
    ownerPubkey: pubkey,
    repo,
    eventKind: 30617,
    payload: { repo, branch: pushResp.commitRef, message: 'agent push' },
    privkey: nsec
  });

  const pr = await callTool('pr.create', {
    repo,
    head: pushResp.commitRef,
    base: 'main',
    title: `Agent fix for ${issue.issueId}`,
    body: `Automated PR by agent for ${issue.issueId}`,
    privkey: nsec
  });

  const submission = await callTool('bounty.submit', {
    issueId: issue.issueId,
    prUrl: pr.url,
    evidence: `PR: ${pr.url}`,
    privkey: nsec
  });

  console.log('submission', submission);
}

if (require.main === module) {
  const nsec = process.env.NSEC;
  if (!nsec) return console.error('set NSEC env var');
  run(nsec).catch(e => console.error(e));
}
