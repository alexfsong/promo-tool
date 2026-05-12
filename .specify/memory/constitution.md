# Promo Tool Constitution

These principles are non-negotiable defaults for every feature spec, plan,
and implementation. A feature may override one only with explicit
justification in its spec's Assumptions section. Full project context lives
in [`specs/000-brownfield-context/spec.md`](../../specs/000-brownfield-context/spec.md).

## Core Principles

### I. Calculator Purity (NON-NEGOTIABLE)

Modules under `src/calc/` are pure functions: no DOM, no `chrome.*` APIs,
no network, no `Date.now()` reads, no side effects. They are the only
unit-tested layer (`test/calc.test.js`, `node --test`). Any new financial
or odds math goes here first, called from UI/background code second.

### II. Provider Abstraction

All odds-data access goes through `src/api/provider.js`. Providers expose
exactly: `name`, `fetchSports()`, `fetchOdds(key)`, `getApiKey()`,
`saveApiKey(k)`. `fetchOdds` returns The-Odds-API event shape. Scanner,
content scripts, and service worker must not import provider modules
directly. Adding a data source is an isolated file under
`src/api/providers/` plus the one-line swap in `provider.js`.

### III. No Build Step

The "install = `chrome://extensions` → Load unpacked" model is load-bearing
for sharing with non-technical friends. Do not introduce bundlers,
TypeScript, transpilers, or frameworks. Pure ES modules loaded directly by
Chrome. Runtime dependencies stay at zero npm packages. Test runner stays
at `node --test`. Scraper stays on Node 20+ built-in `fetch`.

### IV. Side Panel, Not Popup

UI surface is the Chrome side panel (`manifest.json` → `side_panel`). New
UI must assume the panel persists across page navigations and survives
tab switches. No reliance on popup open/close lifecycle.

### V. Local-Only State

Storage is `chrome.storage.local` only. No accounts, no sync, no remote
state, no telemetry. The credential key `oddsApiKey` is shared across
providers (it holds an API key *or* a feed base URL); do not fragment
it without a Settings-UI redesign.

### VI. Read-Only Assistant

The tool surfaces and computes; it never places bets, modifies sportsbook
account state, or automates anything inside a sportsbook session. Content
scripts may read and annotate. They may not click, submit, or store
credentials.

### VII. Brownfield Discipline

Every feature spec links to `specs/000-brownfield-context/spec.md` and
explicitly states (a) which provider(s) it depends on, (b) whether it
touches the calculator purity boundary, and (c) any invariant from this
constitution it intends to break. Update the brownfield context doc in
the same PR as any change that invalidates it.

## Technical Constraints

- **Manifest V3**, module service worker (`"type": "module"`).
- **Permissions** stay minimal: `storage`, `sidePanel`. `host_permissions`
  expand only when a new provider's base URL ships.
- **3-way markets** (soccer draw, etc.) are out of scope — they cannot be
  cleanly hedged with the current scanner model.
- **No mobile, no non-Chromium browsers, no Chrome Web Store submission**
  in current scope.
- **Scraper** is dependency-free Node 20+, cron'd every 10 min, writes
  static JSON consumed by the vpsFeed provider.

## Development Workflow

- Calculator changes require a matching `test/calc.test.js` case before
  merging.
- Provider changes must preserve The-Odds-API event shape — verified
  by running the scanner against both providers in a manual smoke test
  until automated parity tests exist.
- Spec-kit flow: `/speckit-specify` → optional `/speckit-clarify` →
  `/speckit-plan` → `/speckit-tasks` → optional `/speckit-analyze` →
  `/speckit-implement`. Every spec starts by reading the brownfield
  context.
- Commit messages follow Conventional Commits (existing style: `docs:`,
  feat:, fix:, etc.).

## Governance

This constitution supersedes ad-hoc decisions made in individual specs.
Amendments require updating this file *and* the brownfield context doc
in the same change. Any PR that violates a principle without an explicit
override in its spec is non-compliant and should be revised.

**Version**: 1.0.0 | **Ratified**: 2026-05-12 | **Last Amended**: 2026-05-12
