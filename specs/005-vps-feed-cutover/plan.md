# Implementation Plan: vpsFeed Cutover (default provider)

**Branch**: `005-vps-feed-cutover` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/005-vps-feed-cutover/spec.md`

## Summary

Cut over the extension's default odds provider from `theOddsApi` (free-tier rate-limited) to `vpsFeed` (a static JSON feed produced by `scraper/run.js`, served from the maintainer's existing VPS at `195.201.99.206` over HTTPS behind caddy `basic_auth` at `promo-tool.195-201-99-206.sslip.io`). The scraper, the `vpsFeed.js` provider, and the `mergeEvents` normalizer already exist. Remaining work is operational (add the caddy site block, provision per-friend credentials, mint an SSH deploy key, write the scheduled GitHub Actions workflow that runs the scraper and rsyncs to the VPS), client-side (one-line provider swap, URL normalization with embedded credentials + Basic Auth header, copy relabel, manifest `host_permissions` change), and small scraper extensions (more sports in `sports.js`).

Technical approach: keep the existing provider-abstraction interface (`name`, `fetchSports`, `fetchOdds`, `getApiKey`, `saveApiKey`) intact — Constitution §II — and add a per-provider `credentialLabel` field consumed by the Settings copy block. Add an `Authorization` header injection inside `vpsFeed.js` by parsing userinfo out of the stored URL (modern `fetch()` strips embedded credentials). Auto-prefix `https://` and trim/strip on save. Expand `scraper/sports.js` with EPL, UCL, ATP+WTA, UFC league IDs. Ship an ops doc (`scraper/deploy.md`) covering the caddy site block, per-friend bcrypt hashes (via `caddy hash-password`), the restricted SSH deploy key on the VPS, and the GitHub Actions workflow file. The scraper itself does NOT run on the VPS — Pinnacle's Cloudflare WAF blocks the Hetzner DC range (probe `25836475374`); GitHub-hosted Azure runners pass it (research.md R9). No new runtime dependencies on either side; caddy auto-renews TLS so no certbot.

## Technical Context

