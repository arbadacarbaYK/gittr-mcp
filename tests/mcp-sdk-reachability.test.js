/**
 * Reachability guard for inbound MCP SDK advisories (CVE-2026-25536, CVE-2026-0621).
 * gittr-mcp is stdio + tools only — fail CI if that assumption drifts.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const pkg = require(path.join(root, 'package.json'));

const sdkPkgPath = path.join(
  root,
  'node_modules',
  '@modelcontextprotocol',
  'sdk',
  'package.json'
);
assert.ok(fs.existsSync(sdkPkgPath), `missing ${sdkPkgPath}`);
const sdkPkg = JSON.parse(fs.readFileSync(sdkPkgPath, 'utf8'));
const sdkVersion = String(sdkPkg.version || '');

function parseSemver(v) {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  assert(m, `unparseable semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function gte(a, b) {
  const A = parseSemver(a);
  const B = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return true;
    if (A[i] < B[i]) return false;
  }
  return true;
}

assert.ok(
  gte(sdkVersion, '1.26.0'),
  `@modelcontextprotocol/sdk ${sdkVersion} is below 1.26.0 (CVE-2026-25536 floor)`
);

const dep = pkg.dependencies && pkg.dependencies['@modelcontextprotocol/sdk'];
assert.ok(dep, 'package.json must depend on @modelcontextprotocol/sdk');
assert.ok(
  /^(?:\^|~|>=)?1\.(?:2[6-9]|[3-9]\d)\./.test(dep) || gte(sdkVersion, '1.26.0'),
  `dependency range ${dep} must keep SDK >= 1.26.0`
);

const serverJson = JSON.parse(fs.readFileSync(path.join(root, 'server.json'), 'utf8'));
assert.strictEqual(
  serverJson.version,
  pkg.version,
  'server.json version must match package.json'
);
assert.strictEqual(
  serverJson.packages && serverJson.packages[0] && serverJson.packages[0].version,
  pkg.version,
  'server.json package entry version must match package.json'
);
const mcpbManifest = JSON.parse(
  fs.readFileSync(path.join(root, 'mcpb', 'manifest.json'), 'utf8')
);
assert.strictEqual(
  mcpbManifest.version,
  pkg.version,
  'mcpb/manifest.json version must match package.json'
);
assert.match(
  serverSrc,
  /require\(\s*['"]\.\/package\.json['"]\s*\)/,
  'server.js must load package.json for the MCP Server version'
);
assert.match(
  serverSrc,
  /version:\s*packageMetadata\.version/,
  'MCP initialize version must come from package.json, not a hardcoded string'
);

assert.match(
  serverSrc,
  /StdioServerTransport/,
  'server.js must use StdioServerTransport'
);
assert.doesNotMatch(
  serverSrc,
  /StreamableHTTPServerTransport|SSEServerTransport/,
  'server.js must not wire Streamable HTTP / SSE MCP transports without re-triage'
);
assert.doesNotMatch(
  serverSrc,
  /ListResourcesRequestSchema|ReadResourceRequestSchema|ResourceTemplate|UriTemplate/,
  'server.js must not register MCP resource templates without re-triage (CVE-2026-0621)'
);
assert.match(
  serverSrc,
  /server\.connect\(\s*transport\s*\)/,
  'server.js must connect exactly the stdio transport'
);

const lock = JSON.parse(
  fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
);

function lockfileVersions(packageName) {
  const found = [];
  for (const [key, meta] of Object.entries(lock.packages || {})) {
    if (
      key === `node_modules/${packageName}` ||
      key.endsWith(`/node_modules/${packageName}`)
    ) {
      found.push(String(meta.version || ''));
    }
  }
  return found;
}

function assertOverrideFloor(packageName, floor) {
  const versions = lockfileVersions(packageName);
  assert.ok(
    versions.length > 0,
    `package-lock.json must contain ${packageName} (MCP SDK transitive)`
  );
  for (const v of versions) {
    assert.ok(
      gte(v, floor),
      `${packageName}@${v} is below override floor ${floor}`
    );
  }
}

const overrides = pkg.overrides || {};
assert.strictEqual(overrides['fast-uri'], '3.1.7');
assert.strictEqual(overrides.hono, '4.13.7');
assert.strictEqual(overrides.qs, '6.16.0');
assertOverrideFloor('fast-uri', '3.1.6');
assertOverrideFloor('hono', '4.13.5');
assertOverrideFloor('qs', '6.16.0');

console.log(
  `✓ mcp-sdk-reachability: sdk=${sdkVersion} pkg=${pkg.version} stdio-only tools server (CVE-2026-25536 / CVE-2026-0621 not reachable; fast-uri/hono/qs overrides)`
);
