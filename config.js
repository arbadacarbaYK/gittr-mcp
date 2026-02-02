module.exports = {
  // Bridge URL for HTTP API calls (git operations, bounties)
  bridgeUrl: process.env.BRIDGE_URL || 'https://git.gittr.space',
  
  // NIP-34 aware relays (git-specific, prioritize these)
  // Note: relay.noderunners.network has better NIP support than damus/nos.lol
  nip34Relays: (process.env.NIP34_RELAYS || 
    'wss://relay.noderunners.network,wss://relay.ngit.dev,wss://git.shakespeare.diy,wss://ngit-relay.nostrver.se,wss://git-01.uid.ovh,wss://git-02.uid.ovh,wss://ngit.danconwaydev.com,wss://nostr.wine'
  ).split(','),
  
  // General Nostr relays (removed damus.io and nos.lol - not git-focused, rate limit issues)
  generalRelays: (process.env.GENERAL_RELAYS || 
    ''
  ).split(',').filter(r => r.length > 0),
  
  // All relays combined (for backwards compatibility)
  get relays() {
    return [...this.nip34Relays, ...this.generalRelays];
  },
  
  // Known GRASP servers (git servers that are also relays)
  graspServers: (process.env.GRASP_SERVERS || 'wss://relay.ngit.dev').split(',')
};
