# Feature Specification: Promo Inbox & Recipes

**Feature Branch**: `003-promo-inbox-and-recipes`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User goal: "Lower the friction further for friends. Don't make the user describe their promo from scratch every time. Provide prebuilt recipes for common promos. Track what they've already converted. Let them share a recommendation with a friend."

## Context

Assumes [Brownfield Context](../000-brownfield-context/spec.md), [Constitution](../../.specify/memory/constitution.md), and [spec 001 Best Play Card](../001-best-play-card/spec.md). Spec 001 makes the user pick a promo type and type the bonus amount. This spec replaces that flow for the common case: user picks an active promo from an inbox, the right inputs are pre-filled, and the Best Play card renders directly.

This spec also creates the **completion log** — the cumulative locked-cash tally that makes the user feel the tool is producing real, compounding value, not just one-shot estimates.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Promo recipe library (Priority: P1)

The user opens the Promo Inbox, sees a curated list of currently-active promos at the sportsbooks in "My sportsbooks" (e.g., "DraftKings: Bet $5, Get $150 in bonus bets — new user"), taps one, and lands on a Best Play card with the right promo type, sportsbook, and amounts pre-filled.

**Why this priority**: This is the dominant share-with-friends path. A friend doesn't know what a "no-sweat first bet" is or that bonus bets need a different calc than profit boosts; the recipe encodes that.

**Independent Test**: A user with at least one book in "My sportsbooks" opens the inbox and sees recipes only for their books. Tapping a recipe produces a Best Play card identical to what spec 001 would produce given manually-entered fields, in ≤2 taps from side panel open.

**Acceptance Scenarios**:

1. **Given** the user has DraftKings and FanDuel in "My sportsbooks",
   **When** they open the Promo Inbox,
   **Then** they see only recipes for those two books, not recipes for books they don't have.
2. **Given** a recipe is for a "new user" promo,
   **When** the user taps the recipe,
   **Then** the system asks once whether they qualify (and optionally remembers their answer per book) before producing a Best Play.
3. **Given** a recipe's parameters include both a qualifying bet amount and a bonus-bet amount,
   **When** the user taps the recipe,
   **Then** the Best Play card pre-fills both fields and routes to the multi-stage promo math (per spec 001 US2).

---

### User Story 2 — Paste promo terms (Priority: P2)

The user pastes the marketing/terms text of a sportsbook promo they saw in an email or on the promos page. The extension parses out the promo type, the sportsbook (if recognizable), and the amount, and pre-fills the inputs. Falls back to manual entry if parsing fails.

**Why this priority**: Recipe library will never cover every promo. Pasting closes the gap. Lower priority than US1 because pasting is rarer than picking from a list.

**Independent Test**: Paste 3 sample promo blurbs from real DK/FD emails. At least 2 parse successfully; the third falls back gracefully to a pre-filled-as-much-as-possible Best Play card.

**Acceptance Scenarios**:

1. **Given** the user pastes "Bet $5 on any NBA game, get $150 in bonus bets if your bet wins",
   **When** parsing runs,
   **Then** promo type = "Bet & Get", qualifying amount = $5, bonus amount = $150, sport hint = NBA.
2. **Given** parsing fails,
   **When** the user submits the paste,
   **Then** the parsed-so-far fields are pre-filled, the rest is blank, and the original pasted text remains visible for the user to copy back out.

---

### User Story 3 — Promo deadline tracking (Priority: P2)

Active promos have expiries. The user adds a recipe (or pasted promo) to their active list with an expiry date; the inbox sorts by urgency; the user gets a single in-extension warning when a promo is within 24 hours of expiry.

**Why this priority**: Bonus bets commonly expire 7 days after credit and money is left on the table. Independent of US1/US2.

**Independent Test**: Add a promo with expiry 12 hours out. The inbox shows it at the top, flagged. Add another with expiry 5 days out. The 12-hour promo sorts first.

**Acceptance Scenarios**:

