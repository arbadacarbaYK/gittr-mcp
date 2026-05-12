#!/usr/bin/env node
'use strict';

const gittr = require('../index.js');
const { nip19 } = require('nostr-tools');

const nsec = process.env.GITTR_TEST_NSEC || process.env.GITTR_TEST_PRIVKEY;
const relays = (process.env.GITTR_TEST_RELAYS || 'wss://relay.ngit.dev,wss://ngit-relay.nostrver.se,wss://git.shakespeare.diy')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const bridgeUrl = process.env.BRIDGE_URL || 'https://gittr.space';
const fallbackRepo = process.env.GITTR_TEST_FALLBACK_REPO || 'verify-1778578052940';

if (!nsec) {
  console.error('Missing GITTR_TEST_NSEC or GITTR_TEST_PRIVKEY');
  process.exit(1);
}

const repo = `matrix-${Date.now()}`;
const results = [];

function ok(name, data) { results.push({ name, status: 'PASS', data }); }
function fail(name, error, data) { results.push({ name, status: 'FAIL', error: String(error?.message || error), data }); }
function warn(name, error, data) { results.push({ name, status: 'WARN', error: String(error?.message || error), data }); }

function isKnownRelayValidationError(err) {
  const msg = err && (err.message || String(err));
  return typeof msg === 'string' && msg.includes('must reference an accepted repository or accepted event');
}

process.on('unhandledRejection', (reason) => {
  if (isKnownRelayValidationError(reason)) {
    warn('relay:async_validation_rejection', reason, { note: 'Known upstream relay acceptance race' });
    return;
  }
  // keep default failing behavior
  console.error('unhandledRejection', reason?.message || reason);
  process.exit(1);
});

async function run(name, fn, opts = {}) {
  try {
    const data = await fn();
    if (opts.warnWhen && opts.warnWhen(data)) warn(name, opts.warnLabel || 'warn condition', data);
    else ok(name, data);
    return data;
  } catch (e) {
    if (opts.allowFail) warn(name, e, opts.data);
    else fail(name, e, opts.data);
    return null;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retry(name, fn, {
  attempts = 4,
  delayMs = 2500,
  onRetry,
} = {}) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts) {
        if (typeof onRetry === 'function') onRetry(i, e);
        await sleep(delayMs);
      }
    }
  }
  throw lastError || new Error(`${name} failed after retries`);
}

