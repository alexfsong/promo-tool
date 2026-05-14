# Research: vpsFeed Cutover (spec 005)

Phase 0 of `/speckit-plan`. Resolves the open questions left after `/speckit-clarify`. Brownfield project — most "research" is "what does the existing code already do, and which host/config choices remain."

---

## R1 — VPS host pick

**Decision**: **Reuse the existing maintainer-operated VPS at `195.201.99.206`** (Hetzner-class, Ubuntu). Already running caddy alongside `lisearch.195-201-99-206.sslip.io` and `portfolio.195-201-99-206.sslip.io`. Adding the promo-tool feed is a third caddy site on the same box.

**Subdomain**: `promo-tool.195-201-99-206.sslip.io`. [sslip.io](https://sslip.io) wildcard-resolves any `*.195-201-99-206.sslip.io` to that IP, so no DNS work is needed.

**Rationale**: zero marginal infra cost (better than SC-004's ≤$5/mo). Same operator already manages the host. caddy is already proven there; no provisioning step.

**Alternatives considered**:
- **Provision a fresh Hetzner CX22 (~€4.20/mo)**: rejected — duplicates work, costs $4/mo more than reusing the existing host.
- **Custom domain in front of sslip**: a real maintainer-owned domain could be pointed at this IP, but sslip.io suffices for the friend cohort and removes annual-renewal ops drift. Punt to a follow-up if the cohort grows.
- **Fly.io free tier / GitHub Actions Pages**: rejected during the first pass (cron timing / Basic Auth gaps).

---

## R2 — caddy Basic Auth + static JSON config

**Decision (revised after R1 host decision)**: serve `/var/www/promo-tool/` from caddy with its built-in `basic_auth` directive. Per-friend bcrypt hashes inline in the Caddyfile, generated via `caddy hash-password`. `Cache-Control: max-age=60` on `*.json` to let the browser dedupe rapid scans without staleness.

**Caddyfile site block** (illustrative; production version in DEPLOY.md):

```caddyfile
promo-tool.195-201-99-206.sslip.io {
    root * /var/www/promo-tool
    file_server

    basic_auth {
        maintainer $2a$14$<bcrypt-hash>
        # alice    $2a$14$<bcrypt-hash>
    }

    @json path *.json
    header @json {
        Content-Type "application/json"
        Cache-Control "max-age=60, must-revalidate"
    }

    encode gzip
    log {
        output file /var/log/caddy/promo-tool.log
    }
}
```

**Rationale**: caddy is already installed and running on the host (R1). Its built-in Let's Encrypt issuance + auto-renewal eliminates the certbot + systemd-timer step that R6 originally required. The inline-bcrypt friction (no separate htpasswd file) is acceptable at ≤10-friend cohort scale — adding or revoking a friend is one line edit + `systemctl reload caddy` (graceful, no downtime).

**Alternatives considered**:
- **nginx + htpasswd** (the original R2 decision): rejected after learning caddy is already on the host. Adding a second web server side-by-side adds ops surface for no benefit.
- **caddy with an `import` of a separate hashes file**: viable but adds a file caddy reloads need to re-parse. Inline is simpler at this scale.
- **Cloudflare Access** (free tier): elegant per-identity auth but ties friend onboarding to a Cloudflare login flow → bumps SC-001 past 90s.
- **Static query-param token**: rejected during clarify (Q3 chose D not C).

---

## R3 — Per-provider `credentialLabel` shape

**Decision**: Each provider module exports an additional static metadata object alongside the existing functions:

```js
// src/api/providers/vpsFeed.js
export const credentialLabel = 'Feed URL';
export const credentialPlaceholder = 'https://you:pw@feeds.<your-host>/promo-tool';
export const credentialHint = 'Paste the feed URL your friend sent you (it has your username and password embedded).';
```

`src/api/provider.js` re-exports them:

```js
export const credentialLabel = provider.credentialLabel;
export const credentialPlaceholder = provider.credentialPlaceholder;
export const credentialHint = provider.credentialHint;
```

`popup/popup.js` (during init) reads these and patches the existing Settings DOM:

```js
import { credentialLabel, credentialPlaceholder, credentialHint } from '../src/api/provider.js';
document.querySelector('label[for="apiKeyInput"]').textContent = credentialLabel;
document.getElementById('apiKeyInput').placeholder = credentialPlaceholder;
// hint span text is replaced similarly
```

**Rationale**: keeps the provider abstraction shape additive (Constitution §II). HTML stays generic — no `<template>` per provider. Swapping providers is still a one-line edit to `provider.js` plus a re-export update; the UI follows.

**Alternatives considered**:
- **Per-provider HTML templates** in `popup.html`: violates "one HTML file, one settings panel" simplicity; hides which provider is active.
- **A `creds.js` constants file decoupled from providers**: drifts when providers change names.
- **Hardcoded `vpsFeed` copy in HTML**: blocks FR-006's "swap providers without HTML changes" requirement (US5 acceptance scenario 2).

---

## R4 — URL normalization + embedded-credentials extraction

**Decision**: Implement `normalizeFeedUrl(input) → { baseUrl, authHeader }` as a pure function inside `src/api/providers/vpsFeed.js`, unit-tested under `test/vpsFeed.test.js`. Algorithm:

1. `String(input).trim()`. If empty → throw `'No feed URL set'`.
2. If no protocol prefix (regex `^[a-z]+:\/\//i`), prepend `https://`.
3. Reject any URL whose final protocol is not `https:` → throw `'Feed URL must start with https://'`.
4. `const u = new URL(normalized)`. (Built-in WHATWG parser; handles percent-decoding and userinfo extraction.)
5. If `u.username` is non-empty: build `authHeader = 'Basic ' + btoa(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password))`. Then strip userinfo by setting `u.username = ''; u.password = ''`.
6. Strip trailing slashes from `u.pathname`.
7. Return `{ baseUrl: u.toString().replace(/\/+$/, ''), authHeader }`.

`fetchSports` and `fetchOdds` call `normalizeFeedUrl(await getApiKey())` and pass `authHeader` (if present) into `fetch(url, { headers: { Authorization: authHeader } })`. The `Authorization` header is never logged.

**Rationale**: WHATWG `URL` is built into both Node 20+ and Chromium — zero new code for parsing. `btoa` is global in browsers; if the same module is ever exercised under Node, swap for `Buffer.from(...).toString('base64')` at test-time only (the production path runs in the extension). Tests use a small polyfill or `Buffer.from`.

**Alternatives considered**:
- **Regex-only parser**: brittle; percent-decoding alone is non-trivial. Rejected.
- **Forward `https://user:pass@host/...` to `fetch()` and let the browser handle it**: deprecated in modern browsers; service-worker `fetch()` strips userinfo silently → 401 every call. Rejected.
- **Store credentials in a separate storage key**: violates Constitution §V "credential key is shared across providers" guidance and breaks the single-paste UX (US1 SC-001 90 s budget).

---

## R5 — Sport-coverage extension (FR-009)

**Decision**: extend `scraper/sports.js` with four additional entries. Identifiers below are confirmed via the provider endpoints noted next to each (verify at deploy time per FR-010).

| `key` | Title | Group | Pinnacle `sportId` / `leagueIds[]` | Action Network slug |
|---|---|---|---|---|
| `soccer_epl` | English Premier League | Soccer | 29 (sport=Soccer) / `[1980]` | `nfl` (placeholder — verify via `/scoreboard/{slug}`) |
| `soccer_uefa_champs_league` | UEFA Champions League | Soccer | 29 / `[2627]` | (Action Network may not cover; degrade to Pinnacle-only) |
| `tennis_atp_wta` | ATP + WTA combined | Tennis | 33 / `[2272, 2273]` (ATP, WTA) | `tennis` |
| `mma_mixed_martial_arts` | MMA (UFC primary) | MMA | 22 / `[1582]` | `mma` |

**Verification step** (in DEPLOY.md): from the VPS, `curl https://guest.api.arcadia.pinnacle.com/0.1/sports/29/leagues | jq '.[] | select(.name | test("Premier|Champions")) | {id, name}'` to confirm the league IDs above are still current. Action Network slugs verified via `curl 'https://api.actionnetwork.com/web/v1/scoreboard/<slug>?date=YYYYMMDD'` returning `{games: [...]}`.

**Soccer 3-way market handling**: Constitution Technical Constraints states 3-way markets are out of scope (no clean cross-book hedge). The scraper normalizer (`normalize.js`) currently emits 2-outcome `h2h` markets only. For soccer, the scraper MUST emit only events that have 2-outcome alternatives (home/away from match-result-excluding-draw, often labeled "Double Chance" or skipped entirely) — OR emit nothing for soccer and accept that soccer coverage is for spec 002+ to extend. **Decision**: emit only the 2-outcome moneyline if it exists in the source; otherwise skip the event. The scanner's "outcomes.length !== 2" guard already handles this client-side.

**Rationale**: friend cohort wants soccer/tennis/UFC. Hardcoding the four most-watched leagues covers the demand without making `sports.js` a wall of cruft. Future sports (NCAA football, Bundesliga, etc.) ship in follow-ups.

**Alternatives considered**:
- **Mirror The-Odds-API's full sport list**: ~80 sports; most have no friend-cohort demand and would waste cron time + bandwidth.
- **Per-friend sport selection**: out of scope. Friend cohort is small; one shared list is fine.

---

## R6 — TLS auto-renew

**Decision (revised with R2)**: caddy's built-in automatic HTTPS. caddy negotiates a Let's Encrypt cert on the first request to a new hostname and renews automatically (~30 days before expiry). No certbot, no systemd timer, no Caddyfile-level config required — it Just Works as long as port 80 is reachable.

**Rationale**: caddy is already on the host. Auto-https is the reason caddy exists. Zero ops surface.

**Alternatives considered**:
- **certbot + nginx**: rejected in tandem with R2's caddy decision.
- **acme.sh**: rejected, never needed.

---

## R7 — Provider swap mechanics

**Decision**: `src/api/provider.js` keeps both imports present, one commented:

```js
// import * as theOddsApi from './providers/theOddsApi.js';
import * as vpsFeed from './providers/vpsFeed.js';

const provider = vpsFeed;
// const provider = theOddsApi;  // fallback: swap above import + this line
```

The maintainer swaps by uncommenting the import and the const line, re-running the extension. No state migration needed because both providers use the same `oddsApiKey` storage slot (designed in `vpsFeed.js` from day one).

**Rationale**: matches Constitution §II "swap by changing the import below." Comment-toggle pattern keeps the fallback discoverable without dead-code complaints.

---

## R8 — Manifest `host_permissions` exact value

**Decision**: `"host_permissions": ["https://*.195-201-99-206.sslip.io/*", "https://api.the-odds-api.com/*"]`. The first entry wildcard-covers the maintainer's existing sslip-based sites on host 195.201.99.206, including the new `promo-tool.195-201-99-206.sslip.io`. The second keeps The-Odds-API reachable for the maintainer's one-line fallback (R7).

**Caveat — IP coupling**: this scope is bound to a single VPS IP. If the host IP changes (region move, host swap), `manifest.json` MUST update and every friend MUST re-install the unpacked extension. This is the cost of using sslip.io rather than a maintainer-owned DNS zone. Acceptable for the friend cohort scale; revisit if IP-portability becomes load-bearing.

**Rationale**: FR-003 permits both. Two narrow entries are still narrow enough — Constitution Technical Constraints permits `host_permissions` expansion when a new provider's base URL ships, which is exactly this.

**Alternatives considered**:
- **Single entry, drop The-Odds-API**: prevents maintainer fallback without manifest edit + friend re-install. Rejected.
- **Wildcard `https://*/*`**: rejected during clarify (Q2 chose B not C).
- **Maintainer-owned domain pointed at the IP**: would decouple the manifest from the IP, but requires DNS + annual renewal. Punt until cohort grows.

---

## Decisions summary

| ID | Decision | Owns |
|---|---|---|
| R1 | Reuse existing VPS 195.201.99.206; subdomain promo-tool.195-201-99-206.sslip.io | `scraper/DEPLOY.md` |
| R2 | caddy `basic_auth` + 60s Cache-Control (revised from nginx) | `scraper/DEPLOY.md` |
| R3 | Per-provider `credentialLabel`/`Placeholder`/`Hint` exports | `src/api/providers/*.js` + `popup/popup.js` |
| R4 | Pure `normalizeFeedUrl()` w/ embedded-creds extraction | `src/api/providers/vpsFeed.js` + `test/vpsFeed.test.js` |
| R5 | Add EPL, UCL, ATP+WTA, MMA; 2-outcome filter for soccer | `scraper/sports.js` + `scraper/normalize.js` (no change — filter is at scanner) |
| R6 | caddy auto-HTTPS (revised from certbot) | `scraper/DEPLOY.md` |
| R7 | Comment-toggle import + const in `provider.js` | `src/api/provider.js` |
| R8 | host_permissions: `*.195-201-99-206.sslip.io` + `api.the-odds-api.com` | `manifest.json` |

All NEEDS CLARIFICATION items from `plan.md` Technical Context are resolved.
