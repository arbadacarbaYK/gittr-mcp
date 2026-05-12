// gittr-mcp - Model Context Protocol for gittr.space
// Enables AI agents to interact with Git repositories on Nostr

const gittrNostr = require('./gittr-nostr.js');
const gittrAgent = require('./gittr-agent.js');
const gittrShell = require('./gittr-shell.js');

module.exports = {
  // Core repository operations
  listRepos: gittrNostr.listRepos,
  publishRepoAnnouncement: gittrNostr.publishRepoAnnouncement,
  publishRepo: gittrNostr.publishRepoAnnouncement, // Alias
  publishRepoState: gittrNostr.publishRepoState,
  pushToBridge: gittrNostr.pushToBridge,

  // Issue operations
  listIssues: gittrNostr.listIssues,
  createIssue: gittrNostr.createIssue,

  // Pull Request operations
  listPRs: gittrNostr.listPRs,
  createPR: gittrNostr.createPR,
  updatePullRequest: gittrNostr.updatePullRequest,
  createPRViaGittrCLI: gittrShell.createPRViaGittrCLI,

  // Issue/PR/patch status (NIP-34 kinds 1630–1633)
  publishStatusForRoot: gittrNostr.publishStatusForRoot,

  // Bounty: HTTP invoice + Nostr kind 9806
  createBounty: gittrNostr.createBounty,
  createBountyInvoice: gittrNostr.createBountyInvoice,
  publishBountyToNostr: gittrNostr.publishBountyToNostr,
  listBountiesForIssue: gittrNostr.listBountiesForIssue,

  // Helpers
  getPublicKey: gittrNostr.getPublicKey,
  resolveRepoOwnerHex: gittrNostr.resolveRepoOwnerHex,
  verifyEventOnRelays: gittrNostr.verifyEventOnRelays,
  probeGitSmartHttp: require('./gittr-verify.js').probeGitSmartHttp,

  // Agent-friendly convenience functions
  describeAgentAuth: gittrAgent.describeAgentAuth,
  createRepo: gittrAgent.createRepo,
  getRepo: gittrAgent.getRepo,
  resolveRepoByNostrId: gittrAgent.resolveRepoByNostrId,
  searchRepos: gittrAgent.searchRepos,
  listBounties: gittrAgent.listBounties,
  forkRepo: gittrAgent.forkRepo,
  myRepos: gittrAgent.myRepos,
  addCollaborator: gittrAgent.addCollaborator,
  getFile: gittrAgent.getFile,
  mirrorRepo: gittrAgent.mirrorRepo,
  loadCredentials: gittrAgent.loadCredentials,
  importRemoteToBridge: gittrAgent.importRemoteToBridge,
  getIssueById: gittrAgent.getIssueById,
  getPullRequestById: gittrAgent.getPullRequestById,
  closeIssue: gittrAgent.closeIssue,
  reopenIssue: gittrAgent.reopenIssue,
  markPullRequestMerged: gittrAgent.markPullRequestMerged,
  mergePullRequest: gittrAgent.mergePullRequest,

  submitBounty: gittrAgent.submitBounty,
  starRepo: gittrAgent.starRepo,
  unstarRepo: gittrAgent.unstarRepo,
  listStars: gittrAgent.listStars,
  watchRepo: gittrAgent.watchRepo,
  getTrendingRepos: gittrAgent.getTrendingRepos,
  getRepoContributors: gittrAgent.getRepoContributors,
  getBranches: gittrAgent.getBranches,
  getCommitHistory: gittrAgent.getCommitHistory,
  createRelease: gittrAgent.createRelease,
  listReleases: gittrAgent.listReleases,
  exploreRepos: gittrAgent.exploreRepos,

  // gittr/ngit HTTP bridge (same origin as BRIDGE_URL / gittr.space)
  bridgeRepoExists: gittrAgent.bridgeRepoExists,
  bridgeListFiles: gittrAgent.bridgeListFiles,
  bridgeGetFileContent: gittrAgent.bridgeGetFileContent,
  bridgeListRefs: gittrAgent.bridgeListRefs,
  bridgeListCommits: gittrAgent.bridgeListCommits,
  getPushPaywallStatus: gittrAgent.getPushPaywallStatus,
  createPushPaywallIntent: gittrAgent.createPushPaywallIntent,
  syncRepoPushPolicy: gittrAgent.syncRepoPushPolicy,
  bountyRelease: gittrAgent.bountyRelease,
  bountyCreateWithdraw: gittrAgent.bountyCreateWithdraw,
  bountyClaimWithdraw: gittrAgent.bountyClaimWithdraw,

  // Event kinds (for reference)
  KIND_REPOSITORY: gittrNostr.KIND_REPOSITORY,
  KIND_REPOSITORY_STATE: gittrNostr.KIND_REPOSITORY_STATE,
  KIND_ISSUE: gittrNostr.KIND_ISSUE,
  KIND_PULL_REQUEST: gittrNostr.KIND_PULL_REQUEST,
  KIND_PR_UPDATE: gittrNostr.KIND_PR_UPDATE,
  KIND_BOUNTY: gittrNostr.KIND_BOUNTY,
  KIND_STATUS_OPEN: gittrNostr.KIND_STATUS_OPEN,
  KIND_STATUS_APPLIED: gittrNostr.KIND_STATUS_APPLIED,
  KIND_STATUS_CLOSED: gittrNostr.KIND_STATUS_CLOSED,
  KIND_STATUS_DRAFT: gittrNostr.KIND_STATUS_DRAFT,
};
