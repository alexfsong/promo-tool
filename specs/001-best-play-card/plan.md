# Implementation Plan: Best Play Card

**Branch**: `001-best-play-card` | **Date**: 2026-05-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-best-play-card/spec.md`

## Summary

Replace the four-tab calculator UI as the default side-panel surface with a single Best Play card that names the exact bet to place at the +EV book, the exact cash hedge stake to place at a different book, and the guaranteed locked-cash amount. Promo-type picker uses sportsbook language, not calculator names. Bet-slip paste eliminates odds-format typos. EV is moved to a dedicated Advanced-only tab. Legacy calculators remain reachable from Settings.

Technical approach: introduce a new `src/promos/registry.js` that wires user-facing promo types to the existing pure calculators in `src/calc/` and declares input-field shapes. Add a small `src/promos/recommend.js` pure module that consumes provider output + user inputs and returns a `BestPlay` structure consumed by the UI. Rewire `popup/popup.js` so the default tab renders the Best Play card; the four existing calculator tabs become an Advanced-Settings-reachable sub-route. Bet-slip parser lives at `src/parsers/betSlip.js` as pure regex-based heuristics for DK and FD only at launch.

## Technical Context

**Language/Version**: JavaScript ES modules (browser-native), Node 20+ for tests
**Primary Dependencies**: none (zero npm runtime deps — Constitution §III)
**Storage**: `chrome.storage.local` only (Constitution §V)
**Testing**: `node --test` against modules in `src/calc/`, `src/promos/`, `src/parsers/`
**Target Platform**: Chromium-based browsers with MV3 side-panel support
**Project Type**: Chrome MV3 browser extension (side panel)
**Performance Goals**: side panel opens → Best Play card visible in ≤2s when scan cache is warm; cold scan ≤8s for all active sports (existing scanner behavior)
**Constraints**: no build step, no bundler, no transpiler, ES modules loaded directly by Chrome; manifest permissions unchanged (`storage`, `sidePanel`, `host_permissions: api.the-odds-api.com`)
**Scale/Scope**: single-user local extension; ≤10 books in "My sportsbooks"; ≤8 active sports; ≤200 events per sport per scan

## Constitution Check

*Gate: must pass before Phase 0 research. Re-checked post-design at end of Phase 1.*

| Principle | Check | Result |
|---|---|---|
| §I Calculator Purity | All new math (`src/promos/recommend.js`, Bet & Get two-stage math) lands as pure functions under `src/calc/` (or `src/promos/` for orchestration of existing calculators). No DOM, no `chrome.*`, no network. | PASS |
| §II Provider Abstraction | Best Play consumes odds only via `src/api/provider.js`. No new provider work. | PASS |
| §III No Build Step | Pure ES modules. Zero new runtime deps. Tests stay on `node --test`. | PASS |
| §IV Side Panel | All new UI surfaces (Best Play tab, EV tab, paste field, Settings entry for legacy calculators) live in the existing side panel. | PASS |
| §V Local-Only State | New persisted state: selected promo type, Beginner/Advanced toggle. Both under `chrome.storage.local`. Reuses `oddsApiKey` storage key (Constitution §V). No new credential keys. | PASS |
| §VI Read-Only | No bet placement automation. Bet-slip parsing is on user-pasted text only. | PASS |
| §VII Brownfield Discipline | Spec 001 references brownfield context, names provider dependency (theOddsApi or vpsFeed via abstraction), confirms calculator purity boundary preserved. | PASS |

**No constitution violations.** Complexity Tracking section below intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-best-play-card/
├── spec.md
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
└── tasks.md                 # Phase 2 output (/speckit-tasks)
```

No `contracts/` directory — this is a browser-local UI feature with no external API surface to formalize.

### Source Code (repository root)

```text
manifest.json                       # unchanged in this spec
popup/
├── popup.html                      # add Best Play tab markup, EV tab markup (hidden by default)
├── popup.css                       # add Best Play card styles
└── popup.js                        # rewire default tab; add promo-type picker; consume recommend.js
src/
├── api/
│   ├── provider.js                 # unchanged
│   └── providers/                  # unchanged
├── calc/                           # existing pure calculators, unchanged in surface
│   ├── odds.js
│   ├── bonusBet.js
│   ├── riskFree.js
│   ├── depositMatch.js
│   └── oddsBoost.js
├── promos/                         # NEW directory
│   ├── registry.js                 # user-facing promo type → calc wiring + field shapes
│   ├── recommend.js                # pure: (inputs, providerEvents, books) → BestPlay
│   └── betAndGet.js                # pure: two-stage Bet&Get math (Beginner: floor, Advanced: net EV)
├── parsers/                        # NEW directory
│   └── betSlip.js                  # pure: bet-slip text → partial {event?, selection?, odds?, book?}
└── ui/
    └── explanations.js             # existing, may add Beginner-Mode strings for Best Play card
background/
└── serviceWorker.js                # unchanged in this spec (cache layer untouched)
content/                            # unchanged in this spec
test/
├── calc.test.js                    # existing
├── recommend.test.js               # NEW — Best Play composition + Bet&Get two-stage math
└── betSlip.test.js                 # NEW — bet-slip parser cases for DK + FD
```

**Structure Decision**: single project (Option 1 from template). The extension is one deliverable. Two new directories: `src/promos/` (registry + recommendation orchestration) and `src/parsers/` (bet-slip text parser). Both adhere to Constitution §I (pure functions, no DOM, no `chrome.*`) and are unit-tested under `test/`.

## Complexity Tracking

*Empty — no constitution violations to justify.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0: Research

See [research.md](./research.md). Resolves: bet-slip text format per book, "Bet & Get" two-stage math derivation, hedge-leg selection algorithm under current single-book constraint.

## Phase 1: Design

See [data-model.md](./data-model.md) for entity shapes and [quickstart.md](./quickstart.md) for the manual smoke test that exercises a full Best Play flow end-to-end.

## Post-design Constitution re-check

After data-model.md and quickstart.md are produced:

- **§I PASS** — every new math module is a pure function with a corresponding test entry.
- **§II PASS** — `recommend.js` takes `providerEvents` as a parameter; it does not import the provider.
- **§III PASS** — no bundler, no TS, no runtime deps. `node --test` covers new modules.
- **§V PASS** — only two new persisted keys (`promoType`, `mode`), both reusing existing storage subsystem.

**No re-evaluation triggers a redesign.**
