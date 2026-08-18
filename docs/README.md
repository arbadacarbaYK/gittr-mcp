# Documentation index

**New here?** Read the [root README](../README.md) first (install + keys + one MCP snippet).

| Doc | Who | What |
|-----|-----|------|
| [MCP-HOSTS.md](MCP-HOSTS.md) | Everyone | Cursor, Claude, VS Code, Windsurf, OpenClaw / mcporter, generic stdio |
| [DEVELOPER.md](DEVELOPER.md) | Devs | API parameters, GRASP list, common errors, limitations |
| [AGENT-WORKFLOW.md](AGENT-WORKFLOW.md) | Devs / agents | End-to-end flows (`createRepo`, push, publish) |
| [AGENT-QUICKSTART.md](AGENT-QUICKSTART.md) | Devs | Minimal JS patterns |
| [SIGNING-GUIDE.md](SIGNING-GUIDE.md) | Devs | Keys, signing, bridge challenges |
| [NIP34-SCHEMAS.md](NIP34-SCHEMAS.md) | Devs | Event kinds / tags reference |
| [TEST-VALIDATION.md](TEST-VALIDATION.md) | Devs | How live tests are run in CI / locally |
| [Glama listing](https://glama.ai/mcp/servers/arbadacarbaYK/gittr-mcp) | Devs | Registry page. Claim with root `glama.json`; `Dockerfile` is what Glama runs for `tools/list` |
| Live admin proof | Devs | `GITTR_TEST_NSEC=… npm run test:live:matrix` — **close issue**, **merge PR** (`mergePullRequest`), not only create. Needs `git` on PATH. Skip merge: `GITTR_SKIP_MERGE_LIFECYCLE=1`. |
