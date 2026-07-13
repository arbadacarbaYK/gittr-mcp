# Releasing gittr-mcp

The `.mcpb` file is a **snapshot bundle** for Claude Desktop / Smithery — not a symlink to the repo.

## After you change gittr-mcp

### Every push to `main`

CI (when workflows are on GitHub) runs tests and verifies the MCPB **builds**. No upload yet.

### When you want a new `.mcpb` on GitHub Releases

1. Bump **`version`** in `package.json` (+ `CHANGELOG.md` entry).
2. Commit and push `main`.
3. Run **one command** (uses your `GITHUB_PLATFORM_TOKEN` — no browser needed):

```bash
npm run release
```

That will:

- Run tests
- Build `dist/gittr-mcp-<version>.mcpb` and `gittr-mcp-<version>.mcpb` (repo root, for Google form uploads)
- Create git tag `v<version>` and push it
- Create/update the GitHub Release and attach the `.mcpb`

### Build only (no GitHub upload)

```bash
npm run build:mcpb
```

Outputs:

- `dist/gittr-mcp-<version>.mcpb`
- `gittr-mcp-<version>.mcpb` in repo root (gitignored)

`npm run sync-versions` aligns `server.json` and `mcpb/manifest.json` with `package.json`.

## Optional: fully automatic on GitHub (needs `workflow` PAT once)

The repo includes `.github/workflows/release.yml` — on every `v*` tag push, GitHub Actions builds the MCPB, attaches it to the release, and (optionally) publishes npm + MCP Registry.

Your current PAT cannot push workflow files. To enable:

1. Regenerate GitHub PAT with **`workflow`** scope, or
2. Paste `.github/workflows/release.yml` and the updated `ci.yml` via the GitHub web UI once.

Until then, **`npm run release`** does the same GitHub upload via API.

## One-time secrets (optional)

- **`NPM_TOKEN`** on GitHub: auto `npm publish` from Actions when workflows are enabled.
