# Brownfield Context: Promo Tool

**Status**: Living reference (not a feature spec)
**Created**: 2026-05-12
**Purpose**: Single source of truth for *what already exists* and *where the project is headed*. Every new `specs/NNN-*/spec.md` should reference this doc instead of restating these facts.

---

## 1. Product

Chrome MV3 extension that surfaces +EV moves from sportsbook promotions for the user *and* friends who do not understand the math.

**Distribution model**: side-loaded unpacked extension shared with a small private circle. Not on the Chrome Web Store.

**UI surface**: Chrome **side panel** (not a popup) — stays open while the user browses sportsbook pages.

### Capabilities (shipped)

| Feature | What it does | Source of truth |
|---|---|---|
| Promo Scanner | Cross-book scan, ranks outcomes by bonus-bet conversion rate. Single sport or *all active sports*. Skips 3-way markets. Restricts hedge legs to the user's "My sportsbooks" list. Click-through to autofill Bonus Bet calc. Results cached for session. | `popup/popup.js`, `src/api/provider.js` |
| Bonus Bet calc | Hedge stake + guaranteed cash from a bonus bet | `src/calc/bonusBet.js` |
| Risk-Free calc | EV of risk-free / second-chance bets given a conversion rate | `src/calc/riskFree.js` |
| Deposit Match calc | EV after rollover | `src/calc/depositMatch.js` |
| Odds Boost calc | Boosted line vs fair-market odds | `src/calc/oddsBoost.js` |
| Odds input | American (`-110`, `+200`) and decimal (`1.91`) auto-detected | `src/calc/odds.js` |
| Live-page badges | Annotates DraftKings + FanDuel pages | `content/contentScript.js` |
| Advanced Mode | Hides beginner explainers, exposes extra inputs (e.g., custom win probability) | `popup/popup.js`, `src/ui/explanations.js` |

### Out of scope (current)

- Chrome Web Store publication
- Mobile / non-Chromium browsers
- Account integrations with sportsbooks (no auth, no bet placement)
- 3-way markets (soccer draw etc.)

---

## 2. Architecture

```
manifest.json  (MV3, side_panel, module service worker)
├── popup/                    Side-panel UI
│   ├── popup.html / popup.css
│   └── popup.js              Tabs + scanner + calculator wiring
├── src/
│   ├── api/
│   │   ├── provider.js       Pluggable provider façade (single export surface)
│   │   └── providers/
│   │       ├── theOddsApi.js The-Odds-API client (default, free 500 req/mo)
│   │       └── vpsFeed.js    Static JSON feed produced by scraper/
│   ├── calc/                 Pure math, framework-free, unit-tested
│   └── ui/                   Beginner-mode explainer copy
├── background/
│   └── serviceWorker.js      Side-panel behavior + odds cache
├── content/                  DK + FD page badges
├── scraper/                  VPS-side: scrape Pinnacle + Action Network,
│   │                         normalize to The-Odds-API event shape, write JSON
│   ├── run.js                Entrypoint, cron'd every 10 min
│   ├── normalize.js          Merge multi-source events
│   ├── sports.js             Sport-key registry (mirrors The-Odds-API keys)
│   └── sources/
│       ├── pinnacle.js       Sharp h2h / spreads / totals
│       └── actionNetwork.js  Per-book US odds (DK, FD, MGM, Caesars…)
└── test/calc.test.js         node --test, calculators only
```

### Provider abstraction (key invariant)

`src/api/provider.js` exposes exactly:

```
name, fetchSports(), fetchOdds(key), getApiKey(), saveApiKey(k)
```

`fetchOdds` returns The-Odds-API event shape: `{ id, home_team, away_team, commence_time, bookmakers[] }`. **Both providers must conform.** All scanner / badge code reads through this façade — adding a third provider is an isolated change.

The vpsFeed provider reuses the same `oddsApiKey` chrome.storage key (stores feed base URL instead of API key) so the Settings UI is unchanged.

### Data flow

