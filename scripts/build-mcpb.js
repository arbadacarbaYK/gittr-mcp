#!/usr/bin/env node
/**
 * Build gittr-mcp-VERSION.mcpb for Claude Desktop / Smithery.
 * Output: dist/gittr-mcp-<version>.mcpb and gittr-mcp-<version>.mcpb (repo root, gitignored).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;

const distDir = path.join(ROOT, 'dist');
const stageDir = path.join(distDir, 'mcpb-stage');
const outName = `gittr-mcp-${version}.mcpb`;
const outDist = path.join(distDir, outName);
const outRoot = path.join(ROOT, outName);

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyJsAndDocs() {
  for (const name of fs.readdirSync(ROOT)) {
    if (name.endsWith('.js')) {
      copyFile(path.join(ROOT, name), path.join(stageDir, name));
    }
  }
  copyFile(path.join(ROOT, 'package.json'), path.join(stageDir, 'package.json'));
  copyFile(path.join(ROOT, 'package-lock.json'), path.join(stageDir, 'package-lock.json'));
  copyFile(path.join(ROOT, 'README.md'), path.join(stageDir, 'README.md'));
  copyFile(path.join(ROOT, 'CHANGELOG.md'), path.join(stageDir, 'CHANGELOG.md'));
  const exampleKeys = path.join(ROOT, '.nostr-keys.json.example');
  if (fs.existsSync(exampleKeys)) {
    copyFile(exampleKeys, path.join(stageDir, '.nostr-keys.json.example'));
  }
  const docsSrc = path.join(ROOT, 'docs');
  if (fs.existsSync(docsSrc)) {
    fs.cpSync(docsSrc, path.join(stageDir, 'docs'), { recursive: true });
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcpb', 'manifest.json'), 'utf8'));
manifest.version = version;

console.log(`[build-mcpb] staging v${version}…`);
rmrf(stageDir);
fs.mkdirSync(stageDir, { recursive: true });
copyJsAndDocs();
fs.writeFileSync(path.join(stageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log('[build-mcpb] npm ci --omit=dev (production deps only)…');
execFileSync('npm', ['ci', '--omit=dev'], { cwd: stageDir, stdio: 'inherit' });

rmrf(outDist);
fs.mkdirSync(distDir, { recursive: true });

const mcpbCli = path.join(ROOT, 'node_modules', '@anthropic-ai', 'mcpb', 'dist', 'cli', 'cli.js');
if (!fs.existsSync(mcpbCli)) {
  console.error('[build-mcpb] Run npm install first (@anthropic-ai/mcpb devDependency).');
  process.exit(1);
}
console.log('[build-mcpb] validate + pack…');
execFileSync(process.execPath, [mcpbCli, 'validate', 'manifest.json'], { cwd: stageDir, stdio: 'inherit' });
const stageOut = path.join(stageDir, outName);
execFileSync(process.execPath, [mcpbCli, 'pack', '.', path.resolve(stageOut)], { cwd: stageDir, stdio: 'inherit' });
fs.renameSync(stageOut, outDist);

fs.copyFileSync(outDist, outRoot);
rmrf(stageDir);

const stat = fs.statSync(outDist);
console.log(`[build-mcpb] done`);
console.log(`  dist/${outName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  ${outName} (copy for uploads / Google form)`);
