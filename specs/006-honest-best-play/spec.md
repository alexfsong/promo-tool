# Spec 006: Honest Best Play Recommendations

## Context

Assumes [Brownfield Context](../000-brownfield-context/spec.md), [Constitution](../../.specify/memory/constitution.md), and Spec 001 (Best Play Card). Spec 005 cut the client over to a 10-min cron-fed feed sourced from Action Network + Pinnacle.

Field testing during Spec 005 T039 surfaced a UX failure: the Best Play card surfaced "$271 locked" on a $150 bonus bet (181% conversion). Real-world bonus-bet conversion plateaus around 65-85%; anything above ~100% is, by definition, an algebraic arbitrage that doesn't exist in practice. Investigation traced it to two compounding issues in `src/promos/recommend.js`:

1. **`max(layOdds)` selection** — `collectHedgeCandidates` picks the single highest lay price across all cohort books for the opposing outcome. Across multiple books with independent vig, the maximum is biased toward stale or outlier prices.
2. **No implied-probability sanity check** — when `1/back + 1/lay < 1.0`, the algebra still produces a valid "locked" number, but the implied house edge is *negative* — i.e., the two books together are pricing the event as if total probability summed to less than 100%. That is the definition of a false arb. In practice this usually reflects a 10-min snapshot lag, not a real opportunity.

The Pinnacle source already in the scraper is unused by the recommender, but it is the sharpest line available (≤2-4% vig, tightest of any book in the cohort feed). Anchoring the lay choice to Pinnacle removes the outlier bias for free.

This spec adds two layered filters to `recommend.js` so every Best Play surfaced is plausibly placeable, without changing any UI surface or the `bonusBet.js` math.

## User Scenarios & Testing

### User Story 1 — No false arbs in Best Play (Priority: P1)

When the maintainer or a cohort friend taps "Find best play" with realistic inputs, the headline "Guaranteed locked $X" matches what could actually be placed at current cohort-book prices. Stale-snapshot artifacts that produce >100% conversion are filtered out before reaching the UI.

**Why this priority**: every false arb erodes trust. Even one inflated headline trains the user to verify every recommendation — which defeats the point of an automated recommender.

**Acceptance**:
1. Given a feed snapshot where two cohort books' h2h prices imply a negative-hold market (e.g., back +500, lay -175 → implied prob sum 0.80), the recommender MUST NOT return that pair.
2. Given a feed where Pinnacle is present for the same event, the recommender SHOULD prefer the cohort lay book whose implied probability is closest to Pinnacle's for that outcome, rather than the cohort book with the highest lay odds.
3. Given a feed with no false arbs, the recommender's output for a healthy fixture matches the pre-spec output to $0.01 (no regression on real plays).

### User Story 2 — Pinnacle-anchored lay (Priority: P2)

When Pinnacle covers an event, its line is treated as the fair-value anchor. Among cohort lay candidates, the recommender picks the one whose implied probability is nearest Pinnacle's for the same outcome — not the one with the most generous-looking odds.

**Why this priority**: Pinnacle's low vig and high limits make it the de-facto sharp line for US books. Using it as a reference filters the stale-cohort-book outliers without requiring any UI change.

**Acceptance**:
1. Given Pinnacle quotes -200 (decimal 1.5) for outcome X and two cohort books quote -180 (1.556) and -110 (1.909) for the same outcome, the recommender picks -180 (closer to Pinnacle's 0.667 implied prob than -110's 0.524).
2. Given Pinnacle is absent for an event, fall back to the post-FR-001-filter highest lay across cohort books (i.e., the existing behavior, minus false arbs).

### Out of scope

- **Freshness gates**: dropping cohort entries with stale `last_update`. Spec 004 covers staleness as a display badge; making it a hard filter is deferred. Pinger (Spec 005 T041b) already pins feed age to ~10 min.
- **Vig display on cards**: showing implied house hold alongside locked-cash. UI work; defer.
- **Same-market alternate-line matching**: ensuring back and lay reference identical spreads/totals points. Out of scope for h2h, which is the focus.
- **Confidence scores / ranking weight**: ranking by anything other than `lockedCash` desc. Keep ordering unchanged within the filtered set.

## Requirements

### Functional Requirements

