module.exports = {
  bridgeUrl: process.env.BRIDGE_URL || 'https://gittr.space',
  relays: (process.env.RELAYS || 'wss://relay.example').split(',')
};
