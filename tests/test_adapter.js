// tests/test_adapter.js
const fetch = require('node-fetch');
const MCP_BASE = process.env.MCP_BASE || 'http://localhost:3000/mcp';

async function smoke() {
  const r = await fetch(`${MCP_BASE}/auth.use_identity`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ hex_privkey: '0000000000000000000000000000000000000000000000000000000000000001' })
  });
  const j = await r.json();
  console.log('auth.use_identity ->', j);
}

smoke().catch(e => { console.error(e); process.exit(1); });
