#!/usr/bin/env node
/**
 * Agent happy-path exerciser: createRepo → createIssue → optional bounty invoice.
 *
 * Default is dry-run (safe). Pass --live or HAPPY_PATH_LIVE=1 to mutate relays/bridge.
 *
 * Usage:
 *   node scripts/agent-happy-path.js
 *   HAPPY_PATH_LIVE=1 GITTR_TEST_NSEC=nsec1... node scripts/agent-happy-path.js
 *   node scripts/agent-happy-path.js --live
 *
 * Env:
 *   BRIDGE_URL — default https://gittr.space
 *   GITTR_TEST_RELAYS — comma wss URLs (default wss://relay.ngit.dev)
 *   GITTR_TEST_NSEC or GITTR_TEST_PRIVKEY — hex or nsec (live only)
 *   GITTR_TEST_REPO — repo name (default agent-hp-<timestamp>)
 *   GITTR_LNBITS_URL, GITTR_LNBITS_ADMIN_KEY — optional bounty step
 *   HAPPY_PATH_SKIP_BOUNTY=1 — skip invoice even if LNbits set
 *   HAPPY_PATH_LIVE=1 or --live — perform real createRepo / issue / bounty
 */

'use strict';

const gittr = require('../index.js');

const live =
  process.argv.includes('--live') || process.env.HAPPY_PATH_LIVE === '1' || process.env.HAPPY_PATH_LIVE === 'true';
const dry = !live;

// nostr-tools may emit async relay rejections after our awaited call returns.
// For happy-path verification, treat known relay validation rejects as warnings.
function isKnownRelayValidationError(err) {
  const msg = err && (err.message || String(err));
  return typeof msg === 'string' && msg.includes('must reference an accepted repository or accepted event');
}

process.on('unhandledRejection', (reason) => {
  if (isKnownRelayValidationError(reason)) {
    console.warn('[happy-path] warning: relay validation rejection (non-fatal for bridge+issue flow)');
    return;
  }
  console.error('[happy-path] unhandledRejection:', reason?.message || reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  if (isKnownRelayValidationError(err)) {
    console.warn('[happy-path] warning: relay validation rejection (non-fatal for bridge+issue flow)');
    process.exit(0);
    return;
  }
  console.error('[happy-path] uncaughtException:', err.message || err);
  process.exit(1);
});

function log(step, obj) {
  if (obj !== undefined) console.log(`[happy-path] ${step}`, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  else console.log(`[happy-path] ${step}`);
}

async function bridgePing(bridgeUrl) {
  const base = bridgeUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/nostr/repo/push-challenge`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  return { status: res.status, ok: res.ok };
}

async function main() {
  const bridgeUrl = process.env.BRIDGE_URL || 'https://gittr.space';
  const relays = (process.env.GITTR_TEST_RELAYS || 'wss://relay.ngit.dev')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  log('mode', dry ? 'dry-run (no mutations)' : 'live');
  log('bridgeUrl', bridgeUrl);
  log('relays', relays);

  const auth = gittr.describeAgentAuth();
  log('describeAgentAuth', auth);

  if (dry) {
    try {
      const ping = await bridgePing(bridgeUrl);
      log('bridge push-challenge GET', { status: ping.status, ok: ping.ok });
    } catch (e) {
      log('bridge ping failed (offline or blocked)', e.message);
    }
    log('done', 'Dry run finished. For live: --live or HAPPY_PATH_LIVE=1 and GITTR_TEST_NSEC / GITTR_TEST_PRIVKEY (or a filled .nostr-keys.json from .nostr-keys.json.example).');
    return;
  }

  let privkey = process.env.GITTR_TEST_PRIVKEY || process.env.GITTR_TEST_NSEC;
  if (!privkey) {
    const c = gittr.loadCredentials();
    if (c) privkey = c.nsec || c.secretKey || c.private_key;
  }
  if (!privkey) {
    console.error(
      'Live run needs GITTR_TEST_PRIVKEY / GITTR_TEST_NSEC, or a filled .nostr-keys.json (copy from .nostr-keys.json.example) in cwd or HOME.'
    );
    process.exit(1);
  }

  const repoName = process.env.GITTR_TEST_REPO || `agent-hp-${Date.now()}`;
  const pk = gittr.getPublicKey(privkey);

  log('step createRepo', repoName);
  const cr = await gittr.createRepo({
    name: repoName,
    description: 'gittr-mcp agent happy-path',
    files: [{ path: 'README.md', content: `# ${repoName}\n\nHappy path.\n` }],
    privkey,
    relays,
    pushCostSats: 0,
  });
  if (!cr.success) {
    throw new Error(`createRepo failed: ${JSON.stringify(cr)}`);
  }
  log('createRepo ok', { webUrl: cr.webUrl, commit: cr.commit, pushPolicySync: cr.pushPolicySync });

  log('step createIssue');
  const iss = await gittr.createIssue({
    ownerPubkey: pk,
    repoId: repoName,
    subject: 'Happy path issue',
    content: 'Created by `scripts/agent-happy-path.js`.',
    privkey,
    relays,
  });
  log('issue', { id: iss.event?.id });

  const skipBounty = process.env.HAPPY_PATH_SKIP_BOUNTY === '1';
  const lnbitsUrl = process.env.GITTR_LNBITS_URL || '';
  const lnbitsAdminKey = process.env.GITTR_LNBITS_ADMIN_KEY || '';
  if (!skipBounty && lnbitsUrl && lnbitsAdminKey && iss.event?.id) {
    log('step createBountyInvoice');
    const inv = await gittr.createBountyInvoice({
      issueId: iss.event.id,
      amount: Number(process.env.GITTR_BOUNTY_SATS || 10000),
      description: 'Happy path bounty',
      lnbitsUrl,
      lnbitsAdminKey,
    });
    log('bounty invoice', {
      status: inv.status,
      hasInvoice: !!(inv.invoice || inv.payment_request),
      paymentHash: inv.paymentHash,
    });
  } else {
    log('step bounty', 'skipped (set GITTR_LNBITS_URL + GITTR_LNBITS_ADMIN_KEY or HAPPY_PATH_SKIP_BOUNTY=1)');
  }

  log('done', { repoName, ownerPubkey: pk.slice(0, 16) + '…' });
  process.exit(0);
}

main().catch((e) => {
  console.error('[happy-path] fatal:', e.message);
  process.exit(1);
});
