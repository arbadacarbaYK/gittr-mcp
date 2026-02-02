module.exports = {
  bridgeUrl: process.env.BRIDGE_URL || 'https://gittr.space',
  relays: (process.env.RELAYS || 'wss://relay.noderunners.network,wss://gitnostr.com,wss://relay.damus.io').split(',')
};
