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
**gittr-mcp:** depends on `@modelcontextprotocol/sdk@^1.32.1`.

**Reachability:** **Not reachable.** We never reuse one transport across HTTP clients and never `connect()` the same protocol to multiple transports. Stdio one-shot process model does not hit the advisory’s deployment pattern.

**Verdict:** false positive for fleet deep-triage of [[gittr-mcp]] at current tip.

## CVE-2026-0621 / GHSA-8r9q-7v3j-jr4g (also GHSA-cqwc-fm46-7fff)

**Package:** `@modelcontextprotocol/sdk` (`UriTemplate` ReDoS on exploded resource templates).  
**Patched:** `>= 1.25.2`  
**gittr-mcp:** SDK above floor; tools-only server (no resource template registration).

**Reachability:** **Not reachable.** No `resources/read` templates with exploded array patterns.

**Verdict:** false positive for [[gittr-mcp]].

## CVE-2026-104850 / GHSA-6qxp-vccf-f47h

**Package:** `@modelcontextprotocol/sdk` (OAuth client sends credentials to an authorization server chosen by the MCP server).  
**Affected:** `1.12.0`–`1.30.1`  
**Patched:** `>= 1.31.0` (this repo depends on `^1.32.1`)

**Reachability:** **Not reachable.** gittr-mcp is an MCP **server** on stdio. It does not construct an OAuth client, `authProvider`, or HTTP/SSE client transport. The advisory applies to apps that connect *out* to another MCP server with stored OAuth credentials. Test helpers that spawn `server.js` over stdio do not send OAuth secrets.

**Verdict:** lockfile used to match because `1.30.0` was inside the affected range. Upgraded so the Dependencies tab stops listing it. Still not an exploitable path in this package.

## SDK lockfile pins (fast-uri / hono / qs)

OSV.dev matches **transitive** copies that ship with `@modelcontextprotocol/sdk`. gittr-mcp does not import these packages itself. The MCP SDK has not bumped them yet, so `package.json` `overrides` force patched versions:

| Package | Locked (vulnerable) | Override | Why it showed up |
| --- | --- | --- | --- |
| `fast-uri` | 3.1.5, then 3.1.7 | **3.1.8** | AJV JSON Schema validator on the **stdio** `Server` path — actually loaded at startup. 3.1.7 still matches CVE-2026-86472 (host-case confusion) |
| `hono` | 4.13.0 | **4.13.7** (≥ 4.13.5) | SDK Streamable HTTP examples / `@hono/node-server` — **not** used (stdio only) |
| `qs` | 6.15.3 | **6.16.0** | Express / body-parser under the SDK HTTP helpers — **not** used on stdio |
| `proxy-addr` | 2.0.7 | **2.0.8** | Express `req.ip` helper — **not** used on stdio. 2.0.7 is CVE-2026-90711 (critical IP spoof) |
| `brace-expansion` | 5.0.9 | **5.0.12** | `nodemon` → `minimatch` (dev). Same brace DoS family as the gittr UI pins |
| `ip-address` | 10.4.0 | **10.7.3** | `express-rate-limit` — **not** used on stdio. `>=10.4.0` still resolved a vulnerable 10.4.0 |

**CVEs covered:** fast-uri CVE-2026-75931 / 75975 / 75899 / 76172 / 86472; hono CVE-2026-84363 / 84364 / 84365; qs CVE-2026-82417 / 82562; proxy-addr CVE-2026-90711; brace-expansion CVE-2026-102276 / 102277 / 102278; ip-address link-local / special-range checks through 10.7.0.

A lockfile match is still not proof gittr-mcp is exploitable (especially hono `toSSG` / query-parser paths). Pinning stops the Dependencies tab from flagging known-patched versions inside the `.mcpb`.

## Regression guard

`tests/mcp-sdk-reachability.test.js` fails the suite if:

- resolved SDK is below `1.31.0` (CVE-2026-104850 floor; also covers CVE-2026-25536), or
- `server.js` starts importing Streamable HTTP / SSE MCP transports, or
- resource-template APIs are wired in without an explicit triage update here, or
- lockfile `fast-uri` / `hono` / `qs` / `proxy-addr` / `brace-expansion` / `ip-address` fall below the override floors.