- **FR-001** (false-arb filter): `collectHedgeCandidates` MUST drop any (back, lay) pair where `1/backDecimal + 1/layDecimal < 0.98`. The 0.98 floor allows 2 percentage points of tolerance for tight Pinnacle-grade markets; tighter than that is almost certainly stale.
- **FR-002** (Pinnacle-anchored lay): When an event includes a bookmaker with title `'Pinnacle'` exposing the opposing outcome on the h2h market, the recommender MUST select the cohort lay candidate (among those passing FR-001) whose decimal-implied probability is closest to Pinnacle's for that outcome. When Pinnacle is absent for the event, behavior falls back to max-lay among FR-001-passing candidates.
- **FR-003** (no UI change): Both filters live in `src/promos/recommend.js`. No popup, content-script, manifest, or storage changes.
- **FR-004** (Pinnacle never displayed as a venue): Pinnacle remains a reference-only source. The recommender MUST NOT return a Best Play whose `evBook` or `hedgeBook` is Pinnacle (Pinnacle is not in friends' cohort book set, and existing `userBooks` filter already enforces this — FR-004 makes the invariant explicit).
- **FR-005** (deterministic on tie): When two cohort lay candidates are equidistant from Pinnacle's implied probability, the one with the alphabetically earlier book title wins. Prevents UI flicker between scrapes.
- **FR-006** (non-binary markets must not surface as binary hedges): Soccer h2h is 3-way (home / draw / away). A back+lay on home/away leaves the bettor uncovered on a draw, so the locked-cash math from `bonusBet.js` is wrong by construction. The scraper MUST emit a third "Draw" outcome for every soccer h2h market, even when a specific book omits the draw price (price `null` is acceptable). The recommender's existing `outcomes.length !== 2` guard then excludes these markets automatically. This requirement is sport-family-scoped to Soccer; the same shape applies to any future 3+ way market type (Tennis is 2-way so no change; UFC is 2-way; MMA prop bets out of scope). **Additionally**, soccer (EPL + UEFA Champions League) is removed from `scraper/sports.js` entirely: the cohort doesn't use it and the 3-way constraint means there's no honest Best Play to surface even with a draw price present. Revisit if cohort demand returns AND the recommender learns a true 3-way hedge.
- **FR-007** (configurable time window for plays): The Best Play card MUST expose a "Time window" selector with the choices: Today only, Next 24 hours, Next 3 days (default), Next 7 days, All upcoming. The recommender MUST filter provider events whose `commence_time` falls outside `[now, now + window)` before any hedge math runs. Choice persists in `chrome.storage.local` under key `bpWindow`. Rationale: many cohort promos require same-day or game-day plays (e.g., DraftKings "no sweat first bet of the day"); the previous behavior surfaced September NFL futures during a May session, polluting results with games the user couldn't possibly hedge today. No new storage keys other than `bpWindow`; no manifest change.

### User Story 3 — Soccer never surfaces as a false 2-way hedge (Priority: P1)

When the maintainer or a cohort friend runs Best Play on a slate that includes soccer matches, no soccer event is offered as a binary hedge. The card either shows a non-soccer event or "no play available."

**Why this priority**: a draw outcome wipes out both the bonus bet (loses) and the cash hedge (loses) — the user is *worse* off than if they hadn't taken the play. Surfacing soccer as binary is actively harmful, not just inaccurate.

**Acceptance**:
1. Given a feed snapshot where the only available events are soccer, `recommendBonusBet` returns `EMPTY_STATE_NO_PLAY`.
2. Given a mixed feed with soccer + a healthy 2-way event, the Best Play picks the 2-way event regardless of which has the higher would-be locked value.

### Key Entities

- *HedgeCandidate*: unchanged from Spec 001. The filters operate on this set, not the final BestPlay shape.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Across 20 manual Best Play runs (mixed sports, mixed promo types) on a live feed snapshot, **zero** headline values exceed 100% conversion (`lockedCash / bonusAmount ≤ 1.0`).
- **SC-002**: For events where Pinnacle is present and ≥2 cohort books quote the lay outcome, the chosen lay's implied probability is within **3 percentage points** of Pinnacle's for at least 95% of runs.
- **SC-003**: Existing test suite (`node --test test/recommend.test.js`) passes unchanged. New tests for FR-001 and FR-002 added and pass.
- **SC-004**: Zero new runtime npm dependencies; zero `manifest.json` changes; zero new `chrome.storage` keys (Constitution §II, §III, §V).

## Assumptions

- Pinnacle's `title` in the merged feed is the literal string `'Pinnacle'` (verified in `scraper/sources/pinnacle.js`).
- The 0.98 implied-prob floor is the right threshold; tightenable if it filters too many real plays (revisit after first week of cohort use).
- The 3pp Pinnacle-deviation tolerance in SC-002 is informational; not enforced by code, only by the manual audit.
