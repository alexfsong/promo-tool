# Feature Specification: vpsFeed Cutover (default provider)

**Feature Branch**: `005-vps-feed-cutover`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User goal: "The Odds API free tier gets throttled too fast. The scraper is mostly built. Ship the cutover: deploy the scraper to a VPS, flip the client default to vpsFeed, kill the per-user API key cost. Keep theOddsApi reachable as a fallback for the maintainer."

## Context

Assumes [Brownfield Context](../000-brownfield-context/spec.md) and [Constitution](../../.specify/memory/constitution.md). The scraper at `scraper/` (Pinnacle + Action Network sources, normalized to The-Odds-API event shape) and the `src/api/providers/vpsFeed.js` provider are already written. This spec is the ops cutover: stand up the host, run cron, point the client at it, expand sport coverage, and document the install path for the friend cohort.

Specs 001–004 are agnostic to which provider is wired — the abstraction (Constitution §II) guarantees the swap is single-file. This spec changes that single import and the friend-onboarding story.

Out of scope (explicit cuts):
- Content-script scraping (Path B) — owned by a future spec 006.
- Multi-provider hot-swap UI — single hardcoded default; advanced users can edit `provider.js`.
- Telemetry, usage logs, request counting on the VPS — Constitution §V forbids them.
- Friend-visible failover during extended VPS outage (per Clarifications 2026-05-13). No in-extension provider toggle, no hot-standby host, no stale-cache banner. Recovery is by DM during the outage and a maintainer-side subdomain reroute (enabled by the Q2 wildcard `host_permissions`) once a replacement host is online.

## Clarifications

### Session 2026-05-13

- Q: Who operates the VPS that runs the scraper? → A: Maintainer operates one shared VPS for the whole friend cohort; all friends share a single feed URL.
- Q: How should `manifest.json` `host_permissions` scope the feed? → A: Wildcard the maintainer's own domain (e.g., `https://*.your-domain.tld/*`). Lets the host be swapped without forcing a friend re-install; keeps abuse surface within the maintainer's domain.
- Q: What's the access-control model for the feed? → A: Per-friend HTTP Basic Auth via caddy `basic_auth` (one stanza per friend, bcrypt hashes generated with `caddy hash-password`). Each friend gets a unique username + password, distributed via DM at install time. Credentials are revocable per friend if a device is lost or trust changes. Originally specified as nginx `htpasswd`; revised to caddy on 2026-05-13 when it was confirmed the maintainer's existing VPS already runs caddy.
- Q: When the user pastes a feed URL without a protocol, what happens? → A: Auto-prefix `https://` silently and save the normalized URL. FR-011's HTTPS-only invariant is preserved (the prefix is always `https://`, never `http://`).
- Q: What happens to the friend cohort during an extended VPS outage? → A: Accepted as-is. Friends are bricked until the maintainer restores the feed. Recovery is by DM. No in-extension fallback toggle, no hot-standby host, no stale-cache banner in this spec. The Q2 wildcard subdomain already lets the maintainer reroute to a backup host without forcing re-installs once a replacement is up.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Friend installs the extension without an API key (Priority: P1)

A non-technical friend receives a Chrome-extensions Load-Unpacked link plus a single feed URL. They install, paste the URL into Settings, and the scanner / Best Play card works immediately. No The-Odds-API signup, no email, no rate-limit anxiety.

**Why this priority**: This is the load-bearing change. The Odds API free tier (500 req/mo) failed in practice; per-user signup is friction the friend cohort won't pay. Constitution §III ("install = load-unpacked, for sharing with non-technical friends") is undermined every minute the default remains The-Odds-API.

**Independent Test**: Take a fresh Chrome profile. Load the unpacked extension. Paste only the feed URL into Settings. Run a scan for NFL. See ≥1 event with ≥2 books. Total elapsed time from "Settings opened" to "first card visible" ≤ 60 seconds.

**Acceptance Scenarios**:

1. **Given** a fresh extension install with no prior settings,
   **When** the user pastes a feed URL into the single Settings field,
   **Then** the scanner returns events on the next "Scan" tap without any The-Odds-API prompt or signup hint.
