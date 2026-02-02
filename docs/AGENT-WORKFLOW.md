# Agent Workflow Guide

This guide shows AI agents how to push code to gittr.space using gittr-mcp.

## Prerequisites

- Nostr identity (private key required for signing)
- Node.js environment

## Full Workflow

### 1. Install gittr-mcp

```bash
npm install gittr-mcp
# or
const gittr = require('gittr-mcp');
```

### 2. Push Files to Git Server

```javascript
const pushResult = await gittr.pushToBridge({
  ownerPubkey: '<your-pubkey-hex>',  // 64-char hex pubkey
  repo: 'my-repo',
  branch: 'main',
  files: [
    {
      path: 'README.md',
      content: '# My Repo\n\nHello from gittr!'
    },
    {
      path: 'src/index.js',
      content: 'console.log("Hello world!");'
    }
  ]
});

console.log('Pushed files:', pushResult.pushedFiles);
console.log('Commit:', pushResult.refs[0].commit);
```

### 3. Publish to Nostr (Requires Private Key)

**Important:** Steps 2 and 3 require your Nostr private key for signing events.

```javascript
const { nip19 } = require('nostr-tools');

// Announce repository (kind 30617)
const npub = nip19.npubEncode('<your-pubkey-hex>');
const repoUrl = `https://gittr.space/${npub}/my-repo`;

// CRITICAL: Use a GRASP server that's also in your relays list
const graspDomain = 'relay.ngit.dev'; // Known public GRASP server

const announceResult = await gittr.publishRepoAnnouncement({
  repoId: 'my-repo',
  name: 'my-repo',
  description: 'My awesome repository',
  web: [repoUrl],
  clone: [
    `https://${graspDomain}/<your-pubkey-hex>/my-repo.git`,
    `https://git.gittr.space/<your-pubkey-hex>/my-repo.git`
  ],
  privkey: '<your-private-key-hex>', // 64-char hex private key
  relays: [`wss://${graspDomain}`] // MUST include GRASP server as relay
});

console.log('Announced to Nostr, event:', announceResult.event.id);

// Publish repository state (kind 30618)
const refs = pushResult.refs.map(r => ({
  name: r.ref,
  commit: r.commit
}));

const stateResult = await gittr.publishRepoState({
  repoId: 'my-repo',
  refs,
  privkey: '<your-private-key-hex>',
  relays: [`wss://${graspDomain}`]
});

console.log('State published, event:', stateResult.event.id);
```

### 4. Wait for Nostr Propagation

```javascript
console.log('✅ Complete! View your repo at:', repoUrl);
console.log('Wait ~30s for Nostr relays to propagate.');
```

## GRASP Server Requirements

**Critical:** The clone URL domain MUST be listed in the relays array as a WebSocket URL.

### Known Public GRASP Servers

These servers accept repositories from any user:

- `relay.ngit.dev` (recommended)
- `git.shakespeare.diy`
- `ngit-relay.nostrver.se`
- `git-01.uid.ovh`
- `git-02.uid.ovh`
- `ngit.danconwaydev.com`
- `git.gittr.space` (gittr's own server)

### Example

```javascript
// ✅ CORRECT - domain matches
clone: ['https://relay.ngit.dev/<pubkey>/repo.git']
relays: ['wss://relay.ngit.dev']

// ❌ WRONG - domains don't match
clone: ['https://git.gittr.space/<pubkey>/repo.git']
relays: ['wss://relay.noderunners.network'] // Different domain!
```

## Common Issues

### "Announcement must list service in both clone and relays tags"

**Cause:** The clone URL domain doesn't match any relay in your relays list.

**Solution:** Extract the domain from your clone URL and add it as `wss://<domain>` to your relays array.

### Repo shows "0 files" on gittr.space

**Cause:** You pushed files (step 1) but didn't publish to Nostr (steps 2-3).

**Solution:** Run all 3 steps. Files won't appear on gittr.space without Nostr events.

### "duplicate url" error

**Cause:** You're trying to publish to the same relay multiple times.

**Solution:** This is non-fatal. The events were published successfully, just de-duplicate your relays array.

## Security Notes

- **Never commit your private key to git**
- Store it in environment variables or secure storage
- Consider using NIP-07 (browser extension) for key management
- The bridge API (step 1) does NOT require your private key
- Only Nostr publishing (steps 2-3) requires signing

## Complete Example

See `test-full-workflow.js` in the repo for a working end-to-end example.