**Language/Version**: JavaScript ES modules (browser-native for client; Node 20+ for scraper)
**Primary Dependencies**: none (zero npm runtime deps — Constitution §III). caddy on the VPS (already installed); not a code dependency.
**Storage**: `chrome.storage.local` only (Constitution §V); reuses existing `oddsApiKey` slot per FR-002 — no new keys.
**Testing**: `node --test` for any new pure logic (URL parser); manual smoke tests for the deploy.
**Target Platform**: Chromium-based browsers with MV3 side panel (client); GitHub-hosted ubuntu-latest runner (scraper compute); the maintainer's existing VPS at `195.201.99.206` running caddy (static feed host).
**Project Type**: Chrome MV3 browser extension (client) + standalone Node scraper (already in `scraper/`, now executed by GitHub Actions) + caddy static host on the VPS.
**Performance Goals**: feed P95 freshness ≤ 20 min (SC-002, includes GH Actions cron drift); per-request latency ≤ 500 ms over residential broadband to the VPS; scraper run + rsync completes inside 90 s wall clock per workflow run.
**Constraints**: no build step, no bundler, zero new npm runtime deps; manifest `host_permissions` swap only (Constitution Technical Constraints §"Permissions stay minimal" — host_permissions expansions are allowed when a new provider's base URL ships, which is exactly this case); Basic Auth credentials only over HTTPS (FR-011 + FR-013); credentials never logged.
**Scale/Scope**: ≤10 cohort friends; ≤8 sports in `sports.js`; ≤200 events per sport per scan; feed payloads sub-MB per sport.

## Constitution Check

*Gate: must pass before Phase 0. Re-checked post-design at end of Phase 1.*

| Principle | Check | Result |
|---|---|---|
| §I Calculator Purity | No new math; existing pure modules untouched. | PASS |
| §II Provider Abstraction | Cutover IS the abstraction working as designed. Single import swap in `provider.js`. `vpsFeed.js` keeps the existing 5-export shape. New per-provider `credentialLabel` is additive metadata, not a contract break. | PASS |
| §III No Build Step | No bundler, no TS, zero new npm deps. URL parser is built-in `URL`. Scraper stays on Node 20+ `fetch`. | PASS |
| §IV Side Panel | UI changes confined to existing side-panel Settings panel. | PASS |
| §V Local-Only State | No new storage keys. Reuses `oddsApiKey` slot for the feed URL (with possible embedded user:pass) — already designed that way in `vpsFeed.js`. No telemetry, no remote state, no sync. | PASS |
| §VI Read-Only | Scraper reads public Pinnacle + Action Network endpoints. Extension reads the feed. No bet placement, no sportsbook session access. | PASS |
| §VII Brownfield | Spec links brownfield context + constitution. Provider dependency named (Pinnacle + Action Network via scraper; vpsFeed provider via abstraction). Calculator purity boundary not touched. | PASS |
| Technical Constraints — Permissions | `host_permissions` adds `https://*.195-201-99-206.sslip.io/*` per FR-003. Constitution permits this when a new provider's base URL ships. No new `permissions` (still `storage`, `sidePanel`). | PASS |
| Technical Constraints — 3-way markets | Unchanged; scraper already filters main lines only. | PASS |
| Technical Constraints — Scraper | Already dependency-free Node 20+ with built-in `fetch`, cron-friendly. This spec confirms that path. | PASS |

**No constitution violations.** Complexity Tracking section below intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-vps-feed-cutover/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output (smoke tests + ops checklist)
└── tasks.md                 # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory — the external interface (`vpsFeed.js` ↔ feed JSON files) already conforms 1:1 to The-Odds-API's event shape, which is enforced inside `scraper/normalize.js` (`SourceEvent` → merged event) and consumed unchanged by `vpsFeed.js`. The contract surface is `scraper/README.md` (output shape) + `scraper/normalize.js` (enforcement). No new formal contract document is warranted.

### Source Code (repository root)

```text
manifest.json                       # CHANGE: host_permissions adds https://*.195-201-99-206.sslip.io/*
popup/
├── popup.html                      # CHANGE: Settings field label/hint sourced from provider.credentialLabel
└── popup.js                        # CHANGE: read provider.credentialLabel; show provider-specific copy
src/
├── api/
│   ├── provider.js                 # CHANGE: active import flips from theOddsApi to vpsFeed; export credentialLabel
│   └── providers/
│       ├── theOddsApi.js           # CHANGE (small): add credentialLabel = 'The Odds API key'
│       └── vpsFeed.js              # CHANGE: URL normalize (auto-https, strip /, embed-userinfo extract), Authorization: Basic header, credentialLabel = 'Feed URL'
└── (rest unchanged)
scraper/
├── run.js                          # unchanged
├── normalize.js                    # unchanged
├── sports.js                       # CHANGE: add soccer_epl, soccer_uefa_champs_league, tennis_atp_wta, mma_mixed_martial_arts
├── sources/
│   ├── pinnacle.js                 # unchanged (already handles per-leagueId lookup)
│   └── actionNetwork.js            # unchanged (path slug per sport)
├── deploy.md                       # CHANGE: caddy site block + basic_auth + GH Actions deploy-key walk-through (cron section deleted)
└── README.md                       # CHANGE: link to deploy.md; clarify scraper now runs on GH Actions, not VPS cron
.github/
└── workflows/
    ├── pinnacle-probe.yml          # already exists: one-off Cloudflare WAF probe (kept for re-verification on host moves)
    └── scraper.yml                 # NEW: schedule */10 * * * * + workflow_dispatch; runs node run.js then rsync to VPS
test/
├── calc.test.js                    # unchanged
├── recommend.test.js               # unchanged
├── betAndGet.test.js               # unchanged
├── betSlip.test.js                 # unchanged
└── vpsFeed.test.js                 # NEW: pure tests for URL normalize + credential extract (no network, no chrome.*)
```

**Structure Decision**: single repository, dual deliverable (client + scraper) — both already exist. This spec touches one file in `manifest.json`, two in `popup/`, three in `src/api/`, two in `scraper/`, one new test file, and one new ops doc. No new directories.

## Phase 0: Research

See [research.md](./research.md). Resolves: VPS host pick (reuse existing), caddy `basic_auth` + static JSON config, per-provider `credentialLabel` shape, URL normalization rules including embedded credentials, sport-coverage identifiers (Pinnacle leagueIds + Action Network slugs), TLS auto-renew approach (caddy automatic HTTPS).

## Phase 1: Design

See [data-model.md](./data-model.md) for the (small) entity shapes added in this spec and [quickstart.md](./quickstart.md) for the smoke-test + ops checklist that exercises a full friend onboarding end-to-end.

## Complexity Tracking

*Empty — no constitution violations to justify.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Post-design Constitution re-check

- **§II PASS** — `provider.js` still exports the same five symbols; `credentialLabel` is additive.
- **§III PASS** — no bundler, no TS, no runtime deps. `node --test` covers `vpsFeed.js` URL/credential logic.
- **§V PASS** — only the existing `oddsApiKey` slot is read/written; no new keys.
- **§VI PASS** — scraper still reads public endpoints; client still reads its feed; no bet placement.
- **§VII PASS** — spec + plan name provider dependency (vpsFeed → scraper → Pinnacle + Action Network), confirm purity boundary unchanged.

**No re-evaluation triggers a redesign.**
