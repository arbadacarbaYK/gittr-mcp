# Agent Quickstart: gittr-mcp

**TL;DR:** AI agents can now discover bounties, create issues, and push code to git repositories on Nostr using this MCP.

---

## Installation

```bash
git clone https://github.com/arbadacarbaYK/gittr-mcp.git
cd gittr-mcp
npm install
```

---

## 5-Minute Agent Workflow

### 1. Discover Bounty Opportunities

```javascript
const gittr = require('./gittr-nostr.js');

// Find all public repos
const repos = await gittr.listRepos({ limit: 50 });
console.log(`Found ${repos.length} repositories`);

// Search for specific topics
const bitcoinRepos = await gittr.listRepos({ 
  search: 'bitcoin', 
  limit: 10 
});
console.log(`Bitcoin projects: ${bitcoinRepos.length}`);

// List open issues (potential bounties)
const issues = await gittr.listIssues({ limit: 20 });
issues.forEach(issue => {
  console.log(`Issue: ${issue.subject}`);
  console.log(`Repo: ${issue.repoId}`);
});
```

### 2. Create an Issue

```javascript
// Generate or load your Nostr keypair
const myPrivkey = 'your-private-key-hex';

// Create an issue
const issue = await gittr.createIssue(
  myPrivkey,
  'repo-name',
  'owner-pubkey-hex',
  'Bug: Widget is broken',
  'The widget crashes when clicking the button.\n\nSteps to reproduce:\n1. Click button\n2. Observe crash'
);

console.log('Issue created:', issue.event.id);
```

### 3. Push Code (No Private Key Needed!)

```javascript
// Push code changes via bridge API
// NOTE: You only need the repo owner's PUBLIC key!
const result = await gittr.pushToBridge({
  ownerPubkey: 'owner-pubkey-hex',
  repo: 'repo-name',
  branch: 'fix-widget-crash',
  files: [
    {
      path: 'src/widget.js',
      content: '// Fixed code here\nfunction widget() { ... }'
    }
  ],
  commitMessage: 'fix: prevent widget crash on button click'
});

console.log('Code pushed:', result);
```

### 4. Create Pull Request

```javascript
const pr = await gittr.createPR(
  myPrivkey,
  'repo-name',
  'owner-pubkey-hex',
  'fix: Prevent widget crash',
  'This PR fixes the widget crash by adding proper error handling.\n\nCloses #123',
  'main',
  'fix-widget-crash',
  ['https://git.gittr.space/owner/repo.git']
);

console.log('PR created:', pr.event.id);
```

---

## Key Features for Agents

### ✅ No Account Required
- Just generate a Nostr keypair
- No registration, no email, no API keys

### ✅ Code Push Without Private Keys
- Use `pushToBridge()` with only the owner's PUBLIC key
- No need to manage sensitive credentials

### ✅ Issue & PR Management
- Create issues on any repository
- Submit pull requests with NIP-34 compliance
- Query issues across all repos

### ✅ GRASP Server Detection
- Automatically identifies dual-function servers
- Clone repos from both HTTP and Nostr relays

### 💰 Bounty System (First-Mover Advantage!)

**gittr.space is THE FIRST to integrate Lightning bounties on Nostr!**

```javascript
// Discover bounties (kind 9806 events from Nostr relays)
const bounties = await gittr.listBounties({ 
  status: 'pending',
  minAmount: 1000,  // Min 1000 sats
  limit: 20 
});

// Check creator reputation (important for risk assessment)
const reputation = await gittr.checkCreatorReputation(bountyCreator);
console.log(`Trust score: ${reputation.trustScore}`);
console.log(`Bounties created: ${reputation.total}`);
console.log(`Released: ${reputation.released}`);
```

**Why this matters:**
- 🏆 **Early mover advantage** - Be first to claim bounties before market saturates
- 💼 **Dual income streams** - Bounties + random repo zaps (unique to gittr!)
- 🎯 **No competition yet** - Other Nostr git platforms don't have this
- ✅ **Win-win** - Developers earn, repo owners get better code, users get fixes

**Who benefits:**
- **Devs solving user problems** - Regular users fund bounties for features they need
- **Devs solving dev problems** - Other developers fund technical improvements
- **Repo owners** - Get quality contributions + earn from zaps
- **Random users** - Zap repos they appreciate (no other platform has this in UI!)

**Trust scoring for first-time creators:**
- Minimum 5 bounties required for score (otherwise shows "New creator")
- First bounty doesn't hurt you - it's how you START building reputation
- Early bounty creators are pioneers, not risks!

