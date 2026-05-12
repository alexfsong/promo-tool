# Feature Specification: Odds Hygiene (No-Live + Age Badge)

**Feature Branch**: `004-odds-hygiene`
**Created**: 2026-05-12
**Status**: Draft
**Input**: User goal: "Odds change isn't a high-priority risk because the user sees odds at the bet slip when they place. Keep odds-related safety features minimal: hard-filter live markets, and show how stale each recommendation's odds are. Drop the heavier proposals (pre-bet refresh gate, drift tolerance settings, leg-ordering logic)."

## Context

Assumes [Brownfield Context](../000-brownfield-context/spec.md) and [Constitution](../../.specify/memory/constitution.md). Spec 001 FR-014 already excludes live markets from Best Play recommendations at the UI level. This spec moves that exclusion down to the provider layer so it cannot leak via any future surface (legacy calculator tabs, content scripts, alternate UIs), and adds a single low-cost staleness affordance.

Explicit scope cut (per user direction 2026-05-12): no pre-bet refresh gate, no 60s leg freeze, no per-leg drift tolerance, no enforced leg-placement ordering. The user reads odds again at the sportsbook bet slip; that is sufficient self-correction.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Live markets never reach the UI (Priority: P1)

The user never sees an in-play / live-betting market in any scanner result, Best Play card, or content-script badge. The exclusion happens at the provider boundary so adding a new surface later does not re-introduce live markets by oversight.

**Why this priority**: Live odds change second-to-second; the entire "guaranteed conversion" promise breaks if the recommended leg is live. This is a hard gate, cheap to enforce centrally.

**Independent Test**: Inject a provider response containing both pre-game and live events for a sport. No UI surface shows any live event. Confirmed by inspecting scanner output, content-script badge data, and Best Play candidates.

**Acceptance Scenarios**:

1. **Given** the provider returns events with `commence_time` in the past (live or completed),
   **When** any UI consumes provider output,
   **Then** those events are absent from the consumed data.
2. **Given** the provider response contains an explicit live/in-play marker (provider-dependent),
   **When** any UI consumes provider output,
   **Then** those events are absent from the consumed data.
3. **Given** the live filter would remove all events for a sport,
   **When** the user requests Best Plays for that sport,
   **Then** the UI shows an empty state ("no pre-game events right now") rather than a confusing "no results" with no reason.

---

### User Story 2 — Odds-age badge on every recommendation row (Priority: P2)

Each scanner row and each Best Play card shows when its underlying odds were fetched. Display only. No tap-to-refresh, no automatic refresh, no time-based abort, no countdown. The user already drives refresh by re-running the scanner; staleness is informational.

**Why this priority**: Cheap signal that lets the user decide whether to re-check before placing. Not strictly required since the bet slip is the source of truth at placement time, but reduces "should I trust this number?" cognitive load.

**Independent Test**: Open the scanner. Each row shows "fetched Nm ago". Wait one minute without acting; the badge increments. Re-run the scan; the badge resets.

**Acceptance Scenarios**:

1. **Given** a scanner result row,
   **When** the user looks at the row,
   **Then** a small badge displays the elapsed time since fetch (e.g., "4m ago"), updated at least once per minute while the panel is open.
2. **Given** the Best Play card,
   **When** displayed,
   **Then** an equivalent badge appears on the card.
3. **Given** the user re-runs a full scan,
   **When** the scan completes,
   **Then** badges on affected rows reset to "just now".

---

### Edge Cases

- **Provider clock skew**: Age is computed from local fetch time (the time the extension received the response), not from any provider-supplied timestamp. Skew between the user's clock and the provider's clock does not affect display.
- **Event that goes live between scan and bet placement**: The next scan will filter it out, but a card already on screen may still reference it. Acceptable; the bet slip at the sportsbook will reflect live status and the user will see it.
- **Scraper feed (vpsFeed provider) writes JSON on a 10-minute cadence**: Odds will routinely show "8m ago" or similar. That is expected, not a defect, and the badge is the correct way to communicate it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST filter live / in-play events at the provider abstraction layer (`src/api/provider.js` or the calling adapter), not only at the UI layer. Any UI consumer of provider output MUST receive pre-game events only.
- **FR-002**: System MUST define "live" as: `commence_time` in the past, OR an explicit provider-supplied in-play flag, OR (for the vpsFeed provider) a normalized field set by the scraper indicating in-play status.
- **FR-003**: System MUST stamp each event (or group of events) with the local fetch time at the moment the provider response is received.
- **FR-004**: System MUST display an odds-age badge on every scanner result row and every Best Play card. The badge MUST update at least once per minute while the side panel is visible.
- **FR-005**: The badge MUST be display-only. No tap-to-refresh, no per-row refresh affordance. The existing full-scan action is the only refresh path.
- **FR-006**: System MUST NOT auto-refresh, auto-expire, or auto-hide recommendations based on age.
- **FR-007**: System MUST NOT introduce a pre-bet "lock" / "freeze" gate, drift-tolerance setting, or leg-placement ordering (explicit scope cut).

### Key Entities

- **Fetch timestamp**: A local epoch-ms value attached to each cached odds payload. Single source of truth for the age badge.
- **Live filter result**: Filtered list of events excluding in-play / live. Applied at the provider boundary; downstream code never sees raw mixed lists.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a manual audit of 100 scanner rows across all active sports, **zero** rows reference a live / in-play market.
- **SC-002**: Age badge accuracy: displayed elapsed time matches actual wall-clock elapsed time within **±5 seconds** at any moment.
- **SC-003**: No new dependencies introduced; no new build step; no new permission added to `manifest.json` (Constitution §III, §II constraints).

## Assumptions

- The provider abstraction (Constitution §II) is the correct enforcement point. Both `theOddsApi.js` and `vpsFeed.js` either already filter, or are easy to wrap with a shared filter helper.
- The vpsFeed scraper is **not** modified by this spec. Provider-layer filter in the extension is sufficient. Scraper-side filtering can land in a later scraper-focused spec if needed.
- The odds-age badge is a passive UI affordance; it does not need its own settings.
- The user's sportsbook bet slip remains the authoritative source for the odds the user will actually be placing at. The badge is a hint, not a guarantee.
- Spec 001's FR-014 remains valid; this spec strengthens it by moving the gate down a layer. Spec 001 does not need to be edited.
- No other spec depends on this one. This spec can ship before or after specs 002 and 003.
