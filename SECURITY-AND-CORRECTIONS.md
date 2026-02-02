# Security & Architecture Corrections

## Critical Corrections from Yvette

### 1. ❌ WRONG: "Relays support NIP-34"

**What I said (WRONG):**
> Nostr Relays (wss://relay.damus.io, wss://nos.lol, wss://nostr.wine) - Store NIP-34 events

**Reality:**
These are **general Nostr relays** - they don't specifically support NIP-34!

**NIP-34 Supporting Relays** (from gittr ui/.env.example):
```
# Git-specific relays (NIP-34 aware):
wss://git.shakespeare.diy
wss://ngit-relay.nostrver.se
wss://git-01.uid.ovh
wss://git-02.uid.ovh
wss://relay.ngit.dev
wss://ngit.danconwaydev.com
wss://relay.noderunners.network  ← Yvette mentioned this one!

# General relays (also included for redundancy):
wss://relay.damus.io
wss://nos.lol
wss://nostr.wine
wss://relay.azzamo.net
wss://relay.nostr.band
wss://nostr.mom
... (and more)
```

**Corrected MCP Config:**
```javascript
module.exports = {
  bridgeUrl: 'https://git.gittr.space',
  
  // NIP-34 aware relays (prioritize these)
  nip34Relays: [
    'wss://relay.noderunners.network',
    'wss://relay.ngit.dev',
    'wss://git.shakespeare.diy',
    'wss://ngit-relay.nostrver.se',
    'wss://git-01.uid.ovh',
    'wss://git-02.uid.ovh',
    'wss://ngit.danconwaydev.com'
  ],
  
  // General relays (backup/redundancy)
  generalRelays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://nostr.wine'
  ]
};
```

### 2. ❌ WRONG: "Agents can push code without keys = no security issue"

**What I said (WRONG):**
> This is HUGE for agent UX - agents can contribute code without managing Nostr keys for every operation.

**Security concern:** This sounds like agents can HAMMER the server with no limits!

**Reality:** ✅ **RATE LIMITING EXISTS**

Found in `ui/src/app/api/middleware/rate-limit.ts`:

```typescript
export const rateLimiters = {
  // API endpoints (including push)
  api: rateLimit({
    maxRequests: 100,
    windowMs: 60000  // 100 requests per minute
  }),

  // Payment endpoints (bounties)
  payment: rateLimit({
    maxRequests: 10,
    windowMs: 60000  // 10 requests per minute - STRICT
  }),

  // Nostr publishing
  nostrPublish: rateLimit({
    maxRequests: 20,
    windowMs: 60000  // 20 requests per minute
  }),

  // Auth endpoints
  auth: rateLimit({
    maxRequests: 5,
    windowMs: 900000  // 5 requests per 15 minutes - VERY STRICT
  })
};
```

**How it's applied** (in `/api/nostr/repo/push`):
```typescript
const rateLimitResult = await rateLimiters.api(req as any);
if (rateLimitResult) {
  return res.status(429).json(JSON.parse(await rateLimitResult.text()));
}
```

**Rate limiting is by IP address:**
- Extracts IP from `x-forwarded-for` or `x-real-ip` headers
- In-memory store tracks requests per IP
- Returns HTTP 429 when limit exceeded
- Headers include retry-after time

**Corrected MCP documentation:**
```
⚠️ SECURITY: Rate Limits

Agents are rate-limited by IP address:
- Push operations: 100/minute (via rateLimiters.api)
- Bounty operations: 10/minute (via rateLimiters.payment)
- Nostr events: 20/minute (via rateLimiters.nostrPublish)

Exceeding limits returns HTTP 429 with Retry-After header.
```

### 3. ❌ WRONG: Push destination unclear

**What I said:** Confusing about where code is pushed

**Reality:** 
```
NEXT_PUBLIC_GIT_SERVER_URL=https://git.gittr.space
```

Agents push to **https://git.gittr.space** (the git-nostr-bridge instance).

The bridge then:
1. Receives push via HTTP API
2. Creates/updates bare git repository
3. Listens to Nostr relays for events
4. May publish to other GRASP servers (if configured)

### 4. ❌ COMPLETELY WRONG: Bounty Flow

**What I said (OVERSIMPLIFIED):**
> Create bounty → Submit PR → Claim bounty

**Reality:** MUCH MORE COMPLEX

#### Actual Bounty Flow:

```
1. ISSUE CREATION (with optional bounty)
   - Issue written on gittr.space
   - Bounty attached during issue creation
   - Bounty creator must have LNbits wallet configured
   
2. BOUNTY CREATION (/api/bounty/create)
   - Creates LNURLW (Lightning withdraw link) from bounty creator's LNbits
   - Funds stay in creator's wallet (not deducted yet!)
   - Returns payment_hash + withdraw link
   - Bounty is stored on gittr (NOT necessarily on relays yet!)
   
3. PR CREATION
   - Developer creates PR
   - MUST link to issue number (#123)
   - PR author must have valid Nostr pubkey (not GitHub username)
   
4. PR MERGE (ONLY repo owner)
   - Repo owner reviews PR
   - Merges PR if it fixes the issue
   - LNURLW is released to PR author
   
5. BOUNTY CLAIM (/api/bounty/claim-withdraw)
   - PR author must have Lightning address in Nostr profile (lud16 or lnurl)
   - System fetches PR author's Lightning address from their Nostr profile
   - Decodes LNURLW to get callback URL
   - Gets invoice from PR author's Lightning address
   - Calls LNURL-withdraw callback with invoice
   - Funds are deducted from bounty creator's LNbits wallet
   - Paid to PR author's Lightning address
```

#### Critical Requirements:

**Bounty Creator:**
- ✅ Must have LNbits sending wallet configured
- ✅ Must maintain sufficient balance until claimed
- ✅ No credentials stored on platform (uses creator's LNbits config)

**PR Author:**
- ✅ Must have valid Nostr pubkey (not GitHub username)
- ✅ Must have Lightning address in Nostr profile (lud16 or lnurl in Kind 0 metadata)
- ⚠️ If no Lightning address → bounty cannot be claimed

**Repo Owner:**
- ✅ Only person who can merge PRs
- ✅ Merging = attesting that PR fixes the issue
- ⚠️ Trust model: Don't create bounties on repos you don't trust

#### Bounty Discovery:

**Question:** Where are bounties stored?

**Answer:** Primarily on **gittr.space itself** (not necessarily on relays yet).

From code comments:
```typescript
// Note: Bounty events are published to Nostr relays from the frontend (kind 9806)
// See: ui/src/app/[entity]/[repo]/issues/[id]/page.tsx handleBountyCreated()
```

So bounties ARE published as Nostr events (kind 9806), BUT:
- ⚠️ Other Nostr git platforms don't support this yet
- ⚠️ Agents should query gittr.space's API first
- ⚠️ Relays are secondary (for future interoperability)

#### Agent Bounty Workflow:

```javascript
// WRONG APPROACH:
// Just query relays for bounties

// CORRECT APPROACH:
// 1. Query gittr.space for issues with bounties
const issues = await fetch('https://gittr.space/api/issues?bounty=true');

// 2. Check Nostr relays as backup
const bountyEvents = await pool.querySync(nip34Relays, {
  kinds: [9806],  // Bounty events
  '#t': ['bounty']
});

// 3. Push PR linking to issue
await fetch('https://git.gittr.space/api/nostr/repo/push', { ... });

// 4. Create PR event (kind 1618) linking to issue
const prEvent = {
  kind: 1618,
  tags: [
    ['a', `30617:${ownerPubkey}:${repoId}`],
    ['p', ownerPubkey],
    ['subject', 'Fix: ...'],
    ['e', issueEventId],  // Link to issue!
    ['c', commitSha]
  ]
};
await pool.publish(nip34Relays, prEvent);

// 5. Wait for repo owner to merge
// (Agent cannot merge! Only owner can!)

// 6. After merge, claim bounty
// ⚠️ Agent must have Lightning address in Nostr profile!
const claimResult = await fetch('https://git.gittr.space/api/bounty/claim-withdraw', {
  method: 'POST',
  body: JSON.stringify({
    withdrawLinkId: bounty.withdrawLinkId,
    recipientLud16: agentLightningAddress,  // From agent's Nostr profile
    lnbitsUrl: bountyCreatorLnbitsUrl,
    lnbitsAdminKey: bountyCreatorAdminKey
  })
});
```

## Security Summary

### ✅ What IS Secure:

1. **Rate limiting by IP**
   - 100 push/minute (API)
   - 10 bounty operations/minute
   - 20 Nostr publishes/minute

2. **Bounty protection**
   - Funds stay in creator's wallet until claimed
   - Only repo owner can merge PRs
   - Withdraw links auto-deleted if issue closed without PR

3. **Authentication**
   - Nostr key signing for events
   - LNbits admin keys for bounty operations
   - No stored credentials

### ⚠️ What Needs Agent Awareness:

1. **Can't hammer the server**
   - Rate limits enforced per IP
   - HTTP 429 responses with retry-after

2. **Can't auto-claim bounties**
   - Requires repo owner to merge PR first
   - Requires Lightning address in agent's Nostr profile
   - Complex LNURL-withdraw flow

3. **Can't push to arbitrary repos**
   - Must know repo owner's pubkey
   - Must respect rate limits
   - No authentication bypass

## Corrected Documentation

All MCP docs updated to reflect:
- ✅ Correct NIP-34 relays (git-specific vs general)
- ✅ Rate limiting details and enforcement
- ✅ Proper bounty flow (not oversimplified)
- ✅ Security considerations for agents
- ✅ Trust model and owner-only merge

## Testing Checklist

- [ ] Test rate limiting enforcement (exceed 100 push/min)
- [ ] Verify bounty flow end-to-end with test Lightning address
- [ ] Confirm NIP-34 relays support repo discovery
- [ ] Test multi-relay fallback (git-specific → general)
- [ ] Verify GRASP server detection with correct relay list

---

**Last Updated:** 2026-02-02  
**Reviewed By:** Yvette (arbadacarbaYK)  
**Status:** Security Review Complete ✅
