# Feature Specification: Best Play Card

**Feature Branch**: `001-best-play-card`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User goal: "Tell the user exactly the best play available to convert the promo. Simplicity is king. Users should feel a promo conversion is guaranteed, not a coin flip. Kill three failure modes: arithmetic mistakes, picking the wrong calculator/conversion type, and reading odds in the wrong format."

## Context

This spec assumes the [Brownfield Context](../000-brownfield-context/spec.md)
and adheres to the [Constitution](../../.specify/memory/constitution.md). In
particular:

- Calculator purity (Constitution §I) — all math added here lives in
  `src/calc/` as pure functions.
- Provider abstraction (Constitution §II) — reads odds through
  `src/api/provider.js`, no provider-specific code in the UI.
- No build step (Constitution §III) — pure ES modules, no new runtime deps.
- Side panel surface (Constitution §IV).
- EV is a separate concern from locked-cash and is **never** the headline
  number (per user direction 2026-05-12).

This feature replaces the four-tab calculator UI (Bonus Bet / Risk-Free /
Deposit Match / Odds Boost) as the **default** entrypoint for converting a
promo. The four calculators are not deleted; they move behind an "open
calculator" affordance for power users.

## Clarifications

### Session 2026-05-12

- Q: Where does the EV view live in the UI? → A: A dedicated tab in the side panel, visible only when Advanced Mode is on; hidden in Beginner default.
- Q: How does the Best Play card handle a Bet & Get promo's qualifying-bet stage? → A: Mode-dependent. Beginner Mode: hedge both stages (qualifying bet + bonus bet on credit) for a guaranteed floor. Advanced Mode: skip the qualifying-bet hedge, place qualifying unhedged on the +EV side, hedge only the bonus once credited; tool shows the resulting net EV.
- Q: Where does the promo-type registry live? → A: `src/promos/registry.js`. New top-level module that imports calculators from `src/calc/`, exports user-facing labels + field shapes + calculator wiring. Spec 003's recipe library also lands under `src/promos/`.
- Q: How does the user reach the legacy four calculator tabs? → A: Link in Settings labeled "Open calculators". Not a default-visible tab. Keeps the main surface clean while preserving the safety-net fallback for the maintainer.
- Q: On a partial bet-slip paste, what does the card do? → A: Pre-fill the parsed fields, then ask the user to confirm the missing piece (typically event selection from a short list of currently scanned events). No silent auto-match against scanner data — prevents wrong-event picks when team names collide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Convert a bonus bet with one card (Priority: P1)

A friend with no betting math background has been credited a $150 bonus bet
on DraftKings after their first deposit. They open the extension, pick the
promo type "Bonus Bet", paste or type the bonus bet amount, and the
extension shows a single card naming the exact event, the leg to place at
DraftKings, the hedge leg to place at another sportsbook they have, the
exact stake to enter on the hedge slip, and the guaranteed cash they will
lock in. No calculator tab choice, no odds-format choice, no
hedge-calculation step exposed.

**Why this priority**: This is the dominant promo type (bonus bets account
for the majority of value the tool currently captures) and is where the
"wrong calculator / wrong arithmetic" failure mode hurts most.
Delivering this alone is a viable MVP.

**Independent Test**: A user with no prior tool exposure picks
"Bonus Bet $150", sees a single recommended play, places both legs as
instructed, and ends up with a locked profit within 1% of the displayed
number. Tested with at least one bonus bet at conversion rate ≥70%.

**Acceptance Scenarios**:

1. **Given** the user has a $150 bonus bet on Book A and at least one
   other sportsbook in "My sportsbooks",
   **When** they pick promo type "Bonus Bet" and enter the bonus amount,
   **Then** they see a Best Play card with: event name, market type, the
   leg to place on Book A (team, odds, "bonus bet" label), the hedge leg
   to place on Book B (team, odds, exact cash stake), and the guaranteed
   locked cash amount as the headline number.
2. **Given** the Best Play card is shown,
   **When** the user looks at the card,
   **Then** no calculators, odds-format toggles, decimal/American
   selectors, or hedge-formula details are visible by default. A single
   "Show details" affordance reveals them on demand.
3. **Given** the recommended play uses odds on a leg the user could not
   reasonably read at a glance,
   **When** the card is rendered,
   **Then** odds are displayed in American format with a `+` or `-` sign
   always present (no decimal, no implied probability) and the stake is
   rounded to the cent the sportsbook actually accepts.