2. **Given** the user pastes a feed URL with a trailing slash, scheme variations, or extra whitespace,
   **When** the URL is saved,
   **Then** the provider normalizes it (strips trailing slashes, trims) and subsequent requests succeed.
3. **Given** the feed URL is wrong or the host is unreachable,
   **When** the user runs a scan,
   **Then** the UI shows a one-sentence error naming the feed ("Couldn't reach the odds feed — check the URL in Settings"), not a generic network error.

---

### User Story 2 — Scraper runs unattended on a VPS (Priority: P1)

A cron job on the maintainer's existing VPS at `195.201.99.206` executes `scraper/run.js` every 10 minutes. The resulting JSON files are served as static assets over HTTPS by caddy (already running on the host). The job survives transient source failures (Pinnacle 5xx, Action Network 4xx for a single sport) and logs them without crashing the run.

**Why this priority**: Without a running scraper the feed is empty and US1 doesn't ship. This is the irreducible ops scope.

**Independent Test**: SSH to the VPS. Inspect `cron` log: most recent run within 11 minutes. `curl https://your.host/promo-tool/sports.json` returns a valid JSON array. `curl https://your.host/promo-tool/odds/americanfootball_nfl.json` returns a non-empty event array during NFL season (or an empty array off-season — still valid JSON).

**Acceptance Scenarios**:

1. **Given** the host is up and the cron entry is installed,
   **When** ten minutes elapse,
   **Then** `sports.json` and `odds/*.json` files have an mtime within the last 11 minutes.
2. **Given** one source (e.g., Pinnacle) returns 5xx for a single run,
   **When** the cron fires,
   **Then** the other source's events are still written to `odds/*.json`; the failed source is logged and the run exits 0.
3. **Given** both sources fail for a sport,
   **When** the cron fires,
   **Then** that sport's `odds/<key>.json` is written as `[]` (empty array, not deleted, not stale), and the client renders an empty-state for that sport.

---

### User Story 3 — Default provider is vpsFeed (Priority: P1)

`src/api/provider.js` imports `vpsFeed` as the live provider. `theOddsApi` remains in the repo as a fallback the maintainer can swap to by editing one line. No user-facing toggle.

**Why this priority**: US1 cannot ship until this is done. It is a one-line code change, but it is also the load-bearing line.

**Independent Test**: Open `src/api/provider.js`. Confirm the active `import * as <name>` is `vpsFeed`. Confirm `theOddsApi` import is present but commented or unused. Run the extension; the network panel shows requests to the feed host, never to `api.the-odds-api.com`.

**Acceptance Scenarios**:

1. **Given** the codebase post-cutover,
   **When** a maintainer reads `src/api/provider.js`,
   **Then** the active provider line points to `vpsFeed` and a comment names `theOddsApi` as the fallback.
2. **Given** a developer wants to roll back to The-Odds-API temporarily,
   **When** they edit the one import line and reload the extension,
   **Then** the client switches providers with no other code change required (Constitution §II).
3. **Given** a friend installs the extension,
   **When** they open Settings,
   **Then** the input field's hint reads "Feed URL" (not "API key"), and the help link points to a short feed-URL doc — not to the-odds-api.com.

---

### User Story 4 — Sport coverage extended to friend-cohort baseline (Priority: P2)

The scraper's `sports.js` registry covers the four current sports (NFL, NBA, MLB, NHL) plus the sports the friend cohort uses most: soccer (EPL + Champions League at minimum), tennis (ATP + WTA combined feed), and MMA (UFC). Sports the cohort never bets do not block this spec.

**Why this priority**: Without expansion, the cutover is a regression for any user who scanned soccer/tennis under The-Odds-API. With it, vpsFeed is a strict superset for the friend cohort.

**Independent Test**: After expansion, request `odds/soccer_epl.json` (or whichever soccer key is chosen). It returns a non-empty event array during the EPL season. The list of `key`s in `sports.json` matches what the side-panel sport dropdown expects.

**Acceptance Scenarios**:

1. **Given** the expanded sports registry,
   **When** a cron run completes,
   **Then** at minimum NFL, NBA, MLB, NHL, EPL, ATP+WTA, UFC keys have `odds/*.json` files written.
