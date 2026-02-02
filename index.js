// gittr-mcp - Model Context Protocol for gittr.space
// Enables AI agents to interact with Git repositories on Nostr

const gittrNostr = require('./gittr-nostr.js');

module.exports = {
  // Repository operations
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
  
  // Bounty operations (not yet active on platform)
  createBounty: gittrNostr.createBounty,
  
  // Helpers
  getPublicKey: gittrNostr.getPublicKey,
  
  // Event kinds (for reference)
  KIND_REPOSITORY: gittrNostr.KIND_REPOSITORY,
  KIND_REPOSITORY_STATE: gittrNostr.KIND_REPOSITORY_STATE,
  KIND_ISSUE: gittrNostr.KIND_ISSUE,
  KIND_PULL_REQUEST: gittrNostr.KIND_PULL_REQUEST
};