1. **Given** the user added a promo with expiry 2026-05-13 18:00,
   **When** they open the side panel on 2026-05-13 06:00,
   **Then** the promo is flagged "expires in 12 hours" and pinned to the top of the inbox.
2. **Given** a promo has expired,
   **When** the side panel opens,
   **Then** the expired promo moves to a "missed / expired" section (or hides, configurable) and does not block the inbox.

---

### User Story 4 — Completion log & running total (Priority: P2)

After placing both legs of a Best Play, the user taps "Done" on the card. The Best Play is recorded with its date, books, promo type, and locked-cash amount. A lifetime running total appears on the Promo Inbox header. The log is a flat list, exportable as plain text.

**Why this priority**: The compounding-value feeling is what keeps the user engaged. Also doubles as the audit trail when the friend asks "did this thing actually work?".

**Independent Test**: Complete three Best Plays over a session. The header shows the sum of their locked-cash values. Export produces a plain-text list with each entry on its own line.

**Acceptance Scenarios**:

1. **Given** the user has completed a Best Play with locked cash $73.40,
   **When** they tap "Done",
   **Then** the entry is appended to the log and the header total increases by $73.40.
2. **Given** the user has 12 entries in the log,
   **When** they tap "Export",
   **Then** they get a copy-paste plain-text block, one line per entry, with date / books / promo type / locked cash.
3. **Given** the user wants to remove an erroneous entry,
   **When** they tap an entry,
   **Then** they can delete it; the running total updates accordingly.

---

### User Story 5 — Share a recommendation (Priority: P3)

The user can export a single Best Play as a copyable short text block, suitable for pasting in a chat with a friend who does not have the extension. The block lists the two legs in plain English, includes a one-line "this is a hedge, both legs intentional" note, and shows the locked cash amount. No EV. No math.

**Why this priority**: Optional nicety. Validates the "for friends" identity of the product. Not required for the tool to work.

**Independent Test**: Export a Best Play. Paste into a text editor. A non-technical reader can read it and place both bets without the extension.

**Acceptance Scenarios**:

1. **Given** a Best Play is on screen,
   **When** the user taps "Share",
   **Then** a plain-text block is copied to clipboard with: book + leg + odds + stake for each leg, the locked cash, and the time stamp.
2. **Given** the exported text contains no internal jargon,
   **When** a friend reads it,
   **Then** they can understand and act on it without seeing the extension UI.

---

### Edge Cases

