---

description: "Task list for spec 005 — vpsFeed Cutover"
---

# Tasks: vpsFeed Cutover (default provider)

**Input**: Design documents from `/specs/005-vps-feed-cutover/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md
**Tests**: Included — plan.md mandates `test/vpsFeed.test.js` for the pure URL normalize + credential extraction logic (FR-002, R4). Ops work is verified via the smokes in `quickstart.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files / different machines, no incomplete deps)
- **[Story]**: `[US1]`–`[US5]` for user-story phase tasks only
- File paths absolute-relative to repo root. Ops paths are absolute on the VPS.

## Path Conventions

Single repo, dual deliverable per plan.md §"Structure Decision":

- Client source: `src/api/`, `popup/`, `manifest.json`
- Tests: `test/` (`node --test`)
- Scraper source: `scraper/`
- Spec docs: `specs/005-vps-feed-cutover/`
- Ops paths on VPS: `/opt/promo-tool/`, `/var/www/promo-tool/`, `/etc/caddy/Caddyfile`, `/var/log/promo-scraper.log`

---

## Phase 1: Setup

**Purpose**: empty test file + ops doc scaffold. No behavior change.

- [X] T001 Add empty test file `test/vpsFeed.test.js` with a single passing placeholder `node:test` block (real tests land in Phase 3).
- [X] T002 [P] Create `scraper/DEPLOY.md` scaffold with section headings for the caddy-based deploy (Prerequisites, Clone repo + first run, Generate per-friend Basic Auth credentials, Add the caddy site, Verify end-to-end, Cron, Adding a friend, Revoking a friend, Standby host, Troubleshooting, Cost / capacity). Body filled by T037.

---

## Phase 2: Foundational

**Purpose**: additive metadata + manifest extension that gates US3 and US5. Lays the credentialLabel pipe end-to-end without flipping any default — both providers keep working.

**⚠️ CRITICAL**: No US work begins until Phase 2 complete.

- [X] T003 Add `credentialLabel`, `credentialPlaceholder`, `credentialHint` static exports to `src/api/providers/theOddsApi.js` per research.md R3 (label: "The Odds API key"; placeholder: an example key shape; hint references the-odds-api.com).
- [X] T004 [P] Add `credentialLabel`, `credentialPlaceholder`, `credentialHint` static exports to `src/api/providers/vpsFeed.js` per research.md R3 (label: "Feed URL"; placeholder: `https://you:pw@promo-tool.195-201-99-206.sslip.io`; hint references the feed-URL onboarding flow).
- [X] T005 Re-export `credentialLabel`, `credentialPlaceholder`, `credentialHint` from `src/api/provider.js` (additive — does not break existing 5 exports).
- [X] T006 Extend `host_permissions` in `manifest.json` to include `https://*.195-201-99-206.sslip.io/*` alongside the existing `https://api.the-odds-api.com/*` per FR-003 + research.md R8. Substitute the real domain at commit time.

**Checkpoint**: extension still uses `theOddsApi` by default; both providers expose `credentialLabel`; manifest accepts the future feed host.

---

## Phase 3: User Story 3 — Default provider is vpsFeed (Priority: P1)

**Goal**: `src/api/provider.js` flips to `vpsFeed`. URL with embedded user:pass is normalized and the Authorization header is injected on every request. The Odds API stays comment-toggle reachable.

**Independent Test**: open `src/api/provider.js`, confirm vpsFeed is active. Network panel shows requests to the feed host, none to api.the-odds-api.com. Smoke E in `quickstart.md`.

### Tests for User Story 3

- [X] T007 [P] [US3] Test `normalizeFeedUrl()` happy path in `test/vpsFeed.test.js` — `https://u:p@host/path/` returns `{baseUrl: 'https://host/path', authHeader: 'Basic <base64(u:p)>'}` per research.md R4.
- [X] T008 [P] [US3] Test `normalizeFeedUrl()` auto-prefixes `https://` when no protocol present (FR-002) and rejects `http://` with a thrown error (FR-011).
- [X] T009 [P] [US3] Test `normalizeFeedUrl()` percent-decodes userinfo (`p%40ss` → password `p@ss`) before base64-encoding per research.md R4 step 5.
- [X] T010 [P] [US3] Test `normalizeFeedUrl()` strips trailing slashes and trims surrounding whitespace per FR-002.
- [X] T011 [P] [US3] Test `normalizeFeedUrl()` returns `authHeader: null` when no userinfo is present per data-model.md §"FeedCredential".
- [X] T012 [P] [US3] Test `normalizeFeedUrl()` throws `'No feed URL set'` on empty/whitespace input and `'Feed URL must start with https://'` on `http://` input (FR-011).

