---

description: "Task list for spec 001 — Best Play Card"
---

# Tasks: Best Play Card

**Input**: Design documents from `/specs/001-best-play-card/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md
**Tests**: Included — plan.md and quickstart.md "Definition of done" explicitly require `node --test` coverage for new pure modules (`recommend.js`, `betAndGet.js`, `betSlip.js`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete deps)
- **[Story]**: `[US1]`–`[US4]` for user-story phase tasks only
- File paths absolute-relative to repo root

## Path Conventions

Single project per plan.md §"Structure Decision":

- Source: `src/`, `popup/`, `background/`, `content/`
- Tests: `test/` (existing convention; `node --test`)
- New dirs: `src/promos/`, `src/parsers/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Skeleton dirs and module placeholders. No new deps (Constitution §III).

- [X] T001 [P] Create `src/promos/` directory with empty `index.js` re-export stub for `registry.js`, `recommend.js`, `betAndGet.js`
- [X] T002 [P] Create `src/parsers/` directory with empty `index.js` re-export stub for `betSlip.js`
- [X] T003 [P] Add empty test files `test/recommend.test.js`, `test/betAndGet.test.js`, `test/betSlip.test.js` each with a single passing placeholder `node:test` block

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding every US needs: registry shape, hedge extraction, storage keys, default-tab flip, legacy-calc Settings link.

**⚠️ CRITICAL**: No US work begins until Phase 2 complete.

- [X] T004 Define `PromoType` + `FieldDef` shape and write empty registry array in `src/promos/registry.js` per data-model.md §"PromoType" (no entries yet; US1/US2 fill them)
- [X] T005 Define `BestPlay` / `BestPlayAdvanced` / `HedgeLeg` JSDoc typedefs in `src/promos/recommend.js` per data-model.md §"BestPlay"
- [X] T006 Extract scanner hedge-pair loop from `popup/popup.js` into pure `recommendHedge(eventOdds, hedgeCandidates) → {hedgeBook, hedgeOdds, hedgeStake, lockedCash}` in `src/promos/recommend.js` per research.md R3. Pure: no DOM, no `chrome.*`, no `fetch`.
- [X] T007 Update `popup/popup.js` scanner code to import and use `recommendHedge` from `src/promos/recommend.js` (no behavior change — regression-checked in T050)
- [X] T008 Add `promoType` storage key handling in `popup/popup.js` (read on init, persist on change) per data-model.md §"Storage layout"
- [X] T009 Flip `advancedMode` default to `false` (Beginner) on first-launch in `popup/popup.js` per FR-008; existing users retain their prior value
- [X] T010 Add Best Play tab markup as the first/default tab in `popup/popup.html` (placeholder body — filled by T013); demote the four calculator tabs to a hidden container reachable from Settings
- [X] T011 Add "Open calculators" link in the Settings section of `popup/popup.html` that toggles visibility of the legacy calculator container per FR-012
- [X] T012 Mirror Advanced-Mode toggle inside Settings in `popup/popup.html` + wire in `popup/popup.js` per FR-008 and research.md R5 (keep existing top-right toggle as well for this spec)

**Checkpoint**: scaffold compiles in browser; existing scanner behavior unchanged; legacy calcs reachable from Settings; Beginner is default.

---

## Phase 3: User Story 1 — Convert a bonus bet with one card (Priority: P1) 🎯 MVP

**Goal**: User picks "Bonus Bet I already have", enters bonus amount, sees single Best Play card with locked-cash headline, +EV leg, hedge leg, "Show details". No EV anywhere.

**Independent Test**: Tester with no prior exposure picks Bonus Bet $150, follows card, locked profit ends within 1% of headline (quickstart.md Smoke A).

### Tests for User Story 1

- [X] T013 [P] [US1] Test `recommendBonusBet(inputs, providerEvents, userBooks)` in `test/recommend.test.js` — asserts `BestPlay` shape, `headline.kind === 'lockedCash'`, locked-cash within $0.01 of direct `src/calc/bonusBet.js` call (SC-003), `hedgeLegs.length === 1`, +EV book and hedge book differ (FR-010)
- [X] T014 [P] [US1] Test empty-state branch in `test/recommend.test.js` — when no event yields positive locked cash for the bonus amount and odds range, returns `null` or an empty-state sentinel (consumed by UI per FR-014)
- [X] T015 [P] [US1] Test single-book degrade in `test/recommend.test.js` — when `userBooks.length < 2`, returns degrade sentinel (UI renders FR-011 message)

### Implementation for User Story 1

