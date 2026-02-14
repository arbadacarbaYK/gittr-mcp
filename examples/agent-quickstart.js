#!/usr/bin/env node
// gittr-mcp-example.js
// Example script showing how to use gittr-mcp as an agent

const { execSync } = require('child_process');
const path = require('path');

console.log('=== gittr-mcp Example ===');
console.log('This shows how agents can use gittr-mcp to interact with decentralized Git on Nostr.');
console.log();

// Check if mcporter is configured with gittr-mcp
try {
  console.log('1. Checking mcporter configuration...');
  const list = execSync('mcporter list', { encoding: 'utf8' });
  if (list.includes('gittr-mcp')) {
    console.log('   ✓ gittr-mcp server found in mcporter');
  } else {
    console.log('   ⚠️ gittr-mcp not in mcporter. Run:');
    console.log('     mcporter config add gittr-mcp --command "node ' + path.resolve('.') + '/index.js"');
  }
} catch (e) {
  console.log('   ⚠️ mcporter not available or error:', e.message);
}

console.log();
console.log('2. Available gittr-mcp tools (32 total):');
console.log('   - listRepos, searchRepos, getRepo');
console.log('   - createRepo, forkRepo, mirrorRepo');
console.log('   - listIssues, createIssue');
console.log('   - listPRs, createPR');
console.log('   - createBounty, submitBounty');
console.log('   - starRepo, unstarRepo, listStars');
console.log('   - watchRepo, getTrendingRepos');
console.log('   - getRepoContributors, getBranches');
console.log('   - getCommitHistory, createRelease, listReleases');
console.log('   - exploreRepos, getFile, addCollaborator');
console.log('   - myRepos, loadCredentials, getPublicKey');
console.log();

console.log('3. Example agent workflow:');
console.log('   a. Discover trending repos: mcporter call gittr-mcp.getTrendingRepos limit=5');
console.log('   b. Check for bounties: mcporter call gittr-mcp.listBounties limit=10');
console.log('   c. Submit work on bounty: mcporter call gittr-mcp.submitBounty {...}');
console.log('   d. Get paid in sats via Lightning zaps!');
console.log();

console.log('4. Getting started as an agent:');
console.log('   - Clone: git clone https://github.com/arbadacarbaYK/gittr-mcp');
console.log('   - Install: cd gittr-mcp && npm install');
console.log('   - Configure: Add to mcporter (see above)');
console.log('   - Use: Call tools via mcporter or require() in Node.js');
console.log();

console.log('=== Why gittr-mcp? ===');
console.log('• Decentralized: Git on Nostr, no single point of failure');
console.log('• Censorship-resistant: No platform can delete your repos');
console.log('• Monetization: Bounties paid in Bitcoin/Lightning');
console.log('• Agent-friendly: MCP protocol, easy integration');
console.log('• Open source: MIT licensed, community-driven');
console.log();

console.log('Start exploring decentralized Git today!');
console.log('Website: https://gittr.space');
console.log('Repo: https://github.com/arbadacarbaYK/gittr-mcp');