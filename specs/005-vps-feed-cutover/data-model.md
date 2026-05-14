# Data Model: vpsFeed Cutover (spec 005)

This spec is mostly ops; the data shapes are already established by spec 001 + `scraper/normalize.js`. This file documents what spec 005 *adds* or *renames*.

---

## Entities (delta only)

### `Provider` (existing — additive fields)

Each module under `src/api/providers/` already exports:

```js
export const name;           // string, e.g. 'vps-feed'
export const fetchSports;    // () → Promise<Sport[]>
export const fetchOdds;      // (sportKey) → Promise<Event[]>
export const getApiKey;      // () → Promise<string>
export const saveApiKey;     // (value) → Promise<void>
```

Spec 005 adds three additive static exports:

```js
export const credentialLabel;       // string, e.g. 'Feed URL'   (per FR-006)
export const credentialPlaceholder; // string, example to show in <input placeholder>
export const credentialHint;        // string, one-sentence help text under the input
```

`src/api/provider.js` re-exports them (R3). Existing callers see no breaking change.

---

### `FeedCredential` (new, in-memory only — never persisted as a struct)

Output of `normalizeFeedUrl(rawInput)` inside `vpsFeed.js` (R4):

```js
{
  baseUrl: string,         // https-only, no trailing slash, no userinfo
  authHeader: string | null,  // 'Basic <base64>' if userinfo was present, else null
}
```

Pure: no side effects, no I/O. Called on every `fetchSports`/`fetchOdds` from the value stored in `chrome.storage.local.oddsApiKey`.

**Validation rules**:

- `baseUrl` MUST start with `https://`. `http://` raises.
- `baseUrl` MUST be a valid WHATWG URL (parseable by `new URL()`).
- `authHeader`, if present, MUST be `'Basic '` followed by base64 of `username + ':' + password`, both percent-decoded.
- The raw stored value MAY contain percent-encoded characters in userinfo (e.g., `p%40ss` for a password of `p@ss`); the normalizer percent-decodes before base64.

**Invariants**:

- `authHeader` is never persisted. Only the input URL is stored (and that string contains the credentials as URL userinfo). On every request the normalizer re-derives the header.
- Neither `baseUrl` nor `authHeader` is logged. The console error surface uses the URL minus userinfo if it has to mention it.

---

### `Sport` (existing — extended catalog)

Per scraper `sports.js`. Spec 005 grows the array (FR-009 / R5) but does not change the shape:

```js
{
  key: string,           // The-Odds-API-compatible sport key
  title: string,         // human label
  group: string,         // category for the sport dropdown
  pinnacle: { sportId, leagueIds: number[] },
  actionNetwork: { path: string },
}
```

Added entries (R5): `soccer_epl`, `soccer_uefa_champs_league`, `tennis_atp_wta`, `mma_mixed_martial_arts`.

The output manifest (`asSportsManifest()` → `sports.json`) still emits `{ key, title, group, active }` per The-Odds-API shape.

---

### `BookmakerEntry` (existing — no change)

Shape from `scraper/normalize.js`:

```js
{
  key: string,           // e.g. 'pinnacle', 'actionnetwork:15'
  title: string,         // user-facing book name
  last_update: ISO8601,  // consumed by spec 004 odds-age badge
  markets: Market[],
}
```

Spec 005 confirms `last_update` is always set to either the source's reported timestamp or the cron run's start time (`run.js`). Spec 004 owns surfacing it.

---

## Storage layout (`chrome.storage.local`)

Unchanged from spec 001. Spec 005 only changes *what gets stored at the `oddsApiKey` key* — a feed URL with possible embedded credentials instead of an API key.

| Key | Value | Owner | Change in spec 005 |
|---|---|---|---|
| `oddsApiKey` | string — feed URL (may include `user:pass@`) when vpsFeed is active; API key string when theOddsApi is active | provider abstraction | semantic only (was always shared per Constitution §V) |
| `userBooks` | string[] | settings UI | none |
| `advancedMode` | boolean | popup | none |
| `promoType` | string | popup | none |
| `selectedBooks` | string[] | popup | none |
| `knownBooks` | string[] | popup | none |
| `scanCache` | object | service worker | none |

