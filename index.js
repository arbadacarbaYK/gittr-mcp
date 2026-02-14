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
  // Full PR flow via gittr CLI (includes git push + refs/nostr/ push - REQUIRED for NIP-34)
  createPRViaGittrCLI: gittrShell.createPRViaGittrCLI,
  
  // Bounty operations (not yet active on platform)
  createBounty: gittrNostr.createBounty,
  
  // Helpers
  getPublicKey: gittrNostr.getPublicKey,
  
  // Agent-friendly convenience functions
  createRepo: gittrAgent.createRepo,
  getRepo: gittrAgent.getRepo,
  searchRepos: gittrAgent.searchRepos,
  listBounties: gittrAgent.listBounties,
  forkRepo: gittrAgent.forkRepo,
  myRepos: gittrAgent.myRepos,
  addCollaborator: gittrAgent.addCollaborator,
  getFile: gittrAgent.getFile,
  mirrorRepo: gittrAgent.mirrorRepo,
  loadCredentials: gittrAgent.loadCredentials,
  
  // NEW: gittr.space feature parity
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
  
  // Event kinds (for reference)
  KIND_REPOSITORY: gittrNostr.KIND_REPOSITORY,
  KIND_REPOSITORY_STATE: gittrNostr.KIND_REPOSITORY_STATE,
  KIND_ISSUE: gittrNostr.KIND_ISSUE,
  KIND_PULL_REQUEST: gittrNostr.KIND_PULL_REQUEST
};