- [X] T016 [US1] Add `bonus-bet` entry to registry in `src/promos/registry.js` with fields `bonusAmount` (money) and `targetOddsRange` (oddsRange, default `[300, 500]`) per research.md R4
- [X] T017 [US1] Implement `recommendBonusBet(inputs, providerEvents, userBooks)` in `src/promos/recommend.js` — composes `recommendHedge` (T006) with `src/calc/bonusBet.js` to return `BestPlay` per data-model.md
- [X] T018 [US1] American-odds formatter `formatAmericanOdds(odds) → "+150" | "-110"` in `src/ui/explanations.js` (always-sign per FR-005)
- [X] T019 [US1] Best Play card markup in `popup/popup.html` — headline, +EV leg block, hedge leg block, "Show details" disclosure (collapsed by default) per FR-004
- [X] T020 [US1] Best Play card CSS in `popup/popup.css` — headline-dominant layout; details panel hidden by default
- [X] T021 [US1] Render Best Play card from `BestPlay` object in `popup/popup.js` — read `promoType` + `PromoInputs`, call `recommendBonusBet`, paint card; "Show details" toggles details panel (formula line only — never EV, per FR-007)
- [X] T022 [US1] Empty-state renderer in `popup/popup.js` — one-line message + "widen odds range / re-scan" action when `recommend*` returns empty-state sentinel per FR-014
- [X] T023 [US1] Single-book degrade renderer in `popup/popup.js` — one-line message + route to Settings when degrade sentinel returned per FR-011

**Checkpoint**: Smoke A in quickstart.md passes. SC-001, SC-003, SC-006 satisfied for Bonus Bet alone. MVP demoable.

---

## Phase 4: User Story 2 — Promo-type picker routes correctly (Priority: P1)

**Goal**: Picker shows five sportsbook-language promo types. Each routes to the right calc. Bet & Get branches on mode (Beginner: two-stage floor; Advanced: net-EV).

**Independent Test**: Non-technical tester with a promo screenshot picks the matching type unaided, reaches a Best Play card, value matches legacy calc within $0.01 (quickstart.md Smoke B, C).

### Tests for User Story 2

- [X] T024 [P] [US2] Test `betAndGet.beginnerPlan` in `test/betAndGet.test.js` — qualifying-loss branch locked-cash equals `L1` (no bonus credit); composition with `bonusBet.js` for stage-2 verified per research.md R2
- [X] T025 [P] [US2] Test `betAndGet.advancedPlan` in `test/betAndGet.test.js` — `netEV = p_win * (payout_win + L2) - (1-p_win) * qualifyingStake` to within float tolerance per research.md R2
- [X] T026 [P] [US2] Test `recommendRiskFree`, `recommendDepositMatch`, `recommendOddsBoost` in `test/recommend.test.js` — each returns `BestPlay` with locked-cash matching the direct call to the corresponding `src/calc/*.js` to $0.01 (SC-003)
- [X] T027 [P] [US2] Test `recommendBetAndGet` mode branch in `test/recommend.test.js` — `mode: 'beginner'` returns `headline.kind === 'lockedCash'`; `mode: 'advanced'` returns `headline.kind === 'netEV'` (FR-016 invariant)

### Implementation for User Story 2

- [X] T028 [US2] Implement `beginnerPlan(qualifyingStake, bonusAmount, qualifyingOdds, hedgeOdds, bonusHedgeOdds, conversionRate)` in `src/promos/betAndGet.js` per research.md R2 (composes `bonusBet.js` for stage 2; `conversionRate` is the stage-2 bonus-to-cash factor `r`, sourced from the registry `FieldDef` added in T030)
- [X] T029 [US2] Implement `advancedPlan(qualifyingStake, bonusAmount, qualifyingOdds, bonusHedgeOdds, conversionRate)` in `src/promos/betAndGet.js` per research.md R2
- [X] T030 [US2] Add `bet-and-get`, `risk-free`, `deposit-match`, `profit-boost` entries to `src/promos/registry.js` with sportsbook-language labels per FR-002 and data-model.md. `bet-and-get` includes a `conversionRate` `FieldDef` (`type: 'percent'`, `default: 0.70`) so the user-supplied `r` flows into `beginnerPlan` / `advancedPlan`.
- [X] T031 [US2] Implement `recommendRiskFree`, `recommendDepositMatch`, `recommendOddsBoost`, `recommendBetAndGet` in `src/promos/recommend.js` — each composes the existing matching calc; Bet & Get dispatches on `inputs.mode` and returns `BestPlay` or `BestPlayAdvanced` per FR-016
- [X] T032 [US2] Promo-type picker UI in `popup/popup.html` — five options, sportsbook language only per FR-002
- [X] T033 [US2] Render input fields dynamically from `PromoType.fields` in `popup/popup.js` — only the selected type's fields visible per US2 scenario 2 and FR-003
- [X] T034 [US2] Persist selected `promoTypeId` to `chrome.storage.local` on change in `popup/popup.js` per FR-015
- [X] T035 [US2] Render two-stage card layout for Bet & Get Beginner in `popup/popup.js` + `popup/popup.html` — stage 1 (hedge now), stage 2 (deferred bonus plan), worst-case headline labeled "Guaranteed locked"
- [X] T036 [US2] Render Bet & Get Advanced card in `popup/popup.js` — unhedged qualifying play + deferred bonus hedge plan; headline labeled **Net EV** with clarifying copy (only place this label appears per FR-016 / SC-002)

