# Feature Specification: Book Health & Hedge Stake Split

**Feature Branch**: `002-book-health-and-stake-split`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User goal: "Make promo conversion feel guaranteed by removing the silent failure where a hedge bet gets refused or limited at the book. Track which books still take the user's action, and when a single hedge exceeds a book's accepted size, split the hedge across multiple books automatically."

## Context

Assumes [Brownfield Context](../000-brownfield-context/spec.md), [Constitution](../../.specify/memory/constitution.md), and [spec 001 Best Play Card](../001-best-play-card/spec.md). Spec 001 produces the card and warns when the recommended hedge "may exceed a book's limit" but does not split. This spec replaces that warning with a real split and adds per-book status tracking.

Failure mode this addresses: user is told to hedge $400 at Book B, Book B accepts only $50, user is now stuck holding an unhedged +EV leg or scrambling to manually split across books while odds move. The "guaranteed conversion" promise dies here in practice today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Per-book health status (Priority: P1)

The user maintains a per-book status for each sportsbook in "My sportsbooks": **healthy**, **limited**, or **banned**. Limited and banned books are still eligible as the **hedge leg** (the user is laying off, not extracting promo value), but are never recommended as the **+EV leg**.

**Why this priority**: Without this, every other feature in this spec degrades. Healthy/limited is the load-bearing distinction for hedge routing.

**Independent Test**: User flips a book from healthy to limited. Next scanner run does not surface that book as the +EV leg in any Best Play, but does still consider it for hedge legs. No other behavior changes.

**Acceptance Scenarios**:

1. **Given** Book A is marked "limited",
   **When** the scanner produces Best Plays,
   **Then** Book A appears only as a hedge leg, never as the +EV leg.
2. **Given** Book A is marked "banned",
   **When** the scanner produces Best Plays,
   **Then** Book A never appears in any leg of any recommendation.
3. **Given** a book was added to "My sportsbooks" before this spec shipped,
   **When** the user opens Settings,
   **Then** it defaults to "healthy" and the user can change status with one tap.

---

### User Story 2 — Stake split across hedge books (Priority: P1)

When the recommended hedge stake exceeds the known accepted limit of the single best hedge book, the Best Play card splits the hedge across two (or more) books at the closest available odds, computing each stake. The headline locked-cash number reflects the realized worst-case across the split.

**Why this priority**: This is the actionable answer to "Book B won't take my $400 hedge". Without it, the user falls back to manual math during a time-sensitive odds window — exactly the arithmetic-mistake mode the project is trying to eliminate.

**Independent Test**: Construct a scenario where the optimal single-book hedge is $400 but the chosen book's known limit is $50. The card shows two hedge legs ($50 at Book B and a complementary stake at Book C at similar odds) and a guaranteed locked-cash number computed across both. Math verified against a worked example.

**Acceptance Scenarios**:

1. **Given** the optimal hedge stake is $400 on Book B with known limit $50,
   **When** the Best Play card is shown,
   **Then** it shows hedge leg 1 ($50 at Book B) and hedge leg 2 (complementary cash stake at Book C at the next-best odds) and a single headline guaranteed-locked amount derived from the worst-case across both legs.
2. **Given** the user's "My sportsbooks" list has only one book that can hedge (others are banned),
   **When** that book's limit is too small,
   **Then** the card shows the partial hedge clearly and adds a one-line caution that part of the stake remains unhedged, with the computed worst-case dollar outcome shown (which may be a loss).
3. **Given** a split is required,
   **When** odds across the split books differ,
   **Then** the card displays a worst-case guaranteed-locked number based on the leg combination that pays the least if the +EV leg loses — never an average or best-case number.

---

### User Story 3 — Limit memory per book per market (Priority: P2)

The user can log the maximum stake a book actually accepted, scoped to market type (h2h / spread / total) and optionally to sport. The next Best Play uses that learned ceiling instead of a global default.

**Why this priority**: Hard-coding limits is brittle; books change limits per user. Learned ceilings are dramatically better than a static table over time. Lower priority than US1/US2 because a working split still helps even with rough defaults.

**Independent Test**: User logs "Book B accepted $50 on NBA h2h hedge". Next recommendation involving an NBA h2h hedge to Book B uses $50 as the ceiling. A non-NBA-h2h recommendation to Book B uses the default ceiling.

**Acceptance Scenarios**:

1. **Given** the user just placed a hedge,
   **When** they tap "log accepted stake" on the Best Play card,
   **Then** the entered amount is stored as the new ceiling for that (book, sport, market) triple.
2. **Given** a stored ceiling exists for (book, sport, market),
   **When** the next Best Play involves that triple,
   **Then** the stored ceiling is used in lieu of the default; the card optionally surfaces "based on your last limit of $X".
3. **Given** the user has never logged a limit for a (book, sport, market) triple,
   **When** a Best Play uses that triple,
   **Then** a conservative default ceiling applies (per-book; see Assumptions).

---

### User Story 4 — Hedge-leg book preference order (Priority: P2)

