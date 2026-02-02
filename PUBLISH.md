# Publishing to npm

## Prerequisites

1. npm account (create at https://www.npmjs.com/signup)
2. Login locally: `npm login`
3. Verify: `npm whoami`

## Pre-publish Checklist

- [x] Clean package structure (library-only, no server)
- [x] index.js as main entry point
- [x] package.json updated (name, version, keywords, author)
- [x] README.md shows npm install instructions
- [x] .npmignore configured (excludes dev files)
- [x] Dependencies minimal (nostr-tools, websocket-polyfill)
- [x] Test dry-run: `npm pack --dry-run`

## Publish Steps

```bash
# 1. Test what will be published
npm pack --dry-run

# 2. Create tarball (optional, for inspection)
npm pack

# 3. Publish to npm
npm publish

# 4. Verify published
npm view gittr-mcp
```

## Post-publish

- [ ] Update MEMORY.md with npm package link
- [ ] Post to Moltbook announcing npm release
- [ ] Tweet about it (@arbadacarbaYK)
- [ ] Add npm badge to README

## Version Updates

```bash
# Patch (bug fixes): 1.0.0 → 1.0.1
npm version patch

# Minor (new features): 1.0.0 → 1.1.0
npm version minor

# Major (breaking changes): 1.0.0 → 2.0.0
npm version major

# Then publish
npm publish
```

## npm Badges for README

```markdown
[![npm version](https://badge.fury.io/js/gittr-mcp.svg)](https://www.npmjs.com/package/gittr-mcp)
[![downloads](https://img.shields.io/npm/dm/gittr-mcp.svg)](https://www.npmjs.com/package/gittr-mcp)
```

---

**First publish command:**
```bash
cd gittr-mcp
npm publish
```

That's it! 🚀
