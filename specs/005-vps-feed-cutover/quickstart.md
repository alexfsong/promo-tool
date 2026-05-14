# Quickstart: vpsFeed Cutover (spec 005)

Manual smoke + ops checklist that exercises the full cutover. Run after `/speckit-implement` and before considering 005 ready to merge. Two halves: **VPS-side** (operator at SSH terminal) and **Client-side** (extension reloaded from `chrome://extensions`).

## Prerequisites

- The maintainer's existing VPS at `195.201.99.206` (already running caddy
  for `lisearch.195-201-99-206.sslip.io` and
  `portfolio.195-201-99-206.sslip.io`), per research.md R1.
- sslip.io wildcard-resolves `promo-tool.195-201-99-206.sslip.io` to the
  host IP automatically — no DNS configuration needed.
- `caddy` v2+ and `rsync` (+ `rrsync` wrapper) installed on the VPS.
  Node is NOT required on the VPS — the scraper runs on GitHub Actions
  per research.md R9.
- This repo on GitHub with three Actions secrets configured:
  `VPS_DEPLOY_KEY`, `VPS_KNOWN_HOSTS`, `VPS_DEPLOY_USER`.
- `gh` CLI authenticated locally (`gh auth status`).

## Ops smoke A — Scraper runs on GitHub Actions and rsyncs to VPS

**Goal**: covers US2, FR-007, FR-014.

```bash
# 1. Trigger the workflow manually.
gh workflow run scraper.yml
gh run watch                              # follow until completion

# 2. From the VPS, verify files landed under /var/www/promo-tool.
ssh deploy@195.201.99.206 'ls -la /var/www/promo-tool/sports.json /var/www/promo-tool/odds/'
# Expect: files owned deploy:caddy, mtime within the last minute.

# 3. From any client, fetch through caddy.
curl -u maintainer:<pw> https://promo-tool.195-201-99-206.sslip.io/sports.json | jq '.[].key'
```

**Pass criteria**: Actions run completes green in ≤ 90 s. `sports.json` contains the eight expected keys (NFL, NBA, MLB, NHL, EPL, UCL, ATP+WTA, MMA — per R5). Each `odds/<key>.json` is a JSON array; non-empty during in-season for that sport.

## Ops smoke B — Scheduled workflow firing every 10 minutes

**Goal**: covers SC-002 + SC-005.

```bash
# 1. Confirm the workflow is on the schedule.
gh workflow list                          # scraper.yml should appear, status "active"

# 2. Wait 15 minutes after committing the workflow file.
#    GitHub's scheduler is best-effort; drift up to ~10 min is normal.

# 3. List recent runs.
gh run list -w scraper.yml --limit 5
# Expect: at least one "scheduled" run completed in the last 15 min.

# 4. Spot-check freshness from the VPS.
ssh deploy@195.201.99.206 'stat -c "%y %n" /var/www/promo-tool/sports.json /var/www/promo-tool/odds/*.json'
```

**Pass criteria**: `mtime` on `sports.json` and on each `odds/*.json` is within the last 15 minutes. Actions tab shows green "scheduled" run badges; ≤1 missed slot out of any 6 consecutive expected fires (SC-005 95% threshold).

## Ops smoke C — caddy Basic Auth + HTTPS

**Goal**: covers FR-011, FR-013.

```bash
# 1. Generate bcrypt hashes for the maintainer + first friend.
caddy hash-password --plaintext '<maintainer-password>'
caddy hash-password --plaintext '<alice-password>'

# 2. Append the new site block to /etc/caddy/Caddyfile per scraper/DEPLOY.md.
#    Paste the two hashes inside the basic_auth { ... } stanza.
sudo $EDITOR /etc/caddy/Caddyfile

# 3. Validate + reload (graceful, no downtime).
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 4. caddy negotiates the TLS cert on the first request — watch the log.
journalctl -u caddy -f --since '1 minute ago' &
# In another terminal:
curl -I https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect: HTTP/2 401 + WWW-Authenticate: Basic ...

curl -u alice:<password> https://promo-tool.195-201-99-206.sslip.io/sports.json | jq '.[0]'
# Expect a sport object.

curl -I http://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect 308 → https://... (caddy default redirect).
```

**Pass criteria**: 401 without creds, 200 with creds, 308 on HTTP, valid TLS cert (no `curl: (60)`).

## Ops smoke D — Adding + revoking a friend

**Goal**: covers the edge cases added during clarify (per-friend revoke).

```bash
# Add a friend.
caddy hash-password --plaintext '<bob-password>'
# Paste a new line inside the basic_auth block: bob $2a$14$...
sudo $EDITOR /etc/caddy/Caddyfile
sudo systemctl reload caddy

# Verify bob can read.
curl -u bob:<password> -o /dev/null -w '%{http_code}\n' https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect 200.

# Revoke bob.
sudo $EDITOR /etc/caddy/Caddyfile
# Delete bob's line inside basic_auth { }.
sudo systemctl reload caddy

# Re-verify.
curl -u bob:<password> -o /dev/null -w '%{http_code}\n' https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect 401.

# Alice still works.
curl -u alice:<password> -o /dev/null -w '%{http_code}\n' https://promo-tool.195-201-99-206.sslip.io/sports.json
# Expect 200.
```