1. User opens side panel → `popup.js` loads
2. Scanner → `provider.fetchSports()` → `provider.fetchOdds(key)` per active sport
3. Results filtered to "My sportsbooks", ranked by bonus-bet conversion rate
4. Click result → autofill Bonus Bet tab → `src/calc/bonusBet.js`
5. `background/serviceWorker.js` keeps a session odds cache
6. Content scripts independently badge DK/FD pages with cross-book best-odds data

### Storage

`chrome.storage.local` only. Keys: `oddsApiKey` (API key *or* feed base URL), user's selected sportsbooks list, advanced-mode toggle, session scan cache.

### Constraints

- Manifest V3 (service worker, not background page)
- Module type service worker (`"type": "module"`)
- Permissions: `storage`, `sidePanel`. Host: `https://api.the-odds-api.com/*` (will need updating if scraper feed URL becomes default provider)
- No build step. Pure ES modules loaded directly by the browser.
- Zero npm deps in runtime; only test runner is Node's built-in `node --test`
- Scraper also dependency-free (Node 20+ built-in `fetch`)

---

## 3. Current state (2026-05-12)

### On disk, uncommitted

- `scraper/` — new VPS scraper subsystem, ready but not deployed
- `src/api/provider.js` + `src/api/providers/{theOddsApi,vpsFeed}.js` — provider abstraction
- `src/api/oddsApi.js` — **deleted** (replaced by provider abstraction)
- Modified: `background/serviceWorker.js`, `popup/popup.js` to consume the new provider

### Recent direction

- Migrating off The-Odds-API's 500 req/month free tier toward a self-hosted scraper (Pinnacle + Action Network) served as static JSON from a VPS.
- Provider swap is a one-line change in `src/api/provider.js`.

### Known gaps

- vpsFeed provider is wired but no VPS is deployed yet
- `host_permissions` in `manifest.json` does not yet allow the VPS domain
- No CI; tests run locally via `npm test`
- No release / packaging workflow — install is manual `chrome://extensions` → Load unpacked

---

## 4. Goals & non-goals for spec-driven work

### Goals

1. Cut Odds-API dependency: deploy scraper VPS, validate vpsFeed parity with theOddsApi
2. Expand promotion coverage beyond the four calculator types (e.g., parlay insurance, profit boosts on parlays, no-sweat SGPs)
3. Improve scanner ranking signal (currently bonus-bet conversion rate only; needs EV ranking that accounts for bonus-bet vs cash promos)
4. Lower the friction of sharing with non-technical friends (loading unpacked is the current bottleneck)

### Non-goals

- No bet placement automation. Read-only assistant.
- No multi-user / account sync. Per-browser local state only.
- No Chrome Web Store submission yet (would force review cycle + remove unpacked-extension flexibility).
- No mobile.

---

## 5. Conventions to preserve

- **Calculators stay pure**: no DOM, no chrome APIs in `src/calc/*`. They are the only thing under unit test — keep them testable.
- **Provider shape is sacred**: any new data source conforms to The-Odds-API event shape. Don't leak provider-specific fields upward.
- **Storage key reuse**: `oddsApiKey` holds whatever credential the active provider needs. Don't add per-provider keys unless the Settings UI grows.
- **No build step**: prefer adding a dep-free module to introducing bundlers / TypeScript / a framework. The "install = load unpacked" simplicity is load-bearing for the share-with-friends model.
- **ES modules everywhere**, including the service worker (`"type": "module"`).
- **Side panel, not popup**: any new UI surface should respect that the panel persists across page navigations.

---

## 6. How to use this doc with spec-kit

Every new feature spec (`specs/NNN-feature/spec.md`) should:

1. Link back here in its **Assumptions** section: *"See [Brownfield Context](../000-brownfield-context/spec.md) §N."*
2. Call out any constraint from §2 / §5 it intends to break (and justify).
3. State which provider(s) the feature depends on (§2 provider abstraction).
4. State whether it touches the calculator purity boundary (§5).

When this doc drifts from reality (e.g., scraper deploys, a new provider lands, Web Store submission), update it in the same PR as the change — it is a living reference, not an archived snapshot.
