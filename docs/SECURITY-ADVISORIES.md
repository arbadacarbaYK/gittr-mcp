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

## SDK lockfile pins (fast-uri / hono / qs)

OSV.dev matches **transitive** copies that ship with `@modelcontextprotocol/sdk`. gittr-mcp does not import these packages itself. The MCP SDK has not bumped them yet, so `package.json` `overrides` force patched versions:

| Package | Locked (vulnerable) | Override | Why it showed up |
| --- | --- | --- | --- |
| `fast-uri` | 3.1.5 | **3.1.7** (≥ 3.1.6) | AJV JSON Schema validator on the **stdio** `Server` path — actually loaded at startup |
| `hono` | 4.13.0 | **4.13.7** (≥ 4.13.5) | SDK Streamable HTTP examples / `@hono/node-server` — **not** used (stdio only) |
| `qs` | 6.15.3 | **6.16.0** | Express / body-parser under the SDK HTTP helpers — **not** used on stdio |

**CVEs covered:** fast-uri CVE-2026-75931 / 75975 / 75899 / 76172; hono CVE-2026-84363 / 84364 / 84365; qs CVE-2026-82417 / 82562.

A lockfile match is still not proof gittr-mcp is exploitable (especially hono `toSSG` / query-parser paths). Pinning stops the Dependencies tab from flagging known-patched versions inside the `.mcpb`.

## Regression guard

`tests/mcp-sdk-reachability.test.js` fails the suite if:

- resolved SDK is below `1.26.0`, or
- `server.js` starts importing Streamable HTTP / SSE MCP transports, or
- resource-template APIs are wired in without an explicit triage update here, or
- lockfile `fast-uri` / `hono` / `qs` fall below the override floors.
