'use strict';

/**
 * Rich outcomes for AI agents: what happened, why, and what to do next.
 */

class AgentFacingError extends Error {
  constructor(message, { reason = '', nextSteps = [] } = {}) {
    super(message);
    this.name = 'AgentFacingError';
    this.reason = reason;
    this.nextSteps = Array.isArray(nextSteps) ? nextSteps : [];
  }
}

function withAgentHints(obj, hints = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const { agentSummary, nextSteps, whatHappensNext, reason } = hints;
  const out = { ...obj };
  if (agentSummary != null) out.agentSummary = agentSummary;
  if (nextSteps != null) out.nextSteps = nextSteps;
  if (whatHappensNext != null) out.whatHappensNext = whatHappensNext;
  if (reason != null) out.reason = reason;
  return out;
}

function push(msg, arr) {
  if (msg && !arr.includes(msg)) arr.push(msg);
}

/**
 * When a tool throws, the MCP server calls this to attach actionable follow-ups.
 */
function suggestNextStepsForTool(toolName, message) {
  const m = String(message || '');
  const lower = m.toLowerCase();
  const steps = [];

  if (lower.includes('authentication required') || lower.includes('unauthorized') || lower.includes('401')) {
    push('Provide privkey (hex or nsec) on the tool call, or add .nostr-keys.json with nsec.', steps);
    push('Bridge auth uses X-Nostr-Auth-Event; ensure the key matches the repo owner for push.', steps);
  }

  if (lower.includes('access denied') || lower.includes('403')) {
    push('Confirm the authenticated pubkey is allowed to push to this owner/repo (same owner as bridge repo).', steps);
  }

  if (lower.includes('push payment required') || lower.includes('402') || lower.includes('paywall')) {
    push('Call getPushPaywallStatus then createPushPaywallIntent; pay the invoice, then retry push.', steps);
  }

  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('slow down')) {
    push('Wait for Retry-After (or ~60s), reduce parallel calls, and avoid tight loops against the bridge.', steps);
  }

  if (lower.includes('verification_failed')) {
    push('Open the tool error JSON field `verification`: confirmed=false means no relay returned the event id after polling; confirmedOnRelays lists successes.', steps);
    push('Fix clone/relays tags on 30617, widen relays, or increase GITTR_RELAY_VERIFY_TIMEOUT_MS, then retry publish.', steps);
  }

  if (
    lower.includes('not discoverable') ||
    lower.includes('not queryable') ||
    lower.includes('relay') ||
    lower.includes('announcement')
  ) {
    push('Wait 30–120s and retry; widen GITTR_TEST_RELAYS / pass relays including wss://relay.ngit.dev and fallbacks.', steps);
    push('Optional: call sendEventToBridge via bridge if events were published but not yet visible.', steps);
  }

  if (lower.includes('repository not found') && toolName === 'getRepo') {
    push('Pass ownerPubkey (hex or npub) with repoId, or use resolveRepoByNostrId after listing repos on relays.', steps);
  }

  if (lower.includes('git merge failed') || lower.includes('could not clone') || lower.includes('merge')) {
    push('Verify PR clone URL(s) point at the repo that actually contains the branch or commit in the PR.', steps);
    push('If head lives on another repo, update PR 1618 clone tags or merge manually in Gittr UI.', steps);
  }

  if (lower.includes('exceeds') && lower.includes('mb')) {
    push('Split work into smaller pushes or use git outside MCP for large trees; bridge body limit is ~25MB.', steps);
  }

  if (lower.includes('git') && lower.includes('path')) {
    push('Install git and ensure it is on PATH, or set GITTR_DISABLE_GIT_MERGE=1 and use Nostr-only status tools.', steps);
  }

  if (toolName === 'createIssue' || toolName === 'createPR') {
    push('Ensure repo kind 30617 is accepted on relays (createRepo success + discoverable, or wait after announce).', steps);
    push('Retry with the same relays used when the repo was announced.', steps);
  }

  if (toolName === 'mergePullRequest') {
    push('Fetch PR with getPullRequestById; confirm a-tag owner/repo matches ownerPubkey/repoId.', steps);
    push('If merge still fails, use markPullRequestMerged only after a real merge elsewhere (signals UI without git).', steps);
  }

  if (steps.length === 0) {
    push('Check error text for upstream (bridge vs relay); retry once after a short delay if transient.', steps);
    push('For bridge errors, open gittr.space repo page and confirm refs/files exist via bridgeListRefs.', steps);
  }

  return steps;
}

module.exports = {
  AgentFacingError,
  withAgentHints,
  suggestNextStepsForTool,
};
