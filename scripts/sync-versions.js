#!/usr/bin/env node
/** Keep server.json and mcpb/manifest.json version aligned with package.json. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const serverPath = path.join(ROOT, 'server.json');
const server = JSON.parse(fs.readFileSync(serverPath, 'utf8'));
server.version = version;
if (Array.isArray(server.packages)) {
  for (const p of server.packages) {
    p.version = version;
  }
}
fs.writeFileSync(serverPath, `${JSON.stringify(server, null, 2)}\n`);

const manifestPath = path.join(ROOT, 'mcpb', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[sync-versions] ${version} → server.json, mcpb/manifest.json`);