### Implementation for User Story 3

- [X] T013 [US3] Implement pure `normalizeFeedUrl(input) → {baseUrl, authHeader}` in `src/api/providers/vpsFeed.js` per research.md R4. Use built-in WHATWG `URL`; no regex parsing of userinfo. `authHeader` MUST use `btoa(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password))` (for Node-test compatibility, see T021 for a fallback).
- [X] T014 [US3] Wire `normalizeFeedUrl()` into `vpsFeed.fetchSports()` and `vpsFeed.fetchOdds()` in `src/api/providers/vpsFeed.js`. Pass `{ headers: { Authorization: authHeader } }` into `fetch()` only when `authHeader` is non-null. Never log the header value.
- [X] T015 [US3] Wire `normalizeFeedUrl()` into `vpsFeed.saveApiKey(value)` in `src/api/providers/vpsFeed.js` so the stored value is the normalized URL (auto-prefixed `https://`, trailing slashes stripped, userinfo preserved as part of the URL string).
- [X] T016 [US3] Map 401 + 403 responses inside `vpsFeed.fetchOdds`/`fetchSports` to a thrown `Error` whose `.message` is `'Feed credentials rejected — check the URL you pasted in Settings.'` per FR-013.
- [X] T017 [US3] Flip the active import in `src/api/provider.js`: comment the `theOddsApi` import + `const provider = theOddsApi`; uncomment `vpsFeed` per research.md R7. Leave both lines visible — only their active/commented state changes.
- [X] T018 [US3] In `popup/popup.js`, replace the generic "Couldn't reach the odds source" error string with one that uses the thrown `Error.message` verbatim when it is the credentials-rejected message (preserve that exact text per FR-013). Existing input values MUST NOT be wiped on error.

**Checkpoint**: Smoke E + Smoke G in quickstart.md pass. The Odds API still reachable via single-line comment-toggle (R7).

---

## Phase 4: User Story 2 — Scraper runs unattended on a VPS (Priority: P1)

**Goal**: cron fires every 10 minutes on the VPS, writes static JSON behind caddy HTTPS + Basic Auth.

**Independent Test**: from a separate machine, `curl https://promo-tool.195-201-99-206.sslip.io/sports.json` returns 401 without creds and 200 with creds. Cron log shows runs within the last 11 minutes. Smokes A–D in `quickstart.md`.

**Note**: this phase is run-on-VPS work that can proceed in parallel with Phase 3's client work.

