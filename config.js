module.exports = {
  // Bridge URL for HTTP API calls (git operations, bounties)
  bridgeUrl: process.env.BRIDGE_URL || 'https://git.gittr.space',
  
  // Regular Nostr relays for querying/publishing NIP-34 events
  // These match gittr.space's default relays from .env.example
  relays: (process.env.RELAYS || 'wss://relay.damus.io,wss://nos.lol,wss://nostr.wine').split(','),
  
  // Known GRASP servers (git servers that are also relays)
  graspServers: (process.env.GRASP_SERVERS || 'wss://relay.ngit.dev').split(',')
};