**Checkpoint**: Smoke B + Smoke C pass. All five promo types route to correct calc with $0.01 parity (SC-003).

---

## Phase 5: User Story 3 — Bet-slip paste (Priority: P2)

**Goal**: Paste DK/FD bet slip → event, selection, odds, book auto-fill. Partial parse asks user to confirm missing piece (no silent auto-match). Full failure preserves typed inputs.

**Independent Test**: ≥9/10 representative DK + FD pastes parse correctly (quickstart.md Smoke D, SC-005).

### Tests for User Story 3

- [X] T037 [P] [US3] Test DK bet-slip shape parses in `test/betSlip.test.js` — fixture slips yield `{book: 'draftkings', event, selection, odds}` per research.md R1
- [X] T038 [P] [US3] Test FD bet-slip shape parses in `test/betSlip.test.js` — fixture slips yield `{book: 'fanduel', event, selection, odds}` per research.md R1
- [X] T039 [P] [US3] Test partial-parse and full-failure paths in `test/betSlip.test.js` — partial yields `BetSlipParse` with `null` for missing fields, `rawText` preserved; gibberish input yields all-null fields with `rawText` preserved (FR-009)
- [X] T040 [P] [US3] Test parlay rejection in `test/betSlip.test.js` — multi-leg slip returns a sentinel the UI can render as "parlays not supported" per Edge Cases

### Implementation for User Story 3

- [X] T041 [US3] Implement `parseBetSlip(text) → BetSlipParse` in `src/parsers/betSlip.js` — DK + FD heuristics per research.md R1; parlay-detect branch
- [X] T042 [US3] Add "Paste bet slip" textarea to Best Play card in `popup/popup.html`
- [X] T043 [US3] Wire paste handler in `popup/popup.js` — full parse fills all fields; partial parse fills recognized fields and renders a "confirm event" picker over currently scanned events per FR-009 (no silent auto-match)
- [X] T044 [US3] On parse failure, render one-line error in `popup/popup.js` and leave `rawText` visible + existing field values untouched per FR-009
- [X] T045 [US3] On parlay detect, render "Parlays aren't supported yet — paste a single-leg straight bet" message per Edge Cases

**Checkpoint**: Smoke D passes. SC-005 met against fixture corpus.

---

## Phase 6: User Story 4 — EV view is separate (Priority: P2)

**Goal**: EV tab visible only in Advanced Mode, never co-mingled with Best Play headline. Beginner default never renders the strings "EV" / "expected value" / "+EV".

**Independent Test**: Toggle mode; verify EV tab presence + absence; verify Best Play card never shows EV (quickstart.md Smoke E, SC-006).

- [X] T046 [US4] Add EV tab markup to `popup/popup.html` with `data-advanced-only="true"` next to Best Play tab per research.md R6
- [X] T047 [US4] Toggle EV tab visibility on `advancedMode` state change in `popup/popup.js` — show in Advanced, hide in Beginner; default hidden per FR-007
- [X] T048 [US4] Render EV per active promo type inside the EV tab in `popup/popup.js` — pulls EV from `BestPlay.showDetails.ev` (already computed by Phase 4 `recommend*` functions); label "if the bonus bet converts at your assumed rate" per US4 scenario 2
- [X] T049 [US4] Assert no "EV" / "expected value" / "+EV" strings render anywhere in default Beginner state — guard with a DOM-inspect check during dev (manual; verified via Smoke E)

**Checkpoint**: Smoke E passes. SC-006 verified by DOM inspection in Beginner default.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Regression parity, quickstart sign-off, agent context refresh.

