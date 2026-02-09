# Twitter Login Blocker

Twitter login page can load very slowly in browser automation (stuck on spinner). **Use the bird skill** for X/Twitter (read, search, post) — it uses the bird CLI with cookie auth. Workarounds: (1) Arbadacarba logs in manually in browser when needed; (2) use bird with cookies (see below); (3) skip Twitter-dependent tasks and focus on technical work. X/Twitter account: @SatsOpsHQ.

**Bird skill + credentials on this machine:** The file `~/.config/bird/config.json5` does **not** exist here (it was not migrated or never created). To use bird you can:

- **Option A — Browser cookies (no config file):** Log in to x.com in Chrome/Safari/Firefox, then run bird with `--cookie-source chrome` (or `safari` / `firefox`). For Brave/Arc use `--chrome-profile-dir <path>` to the profile directory. No authToken/ct0 file needed.
- **Option B — Env vars:** Set `AUTH_TOKEN` and `CT0` (or `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`) with the cookie values; bird uses them if no config file exists.
- **Option C — Config file for browser:** Create `~/.config/bird/config.json5` with e.g. `cookieSource: ["chrome"]` or `chromeProfileDir: "/path/to/profile"` so bird reads cookies from the browser (no authToken/ct0 in file). Bird does not read authToken/ct0 from config — use Option B for that. To get auth_token and ct0 manually: after logging in to x.com, DevTools → Application → Cookies → x.com → copy values into env (Option B) or pass `--auth-token` / `--ct0` on the CLI.

Until one of these is done, bird will not be authenticated on this laptop.