Hedge legs prefer books with deeper market liquidity and slower limits (e.g., Pinnacle if present, then a configurable preference order across the user's books), so a single-book hedge succeeds more often before a split is needed.

**Why this priority**: Reduces frequency of splits, simplifies the average card. Not strictly required if splits are reliable.

**Independent Test**: With Pinnacle in "My sportsbooks", a hedge that could be placed at Pinnacle or Book B at similar odds is routed to Pinnacle. Removing Pinnacle routes to Book B.

**Acceptance Scenarios**:

1. **Given** two books offer the hedge leg at the same odds,
   **When** the system picks a hedge book,
   **Then** it picks the one higher in the preference order (default: Pinnacle, BetMGM, Caesars, Fanatics, then user-list order).
2. **Given** the preference book's odds are worse by more than a configurable tolerance,
   **When** picking a hedge,
   **Then** the system picks the better-odds book even if lower in preference. Preference breaks ties; it does not overrule meaningful EV loss.

---

### Edge Cases

- **All books in "My sportsbooks" marked limited**: The card recommends the least-recently-limited book for the +EV leg with a one-line caution. Does not refuse to recommend.
- **No book has enough capacity to fully hedge even after a split across all books**: Card shows the largest fully-hedgeable bet at the displayed odds, with the locked-cash for that smaller bet, and notes "partial promo conversion only — you have hedge capacity for $X of your $Y bonus".
- **User logs an obviously wrong limit (e.g., $1,000,000 on a $50 hedge book)**: System accepts it; this spec does not police user-entered data. Defaults to manual override.
- **Sportsbook splits into multiple offerings (e.g., DK + DK+)**: Treated as one book by default. Spec 002 does not model sub-products.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store a per-book status of `healthy`, `limited`, or `banned` for every book in "My sportsbooks".
- **FR-002**: System MUST default new books to `healthy`.
- **FR-003**: System MUST exclude `limited` and `banned` books from +EV leg candidates.
- **FR-004**: System MUST exclude `banned` books from hedge leg candidates. `limited` books MUST remain eligible as hedge legs.
- **FR-005**: System MUST split the hedge across two or more eligible books when the single-book hedge stake would exceed the active ceiling for that book/market.
- **FR-006**: System MUST compute the headline locked-cash from the **worst case** across the split (the combination that pays least if the +EV leg loses), never the average or best case.
- **FR-007**: System MUST allow the user to log a per-(book, sport, market) ceiling. The ceiling MUST persist across sessions via `chrome.storage.local`.
- **FR-008**: System MUST apply a stored ceiling in preference to the default ceiling. A configurable default ceiling MUST exist per book.
- **FR-009**: System MUST apply a hedge-book preference order (default ordering specified in Assumptions, editable in Settings) as a tiebreaker for equal-odds hedge legs.
- **FR-010**: System MUST surface the active ceiling source ("default" or "based on your last limit of $X") on the Best Play card's details panel.
- **FR-011**: System MUST never recommend a same-book hedge, including in a split scenario (no two split legs are at the same book).
- **FR-012**: System MUST display partial-hedge scenarios honestly: when capacity is insufficient, the card MUST show the largest fully-hedged stake and explain the residual unhedged amount.
- **FR-013**: System MUST persist per-book status and per-(book, sport, market) ceilings under namespaced `chrome.storage.local` keys; MUST NOT introduce a new credential storage key (Constitution §V).
- **FR-014**: System MUST NOT block recommendations when all books are `limited`. It MUST instead surface the best available option with a single caution line.
- **FR-015**: System MUST place the per-book status control in the existing "My sportsbooks" Settings surface rather than creating a separate page.

### Key Entities

- **Book status**: One of `healthy`, `limited`, `banned`. Per book, user-owned. Affects routing only.
- **Stake ceiling**: A number stored per `(book, sport, market)` triple. Sources: explicit user log, per-book default. Used to cap hedge-leg stakes before split.
- **Hedge plan**: A list of one-or-more hedge legs (book, selection, odds, cash stake) plus the +EV leg, plus the worst-case locked-cash across the combination.
- **Book preference order**: Ordered list of books used as a tiebreaker. Default seeded; editable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the optimal hedge exceeds a book's stored ceiling, the user sees a working multi-book split in the Best Play card in **0 additional steps** (no extra clicks vs the single-hedge case).
- **SC-002**: The displayed headline locked-cash matches the worst-case realized outcome (over the user's actual placed bets) within **$0.01** for split scenarios in ≥**95%** of cases in friend-cohort use.
- **SC-003**: Across one month of friend-cohort use, **zero** instances of "the hedge got refused / capped and now I'm exposed" reported, compared to a non-zero baseline.
- **SC-004**: The per-book status UI is reachable in **≤2 taps** from the side panel root.
- **SC-005**: A book that has been marked `limited` does not appear as the +EV leg in any subsequent scan (verified by inspecting Best Play output for the next 10 recommendations after marking).

## Assumptions

- "My sportsbooks" already exists as the source of truth for which books the user has accounts at (Brownfield §3). This spec extends it; it does not replace it.
- The Best Play card (spec 001) is the single surface that consumes hedge plans. The four legacy calculator tabs do not need to learn about splits.
- Default per-book ceilings (seeded values, editable): Pinnacle = effectively unlimited (e.g., $5,000), BetMGM/Caesars = $500, DraftKings/FanDuel/BetRivers = $100, all others = $50. These are educated guesses; they get refined as users log real limits.
- Default hedge-book preference: Pinnacle → BetMGM → Caesars → Fanatics → ESPN BET → user-list order. Editable in Settings.
- All math added in this spec lands as pure functions in `src/calc/` (Constitution §I) — specifically the split-stake solver. Existing bonus-bet hedge math is the single-book special case.
- The provider abstraction (Constitution §II) does not change. This spec is downstream of provider data.
- Per-(book, sport, market) ceilings are stored under a single namespaced key (e.g., `bookCeilings`) as a flat map keyed by a composite string. No new storage subsystem.
- Spec 003 (promo inbox + recipes) and spec 004 (odds hygiene) are independent and can ship before or after this one. This spec adds no upstream dependency on them.
- This spec does **not** auto-detect when a bet gets refused or limited at the book — there is no sportsbook session integration (Constitution §VI). All status changes are user-entered.