**Pass criteria**: per-friend add and revoke take effect within seconds (caddy reload is graceful), do not disrupt other friends.

---

## Client smoke E — Provider default flip

**Goal**: covers US3, FR-001, FR-005.

1. Open `src/api/provider.js`. Confirm:
   - `import * as vpsFeed from './providers/vpsFeed.js';` is the active (non-commented) line.
   - `const provider = vpsFeed;` is the active line.
   - The `theOddsApi` import + const are present but commented.
2. Load the unpacked extension at `chrome://extensions` from the repo root.
3. Open the side panel. Open Settings.
4. Field label reads "Feed URL" (or per-provider equivalent), placeholder shows an example feed URL with `user:pass@`, hint references the feed (not the-odds-api.com).
5. Open the browser dev tools → Network tab.
6. Run a scan. Confirm requests are made to `https://*.195-201-99-206.sslip.io/*`, none to `api.the-odds-api.com`.

**Pass criteria**: zero requests to The-Odds-API. Field copy is provider-specific.

## Client smoke F — Friend installs without an API key

**Goal**: covers US1, SC-001.

Using a fresh Chrome profile to simulate a friend:

1. Load the unpacked extension.
2. Open the side panel → Settings.
3. Paste `https://alice:<password>@promo-tool.195-201-99-206.sslip.io` into the Feed URL field. Save.
4. (Alternative paste variants to test FR-002 normalization):
   - `promo-tool.195-201-99-206.sslip.io` (no protocol — auto-prefixed `https://`; will 401 without creds, prompting re-paste)
   - URL with a trailing slash and surrounding whitespace
   - URL with a percent-encoded password (e.g., `p%40ss` for `p@ss`)
5. Tap "Find best play". A Best Play card renders.

**Pass criteria** (SC-001 timing): from "Settings opened" to "first Best Play card visible" ≤ **90 seconds**. No The-Odds-API signup link visible anywhere.

## Client smoke G — Credentials-rejection error path

**Goal**: covers FR-013 401 handling.

1. Paste a feed URL with the wrong password. Save.
2. Tap a scan.
3. UI shows a one-sentence error: "Feed credentials rejected — check the URL you pasted in Settings." (Or equivalent, per FR-013.)
4. Existing input values (target odds, bonus amount) are preserved.
5. Paste a feed URL with the right password. Save.
6. Re-tap scan. Best Play card renders.

**Pass criteria**: 401 produces the credentials-specific message, not a generic network error. State preserved.

## Client smoke H — Missing-protocol auto-prefix

**Goal**: covers FR-002 (URL normalize) and Edge Case "Feed URL pasted without credentials".

1. Paste `alice:<password>@promo-tool.195-201-99-206.sslip.io` (no `https://`).
2. Save. Re-open Settings.
3. Stored value reads `https://alice:<password>@promo-tool.195-201-99-206.sslip.io`.
4. Run a scan. Best Play card renders.

**Pass criteria**: auto-prefix happens silently; no error; subsequent requests succeed.

## Client smoke I — Sport coverage extended

**Goal**: covers US4, FR-009.

1. Settings → My sportsbooks includes books for soccer (most US books cover EPL during season).
2. Side panel → Best Play → promo type "Bonus Bet" → enter $50 bonus.
3. Tap "Find best play".
4. The selected event should be drawn from any of the eight sports during their respective in-season windows. Verify by inspecting the rendered event label.
5. Alternative: open the Scanner tab (Advanced mode), pick "Best overall (all sports)", confirm the dropdown lists all eight sports (NFL, NBA, MLB, NHL, EPL, UCL, ATP+WTA, MMA).

**Pass criteria**: dropdown lists eight sports; scan returns events from at least one non-NFL/NBA sport during off-season for those four.

---

## Regression check — spec 001 still works

**Goal**: confirm the cutover didn't break Best Play / Bet-slip paste / EV tab.

Run the seven smoke tests in `specs/001-best-play-card/quickstart.md` against the vpsFeed-backed extension. All MUST pass identically to the pre-cutover run.

**Pass criteria**: tests A–G in spec 001 pass without modification. The provider abstraction is doing its job.

---

## Definition of done for spec 005

- All ops smokes A–D pass on the production VPS + GitHub Actions.
- All client smokes E–I pass against the production feed.
- Spec 001 regression check passes.
- `node --test test/vpsFeed.test.js` passes (FR-002 URL normalize + credential extract).
- `manifest.json` `host_permissions` includes `https://*.195-201-99-206.sslip.io/*`.
- `.github/workflows/scraper.yml` is committed and the workflow is enabled in the Actions tab.
- `scraper/deploy.md` exists and reflects the GH Actions architecture (R9).
- At least one real friend (not the maintainer) has run smoke F end-to-end in under 90 seconds.
- One 24-hour soak: `gh run list -w scraper.yml` shows ≥95% successful runs (SC-005); P95 feed `last_update` age ≤ 20 min (SC-002).