2. **Given** a sport is in `sports.js` but currently off-season,
   **When** the cron runs,
   **Then** that sport's `odds/<key>.json` is `[]` and the side-panel handles the empty state gracefully (existing behavior).
3. **Given** a Pinnacle `leagueId` rotates or an Action Network slug changes,
   **When** the cron runs,
   **Then** the affected sport degrades to the other source's data; the broken identifier is logged once per run (not per request).

---

### User Story 5 — Settings UI speaks "feed URL", not "API key" (Priority: P2)

The single credentials field in Settings re-labels for the feed model. Hint text, placeholder, and the "where do I get one" link all reflect that the user pastes a feed URL, not signs up for a third-party service. Maintainers who want The-Odds-API can still paste an API key into the same field — the provider abstraction reuses the storage slot (`oddsApiKey`).

**Why this priority**: Cosmetic but high-leverage for SC-001. A friend who sees "The Odds API key" with a signup link will assume signup is required even when it isn't.

**Independent Test**: Open Settings on a fresh install. Field label reads "Feed URL" (or equivalent). Placeholder shows an example URL shape. Help text does not name "the-odds-api.com".

**Acceptance Scenarios**:

1. **Given** vpsFeed is the active provider,
   **When** the user opens Settings,
   **Then** field label, placeholder, and hint all reference "feed URL" not "API key".
2. **Given** the maintainer swaps back to `theOddsApi`,
   **When** the extension is rebuilt and Settings is opened,
   **Then** field copy reverts to "API key" automatically — copy is sourced from `provider.name` (or a per-provider copy block), not hardcoded in HTML.

---

### Edge Cases

