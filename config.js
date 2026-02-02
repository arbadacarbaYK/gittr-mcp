module.exports = {
  // Bridge URL for HTTP API calls (git operations, bounties)
  bridgeUrl: process.env.BRIDGE_URL || 'https://git.gittr.space',
  
  // NIP-34 aware relays (git-specific, prioritize these)
  nip34Relays: (process.env.NIP34_RELAYS || 
    'wss://relay.noderunners.network,wss://relay.ngit.dev,wss://git.shakespeare.diy,wss://ngit-relay.nostrver.se,wss://git-01.uid.ovh,wss://git-02.uid.ovh,wss://ngit.danconwaydev.com'
  ).split(','),
  
  // General Nostr relays (backup/redundancy)
  generalRelays: (process.env.GENERAL_RELAYS || 
    'wss://relay.damus.io,wss://nos.lol,wss://nostr.wine'
  ).split(','),
  
  // All relays combined (for backwards compatibility)
  get relays() {
    return [...this.nip34Relays, ...this.generalRelays];
  },
  
  // Known GRASP servers (git servers that are also relays)
  graspServers: (process.env.GRASP_SERVERS || 'wss://relay.ngit.dev').split(',')
};