- [ ] T050 Run scanner parity regression per quickstart.md §"Regression check" — top-10 hedges match pre-extraction baseline; commit baseline screenshots under `specs/001-best-play-card/regression/` if drift is acceptable and explainable
- [ ] T051 Execute all seven smoke tests in `specs/001-best-play-card/quickstart.md` end-to-end in an unpacked extension; record pass/fail per smoke in a session note
- [X] T052 Run `node --test test/` and confirm all new test files (`recommend.test.js`, `betAndGet.test.js`, `betSlip.test.js`) pass alongside existing `test/calc.test.js`
- [ ] T053 [P] Update CLAUDE.md `<!-- SPECKIT START -->` block if any plan-relative paths shifted during implementation (currently points at `specs/001-best-play-card/plan.md` — leave untouched if unchanged)
- [X] T054 Constitution post-implementation re-check — confirm `recommend.js`, `betAndGet.js`, `betSlip.js` remain pure (no DOM / no `chrome.*` / no `fetch`); confirm only `promoType` was added to `chrome.storage.local`; confirm no new runtime deps

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 (Setup): no deps — start immediately
- Phase 2 (Foundational): depends on Phase 1 — **blocks all user stories**
- Phase 3 (US1, P1): depends on Phase 2
- Phase 4 (US2, P1): depends on Phase 2; partially overlaps Phase 3 (different registry entries, different calcs) — see Parallel below
- Phase 5 (US3, P2): depends on Phase 2 — independent of US1/US2 functionally; touches `popup/popup.html` and `popup/popup.js`, so coordinate edits
- Phase 6 (US4, P2): depends on Phase 4 (EV values are populated by `recommend*` from Phase 4)
- Phase 7 (Polish): depends on all targeted stories complete

### Within Each User Story

- Tests written first per Phase 5 of plan workflow — assert they fail, then implement
- Calc / pure modules before UI wiring
- One promo type's full vertical slice (registry → recommend → render) before next type

### Parallel Opportunities

- T001 T002 T003 — all `[P]`, different files
- T004 T005 — both touch new files, can parallelize
- T013 T014 T015 — all `[P]`, same file but distinct test blocks (run sequentially in writing, but logically independent test cases)
- T024 T025 T026 T027 — `[P]`, independent test blocks
- T037 T038 T039 T040 — `[P]`, independent test blocks
- US3 (Phase 5) ↔ US4 (Phase 6) UI work: separate after Phase 4 completes
- T053 in Phase 7 is `[P]` relative to T050–T052

### Coordinated `popup/` edits

`popup/popup.html` and `popup/popup.js` are touched by T010, T011, T012, T019, T021, T032, T033, T035, T036, T042, T043, T044, T045, T046, T047, T048. Sequence by user story; do not parallelize edits to these two files across stories.

---

## Parallel Example: User Story 1 tests

```bash
# Write US1 tests in parallel:
Task: "Test recommendBonusBet shape + parity in test/recommend.test.js"  # T013
Task: "Test empty-state branch in test/recommend.test.js"                 # T014
Task: "Test single-book degrade in test/recommend.test.js"                # T015
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 (Setup)
2. Phase 2 (Foundational) — including scanner-loop extraction (T006/T007)
3. Phase 3 (US1) — Bonus Bet vertical slice
4. **STOP and VALIDATE** — Smoke A in quickstart.md; ship to friend cohort
5. Confirm SC-001 (≤60s open→both legs) and SC-006 (no "EV" string) before proceeding

### Incremental Delivery

1. MVP → demo
2. + US2 (other four promo types + Bet & Get math) → demo
3. + US3 (paste) → demo
4. + US4 (EV tab) → demo
5. Polish (Phase 7) → merge

### Story Sizing

- Phase 2: 1 day (extraction + scaffolding)
- US1: 1–2 days (one full vertical slice; the hard part is the card layout)
- US2: 2 days (four more registry entries + Bet & Get two-stage math + dynamic field rendering)
- US3: 1 day (parser + paste UI)
- US4: 0.5 day (tab toggle + EV surfacing)
- Polish: 0.5 day

---

## Notes

- All new math lives under `src/promos/` and stays pure (no DOM, no `chrome.*`, no `fetch`) per Constitution §I.
- `recommend.js` takes `providerEvents` as a parameter — must not import `src/api/provider.js` (Constitution §II).
- Zero new runtime npm deps (Constitution §III).
- Tests: `node --test test/` — no test framework added.
- Commit after each user-story phase completes (`/speckit-git-commit` hook will offer this between phases).
- Edge cases (single-book user, parlay paste, no-play empty state) covered by T014, T015, T022, T023, T045.