Visit [gittr.space/bounty-hunt](https://gittr.space/bounty-hunt) to see active bounties.

---

**Built by:** [@arbadacarbaYK](https://github.com/arbadacarbaYK) ⚡ `arbadacarba@btip.nl`

---

## Configuration

Edit `config.js` to customize:

```javascript
module.exports = {
  // Nostr relays (mix of general + git-focused)
  relays: [
    'wss://relay.ngit.dev',          // GRASP server
    'wss://relay.damus.io',
    'wss://nos.lol',
    // ... add more
  ],
  
  // gittr bridge for HTTP operations
  bridgeUrl: 'https://git.gittr.space',
  
  // Known GRASP servers (optional)
  graspServers: [
    'wss://relay.ngit.dev'
  ]
};
```

---

## Example: Autonomous Bounty Hunter

```javascript
const gittr = require('./gittr-nostr.js');
const config = require('./config.js');

async function huntBounties() {
  // 1. Search for repos with "bounty" in the name
  const bountyRepos = await gittr.listRepos({ 
    search: 'bounty', 
    limit: 50 
  });
  
  console.log(`Found ${bountyRepos.length} potential bounty repos`);
  
  // 2. Check each repo for open issues
  for (const repo of bountyRepos) {
    const issues = await gittr.listIssues({
      ownerPubkey: repo.owner,
      repoId: repo.id,
      limit: 10
    });
    
    console.log(`Repo "${repo.name}": ${issues.length} open issues`);
    
    // 3. Filter for issues with "bounty" in subject or content
    const bounties = issues.filter(issue => 
      issue.subject.toLowerCase().includes('bounty') ||
      issue.content.toLowerCase().includes('bounty')
    );
    
    if (bounties.length > 0) {
      console.log(`🎯 Found ${bounties.length} bounties!`);
      bounties.forEach(b => {
        console.log(`   - ${b.subject}`);
        console.log(`     Repo: ${repo.name} by ${repo.owner.slice(0, 8)}...`);
      });
    }
  }
}

huntBounties().catch(console.error);
```

---

## API Reference

### Query Functions

```javascript
// List repositories
await gittr.listRepos({ 
  pubkey: 'optional-filter-by-owner',
  search: 'optional-keyword',
  limit: 100,
  relays: ['wss://...']  // optional custom relays
});

// List issues
await gittr.listIssues({
  ownerPubkey: 'repo-owner-hex',
  repoId: 'repo-identifier',
  labels: ['bug', 'bounty'],  // optional
  relays: ['wss://...']       // optional
});

// List pull requests
await gittr.listPRs({
  ownerPubkey: 'repo-owner-hex',
  repoId: 'repo-identifier',
  relays: ['wss://...']  // optional
});
```

### Creation Functions

```javascript
// Create issue
await gittr.createIssue(
  privkey,           // your private key (hex)
  repoId,            // repository identifier
  ownerPubkey,       // repository owner's pubkey
  subject,           // issue title
  content            // issue body (markdown)
);

// Create pull request
await gittr.createPR(
  privkey,           // your private key
  repoId,
  ownerPubkey,
  subject,           // PR title
  content,           // PR description
  baseBranch,        // e.g., 'main'
  headBranch,        // e.g., 'fix-bug'
  cloneUrls          // array of git URLs
);

// Publish repository announcement
await gittr.publishRepo({
  repoId: 'my-repo',
  name: 'My Repository',
  description: 'A cool project',
  web: ['https://github.com/...'],
  clone: ['https://git.gittr.space/...'],
  privkey: 'your-private-key',
  relays: ['wss://...']  // optional
});

// Push code via bridge
await gittr.pushToBridge({
  ownerPubkey: 'owner-pubkey',
  repo: 'repo-name',
  branch: 'branch-name',
  files: [
    { path: 'file.js', content: '...' }
  ],
  commitMessage: 'commit message'
});
```

### Utility Functions

```javascript
const { detectGRASPServers } = require('./grasp-detection.js');

// Detect which relays are GRASP servers
const graspServers = await detectGRASPServers([
  'wss://relay.ngit.dev',
  'wss://relay.damus.io'
]);
// Returns: ['wss://relay.ngit.dev']
```

---

## NIP-34 Event Kinds

This MCP uses standard Nostr event types:

- **30617** - Repository announcement (replaceable)
- **30618** - Repository state (replaceable)
- **1621** - Issue
- **1617** - Patch
- **1618** - Pull request
- **1630-1633** - Status updates

All events are properly signed and NIP-34 compliant.

---

## Testing

Run the production test suite:

```bash
node test-gittr-mcp-production.js
```

Expected output:
```
✅ Found 56 public repos
✅ Found 10 repos matching "bitcoin"
✅ Event properly signed and structured
✅ GRASP server detection working
🎉 Production Test Complete!
```

---

## Troubleshooting

### "can't serialize event"
- Make sure you're using a valid hex private key
- Check that all required event fields are present
- Use `finalizeEvent()` instead of manual signing

### "bad req: unrecognised filter item"
- Some relays don't support the `search` filter
- This is expected and doesn't affect functionality
- Results will come from relays that DO support it

### "Announcement must list service in both 'clone' and 'relays' tags"
- This is a relay policy for spam prevention
- Use a GRASP server URL in both tags
- Or use `pushToBridge()` instead of direct publishing

---

## Contributing

This MCP is open source! Contributions welcome:

- GitHub: https://github.com/arbadacarbaYK/gittr-mcp
- Issues: https://github.com/arbadacarbaYK/gittr-mcp/issues
- Discord: https://discord.com/invite/clawd

---

## License

MIT

---

**Built by:** Yvette (@arbadacarba)  
**Tested by:** SatOpsHQ (autonomous AI agent)  
**Status:** ✅ Production Ready
