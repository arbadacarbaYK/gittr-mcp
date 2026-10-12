module.exports = {
  // Main site URL for HTTP API calls (Next.js API routes)
  bridgeUrl: process.env.BRIDGE_URL || 'https://gittr.space',

  // Optional defaults for bounty invoice API (same as gittr Settings → Account LNbits)
  // Prefer passing per-request; never log these in agent transcripts.
  // gittrNostr.createBountyInvoice reads GITTR_LNBITS_URL / GITTR_LNBITS_ADMIN_KEY if unset in args.
  
  // Relays that store a kind 30617 even when clone[] is only a GitHub URL.
  // Git servers (ngit, shakespeare, …) reject that announcement unless their
  // own git URL is in clone[]. relay.gittr.space and damus keep it.
  discoveryRelays: (process.env.GITTR_DISCOVERY_RELAYS ||
    'wss://relay.gittr.space,wss://relay.damus.io,wss://nos.lol'
  ).split(',').map((r) => r.trim()).filter((r) => r.length > 0),

  // Git relays. Dead hosts (git-01/02.uid.ovh, ngit-relay.nostrver.se) are
  // omitted: a failed socket used to count as a successful publish.
  nip34Relays: (process.env.NIP34_RELAYS ||
    'wss://relay.ngit.dev,wss://git.shakespeare.diy,wss://ngit.danconwaydev.com,wss://nostr.wine,wss://relay.noderunners.network'
  ).split(',').map((r) => r.trim()).filter((r) => r.length > 0),

  // Extra relays from the environment (comma-separated wss:// URLs).
  generalRelays: (process.env.GENERAL_RELAYS ||
    ''
  ).split(',').map((r) => r.trim()).filter((r) => r.length > 0),

  // Discovery first, then git relays. Callers that pass an explicit GRASP-only
  // list still need mergeRepoRelays() so a GitHub-only announcement is stored.
  get relays() {
    return [...new Set([...this.discoveryRelays, ...this.nip34Relays, ...this.generalRelays])];
  },
  
  // Known GRASP servers (git servers that are also relays)
  graspServers: (process.env.GRASP_SERVERS || 'wss://relay.ngit.dev').split(',')
};
