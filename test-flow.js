const gittr = require('./index.js');

const PRIVKEY = 'bdaa56047a1248ce37546de06716f2eedce297e85ec1bdcf84c0c46345520f43';
const PUBKEY = 'cfaa4b5f723dba321a1b901a1506fbcb989c032c352f815302865cba3a72b3cf';
const RELAY = 'wss://relay.ngit.dev';

async function main() {
  const repoName = 'test-repo-' + Date.now();
  
  console.log('=== Step 1: Create repo with README ===');
  const repoResult = await gittr.createRepo({
    name: repoName,
    description: 'Test repo for gittr-mcp verification',
    files: [
      { path: 'README.md', content: '# Test Repo\n\nThis is a test repository created by SatOpsHQ to verify gittr-mcp functionality.\n\n## Purpose\n- Test issue creation\n- Test bounty creation\n- Test PR creation' }
    ],
    privkey: PRIVKEY,
    relays: [RELAY]
  });
  
  console.log('Repo created:', JSON.stringify(repoResult, null, 2));
  console.log('Web URL:', repoResult.webUrl);
  console.log('');
  
  // Save for later
  const webUrl = repoResult.webUrl;
  const cloneUrl = repoResult.cloneUrl;
  
  console.log('=== Step 2: Create normal issue (no bounty) ===');
  const issueResult = await gittr.createIssue({
    ownerPubkey: PUBKEY,
    repoId: repoName,
    subject: 'Test Issue - No Bounty',
    content: 'This is a normal issue without any bounty attached.',
    labels: ['test'],
    privkey: PRIVKEY,
    relays: [RELAY]
  });
  
  console.log('Normal issue created:', JSON.stringify(issueResult, null, 2));
  const normalIssueId = issueResult.event.id;
  console.log('');
  
  console.log('=== Step 3: Create issue with bounty (10 sats) ===');
  const bountyIssueResult = await gittr.createIssue({
    ownerPubkey: PUBKEY,
    repoId: repoName,
    subject: 'Bountied Issue - Fix README typo',
    content: 'This issue has a 10 sat bounty. Fix the typo in README.md',
    labels: ['bounty', 'good first issue'],
    privkey: PRIVKEY,
    relays: [RELAY]
  });
  
  console.log('Bounty issue created:', JSON.stringify(bountyIssueResult, null, 2));
  const bountyIssueId = bountyIssueResult.event.id;
  console.log('');
  
  console.log('=== Step 4: Create bounty on the issue ===');
  const bountyResult = await gittr.createBounty(
    PUBKEY,
    repoName,
    bountyIssueId,
    10,
    'Fix typo in README.md - 10 sats reward'
  );
  
  console.log('Bounty created:', JSON.stringify(bountyResult, null, 2));
  console.log('');
  
  console.log('=== Step 5: Create PR for the bounty ===');
  // First push files to a branch
  const pushResult = await gittr.pushToBridge({
    ownerPubkey: PUBKEY,
    repo: repoName,
    branch: 'fix-readme',
    files: [
      { path: 'README.md', content: '# Test Repo\n\nThis is a test repository created by SatOpsHQ to verify gittr-mcp functionality.\n\n## Purpose\n- Test issue creation\n- Test bounty creation\n- Test PR creation\n\nFixed the typo!' }
    ]
  });
  
  console.log('Branch pushed:', JSON.stringify(pushResult, null, 2));
  
  // Now create the PR
  const prResult = await gittr.createPR({
    ownerPubkey: PUBKEY,
    repoId: repoName,
    subject: 'Fix README typo',
    content: 'This PR fixes the typo in README.md to claim the 10 sat bounty.',
    commitId: pushResult.refs[0].commit,
    cloneUrls: [cloneUrl],
    branchName: 'fix-readme',
    labels: ['pull-request'],
    privkey: PRIVKEY,
    relays: [RELAY]
  });
  
  console.log('PR created:', JSON.stringify(prResult, null, 2));
  console.log('');
  
  console.log('=== SUMMARY ===');
  console.log('Repo URL:', webUrl);
  console.log('Normal Issue ID:', normalIssueId);
  console.log('Bounty Issue ID:', bountyIssueId);
  console.log('Bounty Issue URL:', `${webUrl}/issues/${bountyIssueId}`);
  console.log('PR created successfully');
}

main().catch(console.error);