- **Feed URL unreachable on every scan**: Surface one short error sentence with the feed URL referenced. Do not retry in a tight loop. Do not fall back to The-Odds-API silently (that would defeat the cost-control goal and confuse maintainers).
- **Feed URL pasted without credentials**: A friend pastes the bare host URL (no `<user>:<pass>@` userinfo) into Settings. The first request fails with 401. The extension surfaces "Feed credentials rejected — check the URL you pasted in Settings." No retry, no fallback.
- **Credentials in URL contain reserved characters**: Passwords with `@`, `:`, or `/` MUST be percent-encoded by the maintainer when distributing them (e.g., `p@ss` → `p%40ss`). The provider's URL parser MUST handle percent-decoded credentials correctly.
- **Friend leaks credentials**: Maintainer deletes that friend's line inside the `basic_auth { ... }` block in `/etc/caddy/Caddyfile` and reloads caddy. That friend re-onboards with a new credential; other friends are unaffected.
- **Feed serves stale data (cron stopped)**: Out of scope here; spec 004's staleness badge surfaces this. This spec MUST set `last_update` in the per-bookmaker payload accurately (already does) so spec 004 can read it.
- **VPS disk full**: Cron writes will fail. The previous run's JSON remains in place — clients see stale data, the staleness badge fires (spec 004). Operator deals with disk. Out of scope here.
- **CORS**: The feed is consumed by the extension via `fetch`; MV3 service worker bypasses CORS via `host_permissions`. The manifest MUST add the chosen feed host to `host_permissions` (the only manifest change in this spec).
- **TLS certificate expiry**: caddy auto-provisions and auto-renews Let's Encrypt certs. Out-of-scope failure mode if auto-renew misfires (caddy retries on every reload).
- **Both sources start returning structurally different data (rebrand, API rotation)**: Source modules already log per-source errors; the merger is robust to a single source dropping. Hand-fixable; expected once or twice per year.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST default to `vpsFeed` as the provider in `src/api/provider.js`. The active import line MUST resolve to `vpsFeed`. `theOddsApi` MUST remain importable for fallback by single-line edit.
- **FR-002**: System MUST treat the stored `oddsApiKey` value as a feed base URL that MAY embed HTTP Basic Auth credentials in the form `https://<user>:<pass>@<host>/<path>` when `vpsFeed` is active (per Clarifications 2026-05-13). On save, the provider MUST normalize the URL: trim whitespace, strip trailing slashes, and — if no protocol prefix is present — auto-prefix `https://` (never `http://`, per FR-011). The `vpsFeed` provider MUST extract embedded credentials and send them via the `Authorization: Basic <base64(user:pass)>` HTTP header on every request (do not rely on `fetch()` forwarding the URL's userinfo component — modern browsers strip it). The provider MUST NOT log or surface the raw credentials anywhere outside the storage slot.
- **FR-003**: System MUST scope `host_permissions` in `manifest.json` to a wildcard under the maintainer's own domain (e.g., `https://*.your-domain.tld/*`) per Clarifications 2026-05-13. This lets the feed host be swapped (subdomain change, region move) without forcing every friend to re-install the unpacked extension. The existing `api.the-odds-api.com` permission MAY be retained for the maintainer's fallback path but is no longer load-bearing. Broader scopes (`https://*/*`) are explicitly rejected to keep the abuse surface narrow.
- **FR-004**: System MUST surface feed errors with a one-sentence, feed-URL-aware error message (not a generic network error). The user MUST be able to recover by editing the URL in Settings.
- **FR-005**: System MUST keep `theOddsApi` provider module functional and unit-testable. Removing it is a separate spec.
- **FR-006**: System MUST relabel the Settings credential field copy based on the active provider's identity, so that swapping providers swaps the user-facing label without HTML changes. Acceptable: a per-provider copy block exported from each provider module (e.g., `provider.credentialLabel = 'Feed URL'`).
- **FR-007**: Scraper deployment MUST use a cron schedule that runs at least every 10 minutes. Each run MUST write `sports.json` and `odds/<key>.json` for every sport in `sports.js`, including empty `[]` for sports whose sources all failed or are off-season.
- **FR-008**: Scraper output MUST remain byte-identical in shape to the The-Odds-API event response (already enforced by `scraper/normalize.js`). Any change to the shape MUST flow through `scraper/normalize.js` so both providers stay swappable.
- **FR-009**: Scraper `sports.js` MUST be extended to include, at minimum: NFL, NBA, MLB, NHL, EPL, Champions League, ATP+WTA combined tennis feed (provider permitting), and UFC. The exact The-Odds-API-compatible `key`s MUST be used so spec 001's dropdowns and storage keys work unchanged.
- **FR-010**: Scraper MUST log each source failure with sport key + source name and exit zero unless every sport across every source failed in a single run. A single-sport, single-source failure MUST NOT prevent other sports from being written.
- **FR-011**: Feed host MUST serve over HTTPS. No HTTP-only fallback. The extension MUST refuse `http://` feed URLs in Settings (surface a one-sentence error: "Feed URL must start with https://"). Basic Auth credentials MUST only be sent over HTTPS — refusal of `http://` is what makes credentials-in-URL acceptable.
- **FR-013**: The feed host MUST enforce HTTP Basic Auth on every odds endpoint (per Clarifications 2026-05-13). The web server (caddy on the maintainer's existing VPS at 195.201.99.206) MUST keep per-friend bcrypt credentials so individual lines can be revoked without disrupting other friends — implemented via caddy's `basic_auth` directive (one stanza per friend, hashes generated with `caddy hash-password`). On 401, the extension MUST surface a one-sentence error referencing Settings ("Feed credentials rejected — check the URL you pasted in Settings"). On 403, the extension MUST treat it the same as 401 (do not retry without user intervention).
- **FR-012**: Cutover MUST NOT remove any storage keys used by spec 001 (`promoType`, `advancedMode`, `myBooks`, `selectedBooks`, `oddsApiKey`). FR-001 only changes what the provider does with the existing `oddsApiKey` value.

### Key Entities

- **Feed manifest** (`sports.json`): Array of `{ key, title, group, active }`. Identical to The-Odds-API `/sports` response shape. Owned by scraper `sports.js`.
- **Per-sport feed** (`odds/<key>.json`): Array of events in The-Odds-API event shape. Owned by `scraper/run.js` writes; consumed by `vpsFeed.fetchOdds`.
- **Source registry**: Per-sport identifiers for Pinnacle (`sportId`, `leagueIds[]`) and Action Network (`path`). Lives in `scraper/sports.js`.
- **Bookmaker entry**: `{ key, title, last_update, markets }` per the existing normalize.js contract. `title` is the user-facing book name; `last_update` is consumed by spec 004's odds-age badge.
- **Provider credential**: `oddsApiKey` storage key, reused for the feed base URL. Naming preserved to avoid migration logic in `chrome.storage.local`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A friend with no prior tool exposure goes from "extension installed" to "first Best Play card visible" in **under 90 seconds** (relaxed from 60s after the Clarifications 2026-05-13 decision to require per-friend Basic Auth — the credentials-in-URL paste step adds ~15–20s of friction over the unauthenticated path). No The-Odds-API signup or email exchange is required.
- **SC-002**: Feed freshness: P95 of per-sport `last_update` ages is **≤ 12 minutes** (10-min cron + buffer), measured across one continuous 24-hour window.
- **SC-003**: Provider parity: for any single event present in both feeds during the verification window, the bookmaker set offered by the vpsFeed is **≥ the bookmaker set offered by The-Odds-API** for the friend cohort's used books (DraftKings, FanDuel, BetMGM, Caesars).
- **SC-004**: Operating cost: **≤ $5/month** for VPS + bandwidth at 5 friend-cohort users hitting it every ~5 minutes during active sessions.
- **SC-005**: One-month operational stability: cron runs **≥ 99%** of scheduled fires (allowing for VPS reboots and source 5xx). Measured from cron log.
- **SC-006**: Zero new chrome-extension permissions beyond `host_permissions` for the chosen feed host. `storage` and `sidePanel` remain the only `permissions`.

## Assumptions

- The maintainer operates a single VPS for the friend cohort (per Clarifications 2026-05-13). Friends never provision or manage hosting. Provider: Hetzner, DigitalOcean, Fly.io basic tier, or similar at ≤$5/mo. Bandwidth requirements are trivial — the feed is JSON, sub-MB per sport, served to ≤10 readers.
- Pinnacle's guest Arcadia endpoint (`guest.api.arcadia.pinnacle.com`) and Action Network's public scoreboard remain accessible without auth. Both have been stable for 12+ months. If either rotates, the source module is patched in a follow-up — the other source covers the gap.
- Friend cohort uses Chromium-based browsers exclusively. Manifest V3, side panel API.
- caddy (already installed on the host) handles static serving; no application server runs on the VPS. `node scraper/run.js` is the only persistent workload (and it isn't persistent — cron forks a Node process every 10 minutes).
- The existing `scraper/normalize.js` contract holds. If a new source is added later (spec 006 content-script), it conforms to `SourceEvent` and merges via `mergeEvents`.
- Spec 004 (odds hygiene) ships after this and consumes `last_update` from the feed payloads. This spec sets the field; spec 004 surfaces it.
- The friend cohort tolerates **occasional** per-source outages (one provider 5xx, half a sport missing for 10 min). The two-source design absorbs this without UI changes.
- No legal review needed for scraping Pinnacle's guest API or Action Network's public scoreboard — both are publicly documented public endpoints with no ToS forbidding read access for personal use. This is consistent with how other public-data dashboards consume them. If a takedown notice arrives, the source is removed; the other source covers.

## Implementation Order (informational, not normative)

1. Reuse the existing VPS at `195.201.99.206` (caddy already running). Confirm `node` ≥ 20 is present.
2. Clone repo to `/opt/promo-tool`, install cron entry.
3. First manual `node scraper/run.js --dry-run` to confirm sources are reachable from the host's IP.
4. First non-dry run; verify JSON files are written to `/var/www/promo-tool/`.
5. Append the `promo-tool.195-201-99-206.sslip.io` site block to `/etc/caddy/Caddyfile` with `basic_auth`; reload caddy.
6. Extend `scraper/sports.js` (FR-009).
7. Update `src/api/provider.js` default (FR-001) + `manifest.json` `host_permissions` (FR-003).
8. Add per-provider `credentialLabel` and wire Settings copy (FR-006).
9. Friend-onboard one test user end-to-end. Time it (SC-001).
10. Watch cron log for 24 hours (SC-002, SC-005).
