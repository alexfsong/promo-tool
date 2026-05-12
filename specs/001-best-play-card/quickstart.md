# Quickstart: Best Play Card (spec 001)

Manual smoke test that exercises the full Best Play flow end-to-end. Run after `/speckit-implement` and before considering 001 ready to merge. Browser-only; nothing here is automated by `node --test`.

## Prerequisites

- Extension loaded unpacked at `chrome://extensions` from the repo root.
- The Odds API key set in Settings (or a vpsFeed URL if running against scraper).
- At least two sportsbooks selected in "My sportsbooks" — pick books likely to appear on both sides of common markets (e.g., DraftKings, FanDuel, BetMGM).
- Beginner Mode is on (first-launch default).

## Smoke test A — Bonus Bet, single-card conversion

**Goal**: covers US1 and FR-001–FR-006.

1. Open the side panel. Confirm the default tab is **Best Play**, not Calculators.
2. Tap the promo-type picker. Verify five options visible in sportsbook language:
   - Bonus Bet I already have
   - Bet & Get bonus bets
   - Risk-Free / No-Sweat First Bet
   - Deposit Match
   - Profit Boost / Odds Boost
3. Pick "Bonus Bet I already have". Enter `$150` as the bonus amount.
4. Tap "Find best play".
5. Verify the Best Play card shows, in order:
   - A single headline number labeled **Guaranteed locked $X.XX** (not "EV", not "average").
   - +EV leg: book, event, selection, odds (with explicit `+` / `-` sign), "use your bonus bet" label.
   - Hedge leg: a *different* book, event, selection, odds, exact cash stake in dollars and cents.
   - A small "Show details" affordance.
6. Tap "Show details". Verify the formula line appears and EV is **not** shown.
7. Confirm odds display in American format only on the card. Decimal is allowed only inside "Show details".

**Pass criteria**: SC-001 timing (≤60s open to both legs visible), SC-003 (locked-cash within $0.01 of `bonusBet.js` direct call), SC-006 (no "EV" / "expected value" string visible).

## Smoke test B — Promo-type picker routes correctly

**Goal**: covers US2 and FR-002, FR-003.

For each of the five promo types:

1. Pick the type.
2. Verify only that type's fields are visible (e.g., Deposit Match shows deposit amount + rollover; nothing else).
3. Enter representative values.
4. Verify the resulting card uses the right calculator (cross-check with the legacy tab under Settings → Open calculators).

**Pass criteria**: each promo type produces a Best Play numerically equivalent (to $0.01) to the legacy calculator's direct output.

## Smoke test C — Bet & Get math, Beginner vs Advanced

**Goal**: covers US2 scenario 3 and 4, FR-016.

Beginner branch:

1. Beginner Mode on. Pick "Bet & Get bonus bets". Enter $5 qualifying, $150 bonus.
2. Verify the card shows **two** plans: stage 1 (hedge the $5 now) and stage 2 (deferred bonus-bet plan once credited).
3. Headline is **Guaranteed locked**, equal to the worst-case branch (qualifying loses; no bonus credits).

Advanced branch:

1. Toggle Advanced Mode on. Re-pick "Bet & Get bonus bets". Same inputs.
2. Verify the card shows an **unhedged** qualifying play and a deferred bonus-bet plan.
3. Headline is labeled **Net EV** (and only here).

**Pass criteria**: math matches `betAndGet.js` direct calls; FR-016 invariant holds (Net EV headline appears only in Advanced Bet & Get).

## Smoke test D — Bet-slip paste, full and partial

**Goal**: covers US3 and FR-009.

Full parse:

1. From a DK bet slip, copy the slip text.
2. Paste into the Best Play card's paste field.
3. Verify event, selection, odds auto-fill. The detected sportsbook is highlighted as the +EV leg book.
4. Tap "Find best play". A Best Play card renders.

Partial parse:

1. Paste a snippet that contains odds and selection but no full event line (truncated copy).
2. Verify the recognized fields are pre-filled.
3. Verify the card asks the user to confirm the event from a list of currently scanned events (not silently auto-matched).

Full failure:

1. Paste an unrelated text block.
2. Verify a one-line error appears.
3. Verify the pasted text remains visible and any previously typed inputs are unchanged.

**Pass criteria**: SC-005 (≥9/10 representative DK + FD pastes parse correctly).

## Smoke test E — EV view (Advanced only)

**Goal**: covers US4 and FR-007.

1. Beginner Mode on. Verify there is **no** "EV" tab visible.
2. Toggle Advanced Mode on. Verify a new "EV" tab appears next to Best Play.
3. Open the EV tab. Verify it shows EV per active promo type, labeled "if the bonus bet converts at your assumed rate". The locked-cash headline is **not** shown on this tab.
4. Toggle Beginner Mode back on. Verify the EV tab disappears.

**Pass criteria**: FR-007 invariant (EV not visible outside Advanced + EV tab).

## Smoke test F — Single-book user, graceful degrade

**Goal**: covers Edge Cases and FR-011.

1. In Settings → My sportsbooks, leave only one book selected.
2. Open Best Play. Pick "Bonus Bet I already have". Enter $50.
3. Verify the card explains in one sentence that a cross-book hedge is not possible and routes to Settings.
4. Verify the card does **not** show a same-book "hedge" or a calculator fallback.

**Pass criteria**: FR-010 (no same-book hedges), FR-011 (graceful one-sentence explanation).

## Smoke test G — Legacy calculators still reachable

**Goal**: covers FR-012.

1. Open Settings. Tap "Open calculators".
2. Verify the four legacy tabs appear (Bonus Bet / Risk-Free / Deposit Match / Odds Boost).
3. Run a Bonus Bet calculation. Compare to a Best Play locked-cash from smoke test A.

**Pass criteria**: values match to $0.01; legacy tabs still functional and not the default surface.

## Regression check — existing scanner output

**Goal**: confirm R3 extraction did not regress.

1. Before merging 001: run the existing scanner against a known set of events, screenshot the top 10 hedges.
2. After merging 001: re-run the same scan. Top 10 should match.

**Pass criteria**: identical event/book/odds/stake tuples for the top 10 rows (or differences explainable by odds movement between runs).

## Definition of done for spec 001

- All seven smoke tests above pass.
- `npm test` passes; new tests for `recommend.js`, `betAndGet.js`, `betSlip.js` exist and pass.
- Tasks generated by `/speckit-tasks` are all complete.
- Spec 001 spec.md unchanged after this point, or any required edits are committed alongside the implementation as "spec drift" fixes.