(async () => {
  const hex = gittr.getPublicKey(nsec);
  const npub = nip19.npubEncode(hex);
  ok('auth:derive_keys', { hex, npub });

  const created = await run('repo:createRepo_with_push', async () => {
    return gittr.createRepo({
      name: repo,
      description: 'live matrix test',
      files: [{ path: 'README.md', content: `# ${repo}\n` }],
      relays,
      privkey: nsec,
      pushCostSats: 0,
    });
  }, {
    warnWhen: (d) => !!d && !!d.announcementError,
    warnLabel: 'announcement reported error',
  });

  const exists = await run('repo:bridge_exists', () => gittr.bridgeRepoExists({ ownerPubkey: hex, repo, bridgeUrl }));
  if (!exists?.exists) fail('repo:bridge_exists_semantic', 'Bridge reported exists=false', exists);
  const files = await run('repo:bridge_list_files', () => gittr.bridgeListFiles({ ownerPubkey: hex, repo, branch: 'main', bridgeUrl }));
  if (!Array.isArray(files?.files) || !files.files.some((f) => f.path === 'README.md')) fail('repo:bridge_list_files_semantic', 'README.md missing in bridge listing', files);
  const readme = await run('repo:bridge_get_readme', () => gittr.bridgeGetFileContent({ ownerPubkey: hex, repo, path: 'README.md', branch: 'main', bridgeUrl }));
  if (typeof readme?.content !== 'string' || !readme.content.includes(repo)) fail('repo:bridge_get_readme_semantic', 'Unexpected README content', readme);
  const refs = await run('repo:bridge_refs', () => gittr.bridgeListRefs({ ownerPubkey: hex, repo, bridgeUrl }));
  if (!Array.isArray(refs?.refs) || !refs.refs.some((r) => r.ref === 'refs/heads/main')) fail('repo:bridge_refs_semantic', 'main ref missing', refs);
  const commits = await run('repo:bridge_commits', () => gittr.bridgeListCommits({ ownerPubkey: hex, repo, branch: 'main', limit: 5, bridgeUrl }));
  if (!Array.isArray(commits?.commits) || commits.commits.length === 0) fail('repo:bridge_commits_semantic', 'No commits returned for main', commits);

  const resolved = await run('repo:resolve_by_npub', () => retry('repo:resolve_by_npub', () => gittr.resolveRepoByNostrId(npub, repo, { relays }), {
    attempts: 5,
    delayMs: 3000,
  }), {
    allowFail: true,
    data: { note: 'Known propagation gap if relay has not accepted announcement yet' },
  });
  if (resolved?.error) fail('repo:resolve_by_npub_semantic', resolved.error, resolved);

  const lifecycleRepo = (created && created.success !== false) ? repo : fallbackRepo;
  if (lifecycleRepo !== repo) {
    warn('repo:lifecycle_fallback', `Using fallback repo ${fallbackRepo} for issue/PR lifecycle checks`, {
      createdRepo: repo,
      fallbackRepo,
      reason: created?.error || created?.announcementError || 'created repo not relay-discoverable yet',
    });
  }

  const issue = await run('issues:create', () => retry('issues:create', () => gittr.createIssue({
    ownerPubkey: hex,
    repoId: lifecycleRepo,
    subject: 'Matrix issue',
    content: 'Created by matrix',
    privkey: nsec,
    relays,
  }), { attempts: 3, delayMs: 3000 }), {
    allowFail: true,
    data: { expected: 'May fail during relay visibility lag even after publish ack' },
  });

  const listedIssues = await run('issues:list', () => retry('issues:list', async () => {
    const rows = await gittr.listIssues({ ownerPubkey: hex, repoId: lifecycleRepo, relays });
    if (issue?.event?.id && Array.isArray(rows) && !rows.some((i) => i.id === issue.event.id)) {
      throw new Error('Created issue not yet visible on queried relays');
    }
    return rows;
  }, { attempts: 5, delayMs: 3000 }));
  if (issue?.event?.id && Array.isArray(listedIssues) && !listedIssues.some((i) => i.id === issue.event.id)) {
    fail('issues:list_semantic', 'Created issue not returned by listIssues', { createdIssueId: issue.event.id, listedCount: listedIssues.length });
  }
  const statusIssueId = issue?.event?.id || (Array.isArray(listedIssues) && listedIssues.length > 0 ? listedIssues[0].id : null);
  if (statusIssueId) {
    const byId = await run('issues:getById', () => retry('issues:getById', async () => {
      const found = await gittr.getIssueById({ issueId: statusIssueId, relays });
      if (found?.error) throw new Error(found.error);
      return found;
    }, { attempts: 5, delayMs: 3000 }));
    if (byId?.error) fail('issues:getById_semantic', byId.error, byId);
    await run('issues:close_status_1632', () => retry('issues:close_status_1632', () => gittr.publishStatusForRoot({
      statusKind: 1632,
      rootEventId: statusIssueId,
      ownerPubkey: hex,
      rootEventAuthor: hex,
      repoId: lifecycleRepo,
      content: 'closing test issue',
      privkey: nsec,
      relays,
    }), { attempts: 4, delayMs: 2500 }), { allowFail: true });
  }

  await run('prs:list', () => gittr.listPRs({ ownerPubkey: hex, repoId: lifecycleRepo, relays }));
  await run('prs:create_minimal', () => gittr.createPR({
    ownerPubkey: hex,
    repoId: lifecycleRepo,
    subject: 'Matrix PR probe',
    content: 'PR probe',
    commitId: created?.commit || 'HEAD',
    cloneUrls: [created?.cloneUrl].filter(Boolean),
    branchName: 'main',
    privkey: nsec,
    relays,
  }), { allowFail: true, data: { expected: 'May fail due to relay repo acceptance validation' } });

  await run('paywall:get_status', () => gittr.getPushPaywallStatus({ ownerPubkey: hex, repo, payerPubkey: hex, bridgeUrl }));
  await run('paywall:create_intent_without_wallet', () => gittr.createPushPaywallIntent({ ownerPubkey: hex, repo, payerPubkey: hex, bridgeUrl }), {
    allowFail: true,
    data: { expected: 'Should fail unless owner LNbits/Blink keys are provided' },
  });

  await run('bounty:create_invoice_without_lnbits', () => gittr.createBountyInvoice({ issueId: issue?.event?.id || 'dummy', amount: 10, bridgeUrl }), {
    allowFail: true,
    data: { expected: 'Should fail unless GITTR_LNBITS_* provided' },
  });

  const summary = {
    repo,
    ownerHex: hex,
    ownerNpub: npub,
    pass: results.filter((r) => r.status === 'PASS').length,
    warn: results.filter((r) => r.status === 'WARN').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('fatal', e.message || e);
  process.exit(1);
});