**No new keys.**

---

## Ops "entities" (informational; not in code)

For completeness — referenced by `quickstart.md` and `scraper/DEPLOY.md`:

### `CaddyBasicAuthEntry`

One stanza per friend inside the `basic_auth { ... }` block in the
`promo-tool.195-201-99-206.sslip.io` site of `/etc/caddy/Caddyfile`:

```caddyfile
<username> $2a$14$<bcrypt-hash>
```

Generated via `caddy hash-password --plaintext '<password>'`. Removed
by deleting the line inside the block and running
`sudo systemctl reload caddy` (graceful, no downtime). caddy re-reads
the Caddyfile on reload.

### `ScheduledWorkflow`

`.github/workflows/scraper.yml` in this repo. Triggers:

```yaml
on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch:
```

The workflow checks out the repo, runs `node scraper/run.js` with `OUT_DIR=$RUNNER_TEMP/promo-out`, then `rsync -az --delete $OUT_DIR/ deploy@195.201.99.206:/var/www/promo-tool/` using the SSH private key from the `VPS_DEPLOY_KEY` repo secret and the host key from `VPS_KNOWN_HOSTS`.

Required GitHub repo secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_DEPLOY_KEY` | full PEM-encoded ed25519 private key (mint with `ssh-keygen -t ed25519 -C 'gha-promo-tool-deploy' -f vps_deploy_key -N ''`) |
| `VPS_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 195.201.99.206` |
| `VPS_DEPLOY_USER` | username on the VPS (e.g., `deploy`) — optional if hardcoded in the workflow |

VPS-side `~/.ssh/authorized_keys` for `VPS_DEPLOY_USER`:

```
command="rrsync /var/www/promo-tool",restrict ssh-ed25519 AAAA... gha-promo-tool-deploy
```

(`rrsync` ships with rsync on Debian/Ubuntu under `/usr/share/doc/rsync/scripts/rrsync`.)

### `FeedHostInventory`

The maintainer's record (kept off-repo, in a password manager or note) of:

- Primary host: existing VPS at `195.201.99.206` (running caddy)
- DNS: sslip.io wildcard resolves `*.195-201-99-206.sslip.io` to the host IP — no DNS configuration on the maintainer's side
- Subdomain reserve: if the host IP changes, the maintainer stands up a replacement and re-distributes the new URL via DM (the IP is baked into the manifest's `host_permissions`, so a host migration requires a manifest update + friend re-installs)
- Caddyfile location: `/etc/caddy/Caddyfile` — `basic_auth` stanza per friend
- TLS: Let's Encrypt via caddy automatic HTTPS (no certbot, no systemd timer)

Not in this repo. The wildcard `host_permissions` (Q2 → R8) lets the maintainer move between primary and backup subdomains without manifest edits.

---

## Cross-spec data ownership

| Field / entity | Spec 001 | Spec 002 | Spec 003 | Spec 004 | Spec 005 |
|---|---|---|---|---|---|
| `PromoType` registry | owner | reads | reads | — | — |
| `BestPlay` shape | owner | extends | reads | — | — |
| `UserBooks` | reads | owner | reads | — | — |
| `BookCeilings` | — | owner | — | — | — |
| Recipe library | — | — | owner | — | — |
| Live-event filter | — | — | — | owner | — |
| `last_update` field | reads | — | — | owner (surface) | **owner (populate)** |
| `oddsApiKey` semantics | reads | — | — | — | **owner (now a feed URL, possibly with userinfo)** |
| `Provider.credentialLabel` etc. | reads (via popup copy) | — | — | — | **owner** |
| `scraper/sports.js` catalog | reads | — | — | — | **owner (extends)** |
| Feed JSON files on disk | — | — | — | — | **owner** |
