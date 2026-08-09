# Security advisory triage (gittr-mcp)

Inbound CVE / GHSA intel mapped onto this package should be checked for **reachability**, not only “dependency name appears in the lockfile.”

## Transport model

`server.js` exposes MCP **only** over `StdioServerTransport`:

- one `Server` instance
- one `connect(transport)` at process start
- **no** `StreamableHTTPServerTransport` / HTTP MCP surface
- **no** MCP resource templates (`UriTemplate` / exploded `{/id*}` patterns)

Hosts (Cursor, Claude Desktop, etc.) spawn one stdio child per session.

## CVE-2026-25536 / GHSA-345p-7cg4-v4c7

**Package:** `@modelcontextprotocol/sdk` (cross-client data leak via shared server/transport reuse; mainly Streamable HTTP / multi-transport).  
**Patched:** `>= 1.26.0`  
**gittr-mcp:** depends on `@modelcontextprotocol/sdk@^1.30.0` (resolved `1.30.0+`).

**Reachability:** **Not reachable.** We never reuse one transport across HTTP clients and never `connect()` the same protocol to multiple transports. Stdio one-shot process model does not hit the advisory’s deployment pattern.

**Verdict:** false positive for fleet deep-triage of [[gittr-mcp]] at current tip.

## CVE-2026-0621 / GHSA-8r9q-7v3j-jr4g (also GHSA-cqwc-fm46-7fff)

**Package:** `@modelcontextprotocol/sdk` (`UriTemplate` ReDoS on exploded resource templates).  
**Patched:** `>= 1.25.2`  
**gittr-mcp:** SDK above floor; tools-only server (no resource template registration).

**Reachability:** **Not reachable.** No `resources/read` templates with exploded array patterns.

**Verdict:** false positive for [[gittr-mcp]].

## Regression guard

`tests/mcp-sdk-reachability.test.js` fails the suite if:

- resolved SDK is below `1.26.0`, or
- `server.js` starts importing Streamable HTTP / SSE MCP transports, or
- resource-template APIs are wired in without an explicit triage update here.