4. **Given** no event currently produces a positive locked-cash outcome
   for the user's bonus bet amount across their books,
   **When** the user asks for a Best Play,
   **Then** the card explains the situation in one sentence ("No
   conversion above $X locked right now — try again later or widen the
   odds range") and offers a single action (re-scan / change odds range)
   rather than showing a calculator.

---

### User Story 2 — Promo-type picker routes to the right math (Priority: P1)

The user identifies the promo by what the sportsbook called it
("Bet $5, Get $150 in bonus bets", "No-Sweat First Bet up to $1,000",
"50% Deposit Match up to $1,000", "+50% Profit Boost on any NFL parlay"),
not by which calculator file to open. The extension shows a single picker
keyed on these names and routes inputs to the right underlying calc.

**Why this priority**: Picking the wrong calculator is one of the three
stated failure modes. Promo-type names are stable; calculator names are
internal.

**Independent Test**: Show the picker to a non-technical user with a
specific real promo screenshot in hand. They can pick the right promo
type without help and reach a Best Play card. Verified for all four
existing promo types.

**Acceptance Scenarios**:

1. **Given** the picker is shown,
   **When** the user looks at the options,
   **Then** they see promo-type labels in the language sportsbooks use
   (e.g., "Bonus Bet I already have", "Bet & Get bonus bets", "Risk-Free
   / No-Sweat First Bet", "Deposit Match", "Profit Boost / Odds Boost"),
   not "Bonus Bet calculator" / "Odds Boost calculator".
2. **Given** the user picks a promo type,
   **When** input fields appear,
   **Then** only the fields needed for that promo type are visible (e.g.,
   Deposit Match shows the deposit amount and rollover requirement; it
   does not show hedge book selection until rollover is unlocked).
3. **Given** the user picks "Bet & Get bonus bets" in **Beginner Mode**,
   **When** they enter the qualifying bet amount and the bonus amount,
   **Then** the extension produces a Best Play with **two hedge plans**:
   (a) the qualifying-bet leg + cross-book hedge so the user is never
   exposed during stage 1; (b) a deferred plan for the bonus bet to be
   actioned once it credits. The headline locked-cash is the worst-case
   sum across both stages.
4. **Given** the user picks "Bet & Get bonus bets" in **Advanced Mode**,
   **When** they enter the qualifying bet amount and the bonus amount,
   **Then** the extension shows the qualifying bet as an **unhedged**
   +EV play (with EV displayed), and a deferred plan to hedge only the
   bonus once it credits. Headline is **net EV**, not locked cash.

---

### User Story 3 — Bet-slip paste eliminates odds typing (Priority: P2)

The user has a sportsbook bet slip open. Instead of reading and re-typing
the odds (and possibly mistaking `+200` for `2.00`), they copy the slip
text and paste it into the extension. The extension parses out event,
market, selection, and odds, and pre-fills the Best Play inputs.

**Why this priority**: Removes the American/decimal confusion and the
typo-during-transcription failure mode. Independent of US1/US2 — they
work without it but with more friction.

**Independent Test**: Copy a representative bet slip from each of DK and
FD into the extension. Both parse to the correct event + odds in ≥9 out
of 10 tries. When parse fails, the extension says so and falls back to
manual entry without losing what was already typed.

**Acceptance Scenarios**:

1. **Given** the user has copied bet slip text from a DraftKings or
   FanDuel bet slip,
   **When** they paste into the Best Play card's "paste bet slip" field,
   **Then** event name, selection name, and odds are auto-filled, and the
   detected sportsbook is highlighted as the +EV leg book.
2. **Given** the parser extracts some fields but not others (e.g.,
   selection + odds but no event identifier),
   **When** the user submits the paste,
   **Then** the recognized fields are pre-filled and the card asks the
   user to confirm the missing piece (e.g., pick the event from a short
   list of currently scanned events). The system MUST NOT silently
   auto-match against scanner data.
3. **Given** the pasted text cannot be parsed at all,
   **When** parsing fails,
   **Then** the extension shows a single short message; existing input
   values are preserved and the original pasted text remains visible so
   the user can keep what they had. No inputs are wiped.

---

### User Story 4 — EV view is separate (Priority: P2)

A power user wants to compare promos by EV, not by guaranteed locked
cash, to estimate yearly value of an ongoing promo. They open a separate
EV view that shows EV per promo type, never co-mingled with the Best
Play card.

**Why this priority**: User explicitly directed (2026-05-12) that EV is
useful but must be separated from the headline so non-technical users
are never confused about whether the number is "if I win" vs
"guaranteed".

**Independent Test**: Toggle EV view. Confirm that the Best Play card on
the main view shows only locked-cash, and that the EV view shows EV
without showing locked-cash as a peer metric.

**Acceptance Scenarios**:

1. **Given** the user is on the Best Play card,
   **When** they read the headline number,
   **Then** it is labeled "Guaranteed locked" (or equivalent
   worst-case phrasing) in dollars and cents, never "EV", never
   "expected value", never a probability-weighted number.
2. **Given** the user opens the EV tab (Advanced Mode on),
   **When** EV is displayed,
   **Then** the locked-cash headline is not shown on the same view;
   EV stands alone, labeled explicitly as "if the bonus bet converts at
   your assumed rate" (or analogous per promo type).
3. **Given** the user is in Beginner Mode (the default),
   **When** they look anywhere in the extension,
   **Then** the EV tab is not visible and EV does not appear elsewhere
   in the UI. Toggling Advanced Mode reveals the tab.

---

### Edge Cases

- **Only one sportsbook in "My sportsbooks"**: The card cannot recommend a
  cross-book hedge. It explains this in one sentence and links to
  Settings to add more books. It does not silently produce a same-book
  hedge.
- **Bonus bet > free-bet maximum supported by any single hedge book in the
  user's list**: The card shows the play with a single warning ("Hedge
  stake may exceed Book B's typical limit — split feature coming") but
  does not block. (Splitting is owned by spec 002.)
- **Promo expiry has passed or no events fall inside the bonus-bet odds
  range (default +300 to +500)**: The card shows the no-play empty state
  with a one-line reason and a "widen odds range" affordance.
- **Provider returns no odds for any active sport**: The card shows
  a provider-level error ("Couldn't reach the odds source — check
  Settings"), not a math error.
- **User pastes a parlay bet slip into the paste field**: The card
  rejects with a single sentence ("Parlays aren't supported yet — paste a
  single-leg straight bet") and leaves their text intact.
- **Odds moved between scan and bet placement**: User-visible at the
  sportsbook bet slip. Out of scope for this spec (deferred to spec 004).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a single primary view — the "Best Play"
  view — as the default tab when the side panel opens.
- **FR-002**: System MUST offer a promo-type picker keyed on sportsbook
  promo language ("Bonus Bet I already have", "Bet & Get", "Risk-Free /
  No-Sweat", "Deposit Match", "Profit Boost / Odds Boost"). The picker
  MUST NOT expose calculator-internal names.
- **FR-003**: System MUST route the selected promo type to the correct
  pure calculator under `src/calc/` without exposing that mapping to the
  user.
- **FR-004**: System MUST display, on the Best Play card, exactly these
  elements in this order: (a) headline locked-cash amount; (b) +EV leg
  instruction (book, event, selection, odds, stake or "use your bonus
  bet"); (c) hedge leg instruction (book, event, selection, odds, exact
  cash stake rounded to a stake the book accepts); (d) a single "Show
  details" affordance.
- **FR-005**: System MUST display odds in American format with an
  explicit `+` or `-` sign on every card by default. A details panel MAY
  show decimal as a secondary value.
- **FR-006**: System MUST round each hedge stake to $0.01. Per-book stake
  increments and minimums are out of scope here; spec 002 owns them.
- **FR-007**: System MUST NOT show EV on the Best Play card or any
  default-Beginner view. EV MUST be available only via a dedicated
  side-panel tab that is hidden by default and revealed when Advanced
  Mode is toggled on.
- **FR-008**: System MUST default Beginner Mode on first launch. Advanced
  Mode MUST be a single toggle in settings, not a per-card toggle.
- **FR-009**: System MUST allow the user to paste sportsbook bet-slip
  text into a single field and MUST attempt to extract event, selection,
  and odds. On full parse failure, system MUST preserve the user's pasted
  text and existing field values. On partial parse, the system MUST
  pre-fill the recognized fields and prompt the user to confirm the
  missing piece (typically event selection); it MUST NOT silently
  auto-match against scanner data.
- **FR-010**: System MUST recommend only cross-book hedges (the +EV leg
  and the hedge leg on different sportsbooks). It MUST NOT recommend
  same-book hedges.
- **FR-011**: System MUST gracefully degrade when "My sportsbooks"
  contains fewer than two books — the card MUST explain this in one
  sentence and route to Settings.
- **FR-012**: System MUST keep the four legacy calculator tabs reachable
  via a single "Open calculators" link in Settings. The legacy tabs
  MUST NOT appear as a default-visible tab in the side panel.
- **FR-013**: System MUST display the recommended hedge with the cash
  stake the user types into the book's slip — not a pre-tax amount,
  bonus-bet face value, or implied-probability number.
- **FR-014**: System MUST present an empty-state message in plain
  language when no recommendation is available, instead of showing a
  calculator or numeric zero.
- **FR-015**: System MUST persist the selected promo type and Beginner /
  Advanced state across sessions via `chrome.storage.local`.
- **FR-016**: For "Bet & Get" promos, system MUST branch on mode.
  Beginner Mode: produce a two-stage hedge plan (qualifying-bet hedge +
  deferred bonus-bet plan) with a worst-case locked-cash headline.
  Advanced Mode: produce an unhedged qualifying-bet play + deferred
  bonus-bet hedge plan, with a net-EV headline. This is the **only**
  case in this spec where a non-locked-cash headline appears, and it
  appears only in Advanced Mode.

### Key Entities

- **Promo**: A sportsbook offer the user is trying to convert. Has a
  type (Bonus Bet / Bet & Get / Risk-Free / Deposit Match / Profit
  Boost), a source sportsbook, a face amount, and (for some types) an
  expiry. Per-instance state lives in the user's head; the tool stores
  only the *type* and *amount* of the active promo being worked on.
- **Best Play**: A computed recommendation. Composed of: target event,
  +EV leg (book + selection + odds + stake or "bonus bet"), hedge leg
  (book + selection + odds + cash stake), guaranteed locked cash,
  optional EV (advanced/EV view only). Derived; not persisted long-term.
- **User's books**: The set of sportsbooks the user has accounts at
  (already persisted as "My sportsbooks"). Used to constrain hedge-leg
  candidates. Per-book status (healthy/limited/banned) is owned by
  spec 002 and out of scope here.
- **Promo type definition**: A registry entry mapping
  user-facing-promo-name → pure-calculator module → required input
  fields. Lives in `src/promos/registry.js`. The `src/promos/` directory
  is new in this spec and will also host spec 003's recipe library.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who has never opened the tool before can convert a
  single bonus bet end-to-end in **under 60 seconds** from opening the
  side panel to having both legs visible in their respective sportsbook
  bet slips.
- **SC-002**: ≥**90%** of test users (informal: friend cohort) describe
  the headline number as "guaranteed" or "locked" in their own words,
  with **0%** describing it as "expected" / "average" / "if I win".
- **SC-003**: For at least the four currently shipped calculator types,
  the Best Play card produces a recommendation whose locked-cash value
  matches the legacy calculator's output to within **$0.01** (rounded
  to the books' accepted increment).
- **SC-004**: Across one month of friend-cohort use, the rate of "I bet
  the wrong amount" or "I bet on the wrong side" support questions
  drops to **zero**, measured against any historical baseline available
  in chat logs.
- **SC-005**: Bet-slip paste parses correctly on at least **9 out of 10**
  representative pastes from DK and FD each.
- **SC-006**: Beginner-mode users never see the strings "EV" or
  "expected value" or "+EV" anywhere in the default UI (verified by
  inspection of rendered DOM in default state).

## Assumptions

- The four pure calculators under `src/calc/` are correct and their unit
  tests pass. This spec rewires the UI on top of them; it does not
  re-implement the math. Any math the card adds (e.g., combined
  Bet & Get two-stage math) lands as a new pure module under
  `src/calc/`, with its own tests, per Constitution §I.
- The provider abstraction (`src/api/provider.js`) is the only data
  source for odds. No new provider work in this spec.
- "My sportsbooks" already exists as a multi-select setting and is the
  source of truth for the user's books.
- Beginner Mode is currently a per-session toggle; this spec promotes it
  to the default-on, settings-level toggle described in FR-008.
- The four legacy calculator tabs remain in the codebase for at least
  this release; FR-012 keeps them reachable. They can be removed in a
  later spec once Best Play is proven to cover every case.
- EV math for each promo type either already exists in `src/calc/` or
  will be exposed as a separate pure function with the same input
  shape; the EV view in US4 surfaces those values without modifying the
  Best Play card.
- Bet-slip parsers are best-effort regex/heuristic over rendered bet-slip
  text only. No DOM scraping, no logged-in session access to the
  sportsbook. Parse failures are expected and handled.
- Spec 002 (book health + stake split) will add per-book limit handling
  later. Until then, the Best Play card warns but does not split.
- Spec 003 (promo inbox + recipes) will add prebuilt promo recipes
  later. Until then, the user enters the promo amount manually.
- Spec 004 (odds hygiene) owns no-live filtering at the provider boundary
  and the odds-age badge. Best Play card consumes already-filtered data
  from the provider abstraction; this spec does not need its own no-live
  gate.
