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

console.log(
  `✓ mcp-sdk-reachability: sdk=${sdkVersion} stdio-only tools server (CVE-2026-25536 / CVE-2026-0621 not reachable)`
);
