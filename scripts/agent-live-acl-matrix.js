#!/usr/bin/env node
'use strict';

/**
 * Dual-identity ACL hammer (ONE disposable repo → soft-delete at end).
 *
 * Owner:  GITTR_TEST_NSEC / GITTR_TEST_PRIVKEY
 * Smo:    ephemeral key generated each run (no merge/push rights)
 *
 * Covers:
 *  - createRepo (owner)
 *  - createIssue (smo)
 *  - listIssues / bridge reads
 *  - feature push + createPR (smo opens PR on owner tip)
 *  - mergePullRequest as owner → PASS
 *  - second PR + mergePullRequest as smo → expect DENY
 *  - softDeleteRepo / deleteRepo cleanup
 *
 * Run:
 *   GITTR_TEST_NSEC=nsec1... npm run test:live:acl
 */

const { generateSecretKey } = require('nostr-tools/pure');
const { nip19 } = require('nostr-tools');
const gittr = require('../index.js');

const ownerNsec = process.env.GITTR_TEST_NSEC || process.env.GITTR_TEST_PRIVKEY;
const relays = (
  process.env.GITTR_TEST_RELAYS ||
  // Prefer general relays that actually store 30617/1618/1621; git-only relays often
  // reject or never echo events for ACL tests.
  'wss://nos.lol,wss://relay.damus.io,wss://purplepag.es,wss://relay.ngit.dev'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const bridgeUrl = process.env.BRIDGE_URL || 'https://gittr.space';

if (!ownerNsec) {
  console.error('Missing GITTR_TEST_NSEC or GITTR_TEST_PRIVKEY');
  process.exit(1);
}

const repo = `acl-hammer-${Date.now().toString(36)}`;
const results = [];

function ok(name, data) {
  results.push({ name, status: 'PASS', data });
  console.log(`✓ ${name}`);
}
function fail(name, error, data) {
  results.push({
    name,
    status: 'FAIL',
    error: String(error?.message || error),
    data,
  });
  console.error(`✗ ${name}: ${error?.message || error}`);
}
function warn(name, error, data) {
  results.push({
    name,
    status: 'WARN',
    error: String(error?.message || error),
    data,
  });
  console.warn(`! ${name}: ${error?.message || error}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retry(fn, { attempts = 4, delayMs = 3000 } = {}) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw last;
}

function looksLikeDenied(errOrResult) {
  const s = JSON.stringify(errOrResult || {}).toLowerCase();
  return (
    (s.includes('permission') ||
      s.includes('denied') ||
      s.includes('not authorized') ||
      s.includes('not allowed') ||
      s.includes('acting authority') ||
      s.includes('maintainers') ||
      s.includes('only the owner')) &&
    !s.includes('pr not found')
  );
}

(async () => {
  const ownerHex = gittr.getPublicKey(ownerNsec);
  const ownerNpub = nip19.npubEncode(ownerHex);
  const smoSk = generateSecretKey();
  const smoNsec = nip19.nsecEncode(smoSk);
  const smoHex = gittr.getPublicKey(smoNsec);
  const smoNpub = nip19.npubEncode(smoHex);
  ok('auth:identities', {
    ownerHex,
    ownerNpub,
    smoHex,
    smoNpub,
    repo,
    note: 'smo nsec is ephemeral for this run only',
  });

  let created = null;
  let cloneUrl = null;
  try {
    created = await gittr.createRepo({
      name: repo,
      description: 'ACL hammer disposable — soft-deleted at end',
      files: [{ path: 'README.md', content: `# ${repo}\n\nacl hammer\n` }],
      relays,
      privkey: ownerNsec,
      pushCostSats: 0,
      publicRead: true,
      requireDiscoverable: false,
      discoverabilityTimeoutMs: 60000,
    });
    cloneUrl =
      created?.cloneUrl ||
      `https://git.gittr.space/${ownerNpub}/${repo}.git`;
    if (created?.success === false) {
      // Bridge push may have worked; force-announce on social relays for issue/PR ACL.
      await gittr.publishRepoAnnouncement({
        repoId: repo,
        name: repo,
        description: 'ACL hammer disposable — soft-deleted at end',
        clone: [cloneUrl],
        web: [`https://gittr.space/${ownerNpub}/${repo}`],
        privkey: ownerNsec,
        relays,
        publicRead: true,
      });
      warn('repo:createRepo_announce_retry', created.error || 'success=false', {
        cloneUrl,
      });
    } else {
      ok('repo:createRepo', {
        cloneUrl,
        announcementId: created.announcement?.id || created.event?.id,
        discoverable: created.discoverable,
      });
    }
  } catch (e) {
    cloneUrl = `https://git.gittr.space/${ownerNpub}/${repo}.git`;
    fail('repo:createRepo', e, created);
    try {
      await gittr.publishRepoAnnouncement({
        repoId: repo,
        name: repo,
        description: 'ACL hammer disposable — soft-deleted at end',
        clone: [cloneUrl],
        web: [`https://gittr.space/${ownerNpub}/${repo}`],
        privkey: ownerNsec,
        relays,
        publicRead: true,
      });
      warn('repo:createRepo_announce_retry', 'published after createRepo throw', {
        cloneUrl,
      });
    } catch (e2) {
      fail('repo:createRepo_announce_retry', e2);
    }
  }

  // Propagation for issue/PR discoverability
  await sleep(8000);
  try {
    await retry(async () => {
      const found = await gittr.getRepo({
        repoId: repo,
        ownerPubkey: ownerHex,
        relays,
      });
      if (!found || found.error) throw new Error(found?.error || 'not found');
      return found;
    }, { attempts: 8, delayMs: 4000 });
    ok('repo:discoverable_on_relays', { relays });
  } catch (e) {
    fail('repo:discoverable_on_relays', e);
  }

  const exists = await gittr
    .bridgeRepoExists({ ownerPubkey: ownerHex, repo, bridgeUrl })
    .catch((e) => ({ error: e.message }));
  if (exists?.exists) ok('repo:bridge_exists', exists);
  else fail('repo:bridge_exists', exists?.error || 'exists=false', exists);

  // --- Issue from smo (outsider) ---
  let issue = null;
  try {
    issue = await retry(() =>
      gittr.createIssue({
        ownerPubkey: ownerHex,
        repoId: repo,
        subject: 'ACL: issue from smo (no rights)',
        content: 'Opened by ephemeral outsider identity',
        privkey: smoNsec,
        relays,
      })
    );
    if (!issue?.event?.id) throw new Error(JSON.stringify(issue));
    ok('issues:create_as_smo', {
      issueId: issue.event.id,
      author: issue.event.pubkey,
    });
  } catch (e) {
    fail('issues:create_as_smo', e, issue);
  }

  try {
    if (!issue?.event?.id) throw new Error('no smo issue to list');
    const listed = await retry(async () => {
      const rows = await gittr.listIssues({
        ownerPubkey: ownerHex,
        repoId: repo,
        relays,
      });
      if (!rows.some((i) => i.id === issue.event.id)) {
        throw new Error('issue not visible yet');
      }
      return rows;
    });
    ok('issues:list_sees_smo_issue', {
      count: listed.length,
      hasIssue: true,
    });
  } catch (e) {
    fail('issues:list_sees_smo_issue', e);
  }

  // --- PR1: owner pushes feature; smo opens PR; owner merges ---
  const feat1 = `feat-acl-ok-${Date.now().toString(36)}`;
  let tip1 = null;
  let pr1 = null;
  try {
    const push1 = await gittr.pushToBridge({
      ownerPubkey: ownerHex,
      repo,
      branch: feat1,
      files: [
        {
          path: 'README.md',
          content: `# ${repo}\n\nacl hammer\n\nfeat1 from owner\n`,
        },
      ],
      privkey: ownerNsec,
    });
    tip1 = push1?.refs?.[0]?.commit;
    if (!tip1) throw new Error(JSON.stringify(push1));
    ok('repo:push_feat1_owner', { branch: feat1, tip: tip1 });
  } catch (e) {
    fail('repo:push_feat1_owner', e);
  }

  try {
    if (!tip1 || !cloneUrl) throw new Error('missing tip/cloneUrl');
    pr1 = await retry(() =>
      gittr.createPR({
        ownerPubkey: ownerHex,
        repoId: repo,
        subject: 'ACL PR1 — smo proposes, owner merges',
        content: 'Should merge as owner',
        commitId: tip1,
        cloneUrls: [cloneUrl],
        branchName: feat1,
        privkey: smoNsec,
        relays,
      })
    );
    if (!pr1?.event?.id) throw new Error(JSON.stringify(pr1));
    ok('prs:create_as_smo', { prId: pr1.event.id, author: pr1.event.pubkey });
  } catch (e) {
    fail('prs:create_as_smo', e, pr1);
  }

  try {
    if (!pr1?.event?.id) throw new Error('no pr1');
    let baseBranch = 'main';
    try {
      const refs = await gittr.bridgeListRefs({
        ownerPubkey: ownerHex,
        repo,
        bridgeUrl,
      });
      const heads = (refs?.refs || [])
        .map((r) => String(r.ref || ''))
        .filter((r) => r.startsWith('refs/heads/'))
        .map((r) => r.replace(/^refs\/heads\//, ''));
      if (heads.includes('main')) baseBranch = 'main';
      else if (heads.includes('master')) baseBranch = 'master';
      else if (heads[0]) baseBranch = heads[0];
      ok('repo:bridge_refs_for_merge', { heads, baseBranch });
    } catch (e) {
      warn('repo:bridge_refs_for_merge', e);
    }
    const merged = await gittr.mergePullRequest({
      prId: pr1.event.id,
      ownerPubkey: ownerHex,
      repoId: repo,
      privkey: ownerNsec,
      relays,
      baseBranch,
      mergeMessage: `Merge ACL PR1 (${repo})`,
    });
    if (!merged?.success) throw new Error(JSON.stringify(merged));
    ok('prs:merge_as_owner', {
      success: merged.success,
      mergeCommit: merged.mergeCommit || merged.commit,
      baseBranch,
    });
  } catch (e) {
    fail('prs:merge_as_owner', e);
  }

  // --- PR2: owner pushes feat2; smo tries merge → DENY ---
  const feat2 = `feat-acl-deny-${Date.now().toString(36)}`;
  let tip2 = null;
  let pr2 = null;
  try {
    const push2 = await gittr.pushToBridge({
      ownerPubkey: ownerHex,
      repo,
      branch: feat2,
      files: [
        {
          path: 'README.md',
          content: `# ${repo}\n\nacl hammer\n\nfeat2 for deny test\n`,
        },
      ],
      privkey: ownerNsec,
    });
    tip2 = push2?.refs?.[0]?.commit;
    if (!tip2) throw new Error(JSON.stringify(push2));
    ok('repo:push_feat2_owner', { branch: feat2, tip: tip2 });
  } catch (e) {
    fail('repo:push_feat2_owner', e);
  }

  try {
    if (!tip2 || !cloneUrl) throw new Error('missing tip/cloneUrl');
    pr2 = await retry(() =>
      gittr.createPR({
        ownerPubkey: ownerHex,
        repoId: repo,
        subject: 'ACL PR2 — smo must NOT merge',
        content: 'Expect permission denied for smo',
        commitId: tip2,
        cloneUrls: [cloneUrl],
        branchName: feat2,
        privkey: ownerNsec,
        relays,
      })
    );
    if (!pr2?.event?.id) throw new Error(JSON.stringify(pr2));
    ok('prs:create_pr2_owner', { prId: pr2.event.id });
  } catch (e) {
    fail('prs:create_pr2_owner', e, pr2);
  }

  try {
    if (!pr2?.event?.id) throw new Error('no pr2');
    // Wait until PR is actually queryable before ACL merge attempt
    await retry(async () => {
      const found = await gittr.getPullRequestById({
        prId: pr2.event.id,
        relays,
      });
      if (found?.error || !found?.id) throw new Error(found?.error || 'pr not visible');
      return found;
    }, { attempts: 8, delayMs: 4000 });

    const denied = await gittr.mergePullRequest({
      prId: pr2.event.id,
      ownerPubkey: ownerHex,
      repoId: repo,
      privkey: smoNsec,
      relays,
      mergeMessage: 'SMO SHOULD FAIL',
    });
    if (denied?.success) {
      fail('prs:merge_as_smo_should_deny', 'merge unexpectedly succeeded', denied);
    } else if (looksLikeDenied(denied)) {
      ok('prs:merge_as_smo_should_deny', {
        denied,
        note: 'permission denied as expected',
      });
    } else {
      fail(
        'prs:merge_as_smo_should_deny',
        `expected permission deny, got: ${denied?.error || JSON.stringify(denied)}`,
        denied
      );
    }
  } catch (e) {
    if (looksLikeDenied(e)) {
      ok('prs:merge_as_smo_should_deny', {
        error: e.message,
        note: 'threw permission error as expected',
      });
    } else {
      fail('prs:merge_as_smo_should_deny', e);
    }
  }

  // HTTPS smart-http probe (SSH needs kind-52 key on account — optional)
  try {
    const clone =
      cloneUrl || `https://git.gittr.space/${ownerNpub}/${repo}.git`;
    const probe = await gittr.probeGitSmartHttp({ url: clone });
    ok('git:https_smart_http_probe', { clone, probe });
  } catch (e) {
    warn('git:https_smart_http_probe', e);
  }

  // Frontend URL for browser check
  const webUrl = `${bridgeUrl.replace(/\/$/, '')}/${ownerNpub}/${repo}`;
  ok('frontend:url', { webUrl, issuesTab: `${webUrl}?tab=issues`, pullsTab: `${webUrl}?tab=pulls` });

  // --- Cleanup: soft-delete ---
  let deleted = null;
  try {
    deleted = await gittr.softDeleteRepo({
      repoId: repo,
      name: repo,
      description: 'ACL hammer cleanup',
      privkey: ownerNsec,
      relays,
    });
    if (!deleted?.ok) throw new Error(JSON.stringify(deleted));
    ok('repo:softDeleteRepo', deleted);
  } catch (e) {
    fail('repo:softDeleteRepo', e, deleted);
  }

  const summary = {
    repo,
    ownerNpub,
    smoNpub,
    webUrl,
    pass: results.filter((r) => r.status === 'PASS').length,
    warn: results.filter((r) => r.status === 'WARN').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    results,
  };
  console.log('\n=== ACL HAMMER SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.fail > 0 ? 1 : 0);
})().catch((e) => {
  console.error('fatal', e);
  process.exit(1);
});
