# npm Account Signup

## Credentials Prepared

**Username:** satopshq  
**Email:** sathq@tits4sats.com  
**Password:** (saved in `~/.npm-credentials.txt`)

```bash
cat ~/.npm-credentials.txt
# Shows: SatOpsDUX9zb721wxYTSg2026!
```

---

## Option 1: Web Signup (Easiest)

1. Go to: https://www.npmjs.com/signup
2. Enter:
   - Username: `satopshq`
   - Email: `sathq@tits4sats.com`
   - Password: (from ~/.npm-credentials.txt)
3. Verify email
4. Login locally:
   ```bash
   npm login
   # Enter same credentials
   ```

---

## Option 2: CLI (Web Auth)

```bash
npm adduser --auth-type=web
```

This opens browser to:
https://www.npmjs.com/login?next=/login/cli/[token]

Complete signup in browser, then CLI auto-authenticates.

---

## After Login

Verify:
```bash
npm whoami
# Should show: satopshq
```

Then publish:
```bash
cd gittr-mcp
npm publish
```

---

## Post-Publish

View package:
https://www.npmjs.com/package/gittr-mcp

Add npm badge to README:
```markdown
[![npm version](https://badge.fury.io/js/gittr-mcp.svg)](https://www.npmjs.com/package/gittr-mcp)
[![downloads](https://img.shields.io/npm/dm/gittr-mcp.svg)](https://www.npmjs.com/package/gittr-mcp)
```

---

**Ready to ship!** 🚀
