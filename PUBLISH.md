# Publishing gittr-mcp to npm

## Prerequisites

✅ All done:
- [x] Package tested end-to-end
- [x] README.md complete with examples
- [x] docs/AGENT-WORKFLOW.md guide created
- [x] Code pushed to GitHub
- [x] Version set to 1.0.0
- [x] Lightning address for tips: arbadacarba@btip.nl
- [x] All dependencies installed (nostr-tools, websocket-polyfill)

## Publish Steps

### 1. Create npm Account (if needed)

**Option A:** Use Yvette's npm account
- Username: (to be determined)
- Email: proper gittr.space branded email

**Option B:** Create new account at https://npmjs.com/signup
- Username: gittrspace or satopshq
- Email: info@gittr.space or similar
- Password: save to ~/.npm-credentials.txt

### 2. Login to npm

```bash
npm login
```

Enter credentials when prompted.

### 3. Publish

```bash
cd gittr-mcp
npm publish
```

**Expected output:**
```
+ gittr-mcp@1.0.0
```

### 4. Verify

```bash
npm info gittr-mcp
```

Should show version 1.0.0 published.

### 5. Test Installation

```bash
cd /tmp
mkdir test-install
cd test-install
npm install gittr-mcp
node -e "const gittr = require('gittr-mcp'); console.log('✅ Installed:', Object.keys(gittr));"
```

## Announcement Plan

### After npm publish succeeds:

**1. X/Twitter** (see posts/twitter.txt)
- Option 1: Short announcement (120 chars)
- Option 2: Thread (4 tweets with details)

**2. Nostr** (see posts/nostr.md)
- Long-form article with full technical details
- Post to all GRASP-aware relays

**3. Moltbook** (when claimed)
- Post announcement to /m/general
- Cross-post to /m/bitcoin and /m/coding

**4. Reddit**
- r/nostr - "gittr-mcp: Enable AI agents to push code via Nostr"
- r/Bitcoin - Lightning angle (bounties, payments)

**5. ClawHub** (after adoption proven)
- Wait for 10+ npm installs
- Submit to skill marketplace
- Tag: nostr, mcp, agent-tools, bitcoin, lightning

**6. GitHub**
- Update repo description
- Add topics/tags (see GITHUB-METADATA.md)
- Pin repository

## Post-Launch

### Monitor
- npm downloads: https://npmjs.com/package/gittr-mcp
- GitHub stars/issues
- Moltbook mentions
- Lightning tips received

### Support
- Respond to GitHub issues
- Update docs based on feedback
- Add examples as requested
- Consider video tutorial

### Marketing
- Share success stories
- Feature agents using gittr-mcp
- Build integrations (OpenClaw, mcporter, etc.)
- Write blog post on gittr.space

## Success Metrics

**Week 1:**
- 50+ npm downloads
- 10+ GitHub stars
- 1+ Lightning tip received

**Month 1:**
- 200+ npm downloads
- 50+ GitHub stars
- 5+ agents actively using
- 1+ PR to gittr-mcp from community

**Month 3:**
- Featured in agent toolkit lists
- 1,000+ npm downloads
- Integration with major agent frameworks
- gittr.space as go-to platform for agent code placement

## Next Steps

1. ✅ Wait for proper gittr.space email setup
2. ✅ npm signup with branded email
3. ✅ npm publish
4. ✅ Execute announcement wave
5. ✅ Monitor & respond to feedback

---

**Ready to ship!** 🚀
