/**
 * Glama / awesome-mcp-servers health bar: start over stdio with no nsec
 * and answer initialize + tools/list.
 */
'use strict';

const assert = require('assert');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const root = path.join(__dirname, '..');

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, 'server.js')],
    cwd: root,
    env: { ...process.env, BRIDGE_URL: 'https://gittr.space' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gittr-mcp-introspect', version: '0.0.0' });
  await client.connect(transport);

  try {
    const listed = await client.listTools();
    const names = (listed.tools || []).map((t) => t.name);
    assert.ok(names.length >= 20, `expected 20+ tools, got ${names.length}`);
    assert.ok(names.includes('listRepos'), 'missing listRepos');
    assert.ok(names.includes('createRepo'), 'missing createRepo');
    assert.ok(names.includes('describeAgentAuth'), 'missing describeAgentAuth');
    console.log(`✓ stdio introspect: ${names.length} tools`);
  } finally {
    await client.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