- [ ] T019 [US2] Verify the existing VPS at `195.201.99.206` per research.md R1 — confirm caddy is running (`systemctl status caddy`) and `node --version` ≥ 20. No new provisioning needed; the host already serves `lisearch.195-201-99-206.sslip.io` and `portfolio.195-201-99-206.sslip.io`.
- [ ] T020 [US2] (skipped — sslip.io wildcard-resolves `promo-tool.195-201-99-206.sslip.io` to the host IP automatically; no DNS config required).
- [ ] T021 [US2] If Node ≥ 20 is not already on the VPS, install it: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs`. (caddy and any other deps are already present.)
- [ ] T022 [US2] Clone the repo to `/opt/promo-tool` on the VPS: `git clone <repo> /opt/promo-tool`. Run a dry-run from the VPS to confirm Pinnacle + Action Network are reachable from the host's IP: `cd /opt/promo-tool/scraper && node run.js --dry-run`.
- [ ] T023 [US2] Create the output directory readable by the `caddy` user: `sudo mkdir -p /var/www/promo-tool && sudo chown -R $USER:caddy /var/www/promo-tool && sudo chmod -R 750 /var/www/promo-tool`. Run the scraper once for real: `OUT_DIR=/var/www/promo-tool node /opt/promo-tool/scraper/run.js`. Verify `/var/www/promo-tool/sports.json` and `/var/www/promo-tool/odds/*.json` exist.
- [ ] T024 [US2] (skipped — caddy auto-provisions Let's Encrypt TLS on first request per research.md R6; no certbot needed).
- [ ] T025 [US2] Append the `promo-tool.195-201-99-206.sslip.io` site block to `/etc/caddy/Caddyfile` per scraper/DEPLOY.md (`root * /var/www/promo-tool`, `file_server`, `basic_auth { ... }`, JSON content-type + Cache-Control header matchers). Run `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
- [ ] T026 [US2] Generate the maintainer's bcrypt hash with `caddy hash-password --plaintext '<password>'`, paste it into the `basic_auth` block inside the new site stanza in `/etc/caddy/Caddyfile`, `sudo systemctl reload caddy`. Verify from a separate machine: `curl -u maintainer:<pw> https://promo-tool.195-201-99-206.sslip.io/sports.json` returns 200; without `-u` returns 401.
- [ ] T027 [US2] Install the cron entry per research.md R1 + `scraper/README.md`: `*/10 * * * * cd /opt/promo-tool/scraper && OUT_DIR=/var/www/promo-tool node run.js >> /var/log/promo-scraper.log 2>&1`. Create the log file with maintainer ownership: `sudo touch /var/log/promo-scraper.log && sudo chown $USER:$USER /var/log/promo-scraper.log`.
- [ ] T028 [US2] Wait 11 minutes; run quickstart.md Smoke B. Verify cron log has a "done in Xs" line and `mtime` on every `/var/www/promo-tool/odds/*.json` is within the last 11 minutes.

**Checkpoint**: smokes A–D in quickstart.md pass. Feed reachable over HTTPS + Basic Auth from any client.

---

## Phase 5: User Story 1 — Friend installs without an API key (Priority: P1)

**Goal**: end-to-end friend onboarding in ≤90s (SC-001, relaxed per Clarifications 2026-05-13).

**Independent Test**: fresh Chrome profile, load unpacked, paste feed URL with embedded creds, see a Best Play card. Smoke F in `quickstart.md`.

**Depends on**: Phase 3 (US3 client work) AND Phase 4 (US2 ops work) both complete.

- [ ] T029 [US1] Provision a credential for one real test user (not the maintainer): generate a hash with `caddy hash-password --plaintext '<password>'`, append `tester01 $2a$14$...` to the `basic_auth` block in `/etc/caddy/Caddyfile`, `sudo systemctl reload caddy`. Hand them the URL `https://tester01:<password>@promo-tool.195-201-99-206.sslip.io` via DM.
- [ ] T030 [US1] Execute quickstart.md Smoke F with the test user. Time from "Settings opened" to "first Best Play card visible". Record the elapsed seconds in a session note under `specs/005-vps-feed-cutover/` (e.g., `smoke-F-2026-05-13.md`) AND assert pass/fail against the SC-001 budget: `elapsed_seconds ≤ 90`. If the recorded time exceeds 90 s, this spec fails its headline metric — diagnose and re-run before merging.
- [ ] T031 [US1] Execute quickstart.md Smoke H (missing-protocol auto-prefix) and Smoke G (credentials rejection) with the same test user. Both MUST pass per FR-002 + FR-013.

**Checkpoint**: SC-001 met (≤90s) for at least one non-maintainer friend.

---

## Phase 6: User Story 4 — Sport coverage extended (Priority: P2)

**Goal**: `scraper/sports.js` covers EPL, UCL, ATP+WTA, MMA in addition to the four existing sports.

**Independent Test**: after a cron run, every key in `sports.json` has a corresponding `odds/<key>.json`. Smoke I in `quickstart.md`.

- [X] T032 [US4] Extend `scraper/sports.js` with four new entries — `soccer_epl`, `soccer_uefa_champs_league`, `tennis_atp_wta`, `mma_mixed_martial_arts` — per research.md R5 table. Use the Pinnacle league IDs and Action Network slugs documented there. Verify each leagueId via the verification curl noted in R5 before committing.
- [ ] T033 [US4] Pull the latest from the VPS: `cd /opt/promo-tool && git pull`. Run the scraper once manually: `OUT_DIR=/var/www/promo-tool node scraper/run.js`. Confirm `sports.json` lists eight keys and each `odds/<key>.json` is a valid JSON array (may be `[]` for off-season sports).

**Checkpoint**: Smoke I passes. Eight sport keys in `sports.json`.

---

## Phase 7: User Story 5 — Settings UI speaks "feed URL" (Priority: P2)

**Goal**: Settings field label, placeholder, and hint are sourced from the active provider's `credentialLabel`/`credentialPlaceholder`/`credentialHint`. Swapping providers swaps the copy.

**Independent Test**: open Settings → field reads "Feed URL", placeholder shows a feed URL example, hint does not mention the-odds-api.com. After a comment-toggle swap to theOddsApi (R7) + reload, copy reverts to "The Odds API key".

- [X] T034 [US5] In `popup/popup.js`, after the existing `getApiKey().then(...)` block, import `credentialLabel`, `credentialPlaceholder`, `credentialHint` from `../src/api/provider.js` and patch the Settings DOM at init: set the `<label for="apiKeyInput">` text content, the `#apiKeyInput` placeholder, and the adjacent `.hint` span text content. Per research.md R3.
- [X] T035 [US5] Remove the now-stale hardcoded copy in `popup/popup.html` (`<label for="apiKeyInput">The Odds API key</label>` and the `.hint` content that names the-odds-api.com). Replace with empty placeholders the JS fills at init.
- [ ] T036 [US5] Verify provider-swap parity: temporarily revert the `provider.js` comment-toggle to point at `theOddsApi`, reload the extension, confirm Settings copy reverts to "The Odds API key" automatically. Then restore the vpsFeed toggle. Record the result in a session note.

**Checkpoint**: US5 acceptance scenarios 1 + 2 both pass without HTML edits.

---

## Phase 8: Polish & Operational Soak

**Purpose**: doc, regression, soak, final constitution check.

- [X] T037 Write `scraper/DEPLOY.md` body — fill the section headings using the commands from quickstart.md ops smokes A–D and research.md R2 + R6. Include: VPS prerequisites check, full caddy site block (production-ready), `caddy hash-password` workflow, basic_auth add/remove/list flow, cron line, log location, troubleshooting (401 chain, TLS expiry, disk-full failure mode).
- [X] T038 Update `scraper/README.md` to link to `DEPLOY.md` and clarify that the feed now requires HTTP Basic Auth (per FR-013). Keep the dev `--dry-run` instructions intact.
- [ ] T039 Run quickstart.md "Regression check — spec 001 still works" — execute all seven smoke tests in `specs/001-best-play-card/quickstart.md` against the vpsFeed-backed extension. Record pass/fail in a session note. Any failure blocks merge.
- [X] T040 Run `node --test test/calc.test.js test/recommend.test.js test/betAndGet.test.js test/betSlip.test.js test/vpsFeed.test.js` and confirm all pass. Update the `test` script in `package.json` to include `test/vpsFeed.test.js`.
- [ ] T041 24-hour soak per quickstart.md DoD — leave cron running for 24h, then tail `/var/log/promo-scraper.log`: assert ≥99% of expected fires logged "done" (SC-005); compute P95 of `last_update` ages across the latest `odds/*.json` snapshot (SC-002 ≤ 12 min).
- [ ] T041a SC-003 book-parity check during the soak — for each in-season sport in `sports.json`, count distinct cohort-book bookmaker `title`s present in the latest `odds/<key>.json` for DraftKings, FanDuel, BetMGM, Caesars. Compare against the same event keys pulled from The-Odds-API for that sport (one manual `fetchOdds` call with the maintainer's API key). Assert vpsFeed cohort-book set ⊇ The-Odds-API cohort-book set per event. Record gaps (if any) in a session note; an unjustified deficit blocks merge.
- [ ] T042 Constitution post-implementation re-check: confirm `vpsFeed.js` does not log credentials anywhere; confirm no new `chrome.storage.local` keys were added; confirm zero new npm runtime deps on either client or scraper; confirm `host_permissions` did not widen beyond the maintainer's domain + The-Odds-API fallback (R8). Record the result in a session note.
- [X] T043 [P] Update `CLAUDE.md` `<!-- SPECKIT START -->` block once spec 005 ships — point active plan/spec/research/data-model/quickstart links forward (or leave on 005 if 005 is the most recently shipped spec). No-op if no path drift.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup): no deps — start immediately
- Phase 2 (Foundational): depends on Phase 1 — **blocks all user stories**
- Phase 3 (US3, P1, client): depends on Phase 2
- Phase 4 (US2, P1, ops): depends on Phase 2 (only T006's manifest line) — can run in parallel with Phase 3 by a separate operator
- Phase 5 (US1, P1, smoke): depends on **both** Phase 3 and Phase 4
- Phase 6 (US4, P2): depends on Phase 4 (the VPS has to exist to run the extended scraper)
- Phase 7 (US5, P2): depends on Phase 2
- Phase 8 (Polish): depends on Phases 3 + 4 + 5 + 7 minimum; T039 (regression) depends on US5 done so the right copy is showing

### Within Each User Story

- US3: tests T007–T012 written first; assert they fail against an empty `normalizeFeedUrl`; then implementation T013–T018.
- US2: ops tasks T019 → T028 are strictly sequential (verify host + Node before clone, clone before first scraper run, first run before caddy site block, site block before basic_auth hashes, then cron).
- US1: depends on real human time (≤90s budget) — cannot be automated.
- US4: T032 then T033 sequentially.
- US5: T034 → T035 → T036 sequentially (DOM patch before HTML removal before parity verify).

### Parallel Opportunities

- **Phases 3 + 4 in parallel**: client work and ops work touch disjoint paths. If the maintainer has help, split them.
- T002 is `[P]` relative to T001.
- T004 is `[P]` relative to T003 (different files).
- All US3 tests (T007–T012) are `[P]` — same file, independent test blocks.
- Within Phase 4 ops, **no parallel opportunities** — sequential setup.
- T043 in Polish is `[P]` relative to T037–T042.

### Coordinated file edits

- `src/api/providers/vpsFeed.js` is touched by T004, T013, T014, T015, T016 — sequence as listed.
- `src/api/provider.js` is touched by T005, T017 — sequence as listed.
- `popup/popup.js` is touched by T018, T034 — sequence as listed.
- `popup/popup.html` is touched by T035 only.
- `manifest.json` is touched by T006 only.
- `scraper/sports.js` is touched by T032 only.
- `scraper/DEPLOY.md` is touched by T002 (scaffold) and T037 (body).
- `scraper/README.md` is touched by T038 only.

---

## Parallel Example: User Story 3 tests

```bash
# Write US3 tests in parallel — same file, independent test blocks:
Task: "happy-path normalize in test/vpsFeed.test.js"           # T007
Task: "auto-https + http reject in test/vpsFeed.test.js"       # T008
Task: "percent-decode userinfo in test/vpsFeed.test.js"        # T009
Task: "strip slashes + trim in test/vpsFeed.test.js"           # T010
Task: "no-userinfo → authHeader null in test/vpsFeed.test.js"  # T011
Task: "empty input throws in test/vpsFeed.test.js"             # T012
```

---

## Implementation Strategy

### MVP (US1 + US2 + US3 — all P1)

This spec's MVP is not "one user story" — it's the cutover itself, which needs all three P1 stories to land together. Order them as:

1. Phase 1 (Setup) — 30 min
2. Phase 2 (Foundational) — 1 hour (credentialLabel groundwork + manifest)
3. Phase 3 (US3 client) — 2–3 hours (the URL parser + tests are most of it)
4. Phase 4 (US2 ops) — 2–3 hours, run on the VPS in parallel
5. Phase 5 (US1 smoke) — 30 minutes with a real test friend
6. **STOP and VALIDATE** — SC-001 timing + Smoke F + Smoke G + Smoke H all pass

At this point, the cutover is live. Spec 001 still works (Phase 8 T039 regression).

### Incremental P2

7. Phase 6 (US4 sport coverage) — 1 hour; verify with one cron cycle
8. Phase 7 (US5 copy) — 1 hour; verify by provider toggle
9. Phase 8 (polish + soak) — 30 min active work + 24h passive soak

### Operator vs developer split

If splitting work between a developer and an ops operator:

- Developer: Phases 1, 2 (client side), 3, 7, polish (T037, T038, T040, T043)
- Operator: Phase 2 (T006 manifest), Phase 4 (entire), Phase 6 (T033), polish (T041, T042)

Phase 5 (US1) is run jointly with a real friend.

---

## Notes

- New code on the client stays pure where it makes sense (`normalizeFeedUrl` is pure, testable under `node --test` with a `btoa` shim — the production path runs in Chromium where `btoa` is global).
- No new runtime npm deps anywhere (Constitution §III).
- Manifest expansion limited to `https://*.195-201-99-206.sslip.io/*` + retained `https://api.the-odds-api.com/*` for the maintainer's fallback (Constitution Technical Constraints §Permissions allows this).
- `chrome.storage.local` keys are unchanged. Only the *semantics* of `oddsApiKey` change (now a feed URL with possible userinfo).
- DEPLOY.md is the only new doc; no new feature-level docs.
- Each phase ends at a checkpoint where the system runs end-to-end at that maturity level.