- **Recipe says "new user only" and user has already redeemed it on that book**: User can mark "already redeemed at Book X" and the inbox hides that recipe for that book going forward, until the user reverses it.
- **Two recipes overlap (same promo offered repeatedly)**: De-duplicate by (book, promo type, amount) so the inbox shows a single entry.
- **Recipe outdated (promo no longer offered)**: Recipes have a freshness field; stale recipes hide unless the user explicitly opts in to "show stale".
- **Completion log gets large (>1000 entries)**: Acceptable. Plain-text only; no perf optimization in this spec.
- **Pasting a promo that has no hedging strategy (e.g., a free entry to a sweepstakes)**: Inbox accepts; Best Play card explains "not a hedgeable promo" and stops cleanly rather than crashing.
- **No active recipes for the user's books**: Inbox shows an empty state with a one-tap "paste a promo" affordance.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Promo Inbox view reachable in ≤1 tap from the side panel root.
- **FR-002**: System MUST ship a recipe library covering at minimum: DraftKings, FanDuel, BetMGM, Caesars, ESPN BET, Fanatics, BetRivers. Each entry MUST specify book, promo type, amounts, target eligibility (new user / existing / either), and a freshness date.
- **FR-003**: System MUST filter the inbox to recipes for books in the user's "My sportsbooks" list.
- **FR-004**: System MUST allow users to mark a recipe as "already redeemed at Book X" so it hides for that book until reversed.
- **FR-005**: System MUST allow users to paste arbitrary promo terms text and attempt to parse promo type, book, and amounts. On parse failure, MUST pre-fill the recognized fields and leave the rest blank without losing the user's text.
- **FR-006**: System MUST support optional expiry dates on user-added promos. The inbox MUST sort by urgency, flag promos within 24 hours of expiry, and move expired entries to a separate section.
- **FR-007**: System MUST provide a "Done" action on the Best Play card that appends an entry to the completion log.
- **FR-008**: Each completion-log entry MUST record date, books, promo type, and locked-cash amount.
- **FR-009**: System MUST display a lifetime locked-cash total on the Promo Inbox header, derived from the completion log.
- **FR-010**: System MUST provide a plain-text export of the completion log (clipboard copy).
- **FR-011**: System MUST allow deleting individual completion-log entries; deletions MUST update the running total.
- **FR-012**: System MUST provide a "Share" action on the Best Play card that copies a plain-text recommendation to the clipboard with no EV, no internal jargon, and no extension-specific URLs.
- **FR-013**: System MUST ship the recipe library as a static, dep-free JSON or JS module under `src/promos/` (or equivalent). Updating recipes MUST NOT require a build step (Constitution §III).
- **FR-014**: System MUST persist the inbox state (added promos, redeemed-recipe marks, completion log) under `chrome.storage.local`.
- **FR-015**: System MUST default to hiding stale recipes (freshness older than 60 days). An "include stale" toggle MUST exist.
- **FR-016**: Recipes for "new user" promos MUST ask once whether the user qualifies for each book and remember the answer per (recipe, book).

### Key Entities

- **Recipe**: Static catalog entry. Fields: book, promo type, qualifying amount, bonus amount (if applicable), eligibility (new/existing/either), expiry pattern (if known), freshness date, optional sport hint, optional terms link.
- **Active promo**: User-instantiated promo (from a recipe or paste). Fields: source recipe id or null, book, promo type, amounts, optional expiry, eligibility verified.
- **Completion entry**: Locked-in record of a Best Play the user marked Done. Immutable except via explicit delete. Fields: timestamp, books (+EV and hedge), promo type, locked cash.
- **Lifetime total**: Sum of completion-entry locked-cash values. Derived; not stored independently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Time from "open side panel" to "Best Play card visible" for a recipe-based promo drops to **≤2 taps**, vs. ~5+ taps in the spec 001 baseline (open → pick promo type → enter book → enter amount → submit).
- **SC-002**: Recipe library covers **≥80%** of the promos the user / friend cohort actually encounter, measured by self-report over one month.
- **SC-003**: ≥**70%** of friend-cohort users report the lifetime total figure influenced their decision to keep using the tool (informal feedback over one month).
- **SC-004**: A friend with no extension installed can place a bet from a "Share" export with **zero** clarifying questions in ≥80% of attempted shares.
- **SC-005**: Inbox open with **0** matching recipes produces a non-empty UI (empty-state copy + paste affordance), not a blank panel.

## Assumptions

- The recipe library is curated by the maintainer (currently the user), updated by editing static files in the repo. No CMS, no remote fetch, no automatic promo discovery in this spec.
- Recipes are best-effort representations of public marketing. The system does not warrant a recipe is currently offered or that the user qualifies.
- The completion log is local-only (Constitution §V). No remote backup; export is the user's responsibility.
- Promo parsing (US2) is heuristic regex / keyword over pasted text. No LLM call, no remote service.
- The Best Play card from spec 001 provides the "Done" and "Share" hook points. This spec adds the actions; spec 001 owns the card surface.
- Per-book stake ceilings and book health (spec 002) are independent. A recipe routes to whichever book the user picks; book health filters that selection.
- Promo deadlines are user-entered. The extension does not learn or scrape expiries.
- This spec does **not** automate any sportsbook interaction (Constitution §VI). "Done" is a user-initiated record.
- Lifetime total is informational. It is not used as input to any other calculation.
