# Research: Best Play Card (spec 001)

Phase 0 of `/speckit-plan`. Resolves the few open questions left after `/speckit-clarify`. Brownfield project, so most "research" is "what does the existing code already do that we can reuse".

---

## R1 — Bet-slip text format on DraftKings and FanDuel

**Decision**: Parse a small, well-known shape per book using simple regex/keyword heuristics. Reject anything outside that shape (parlays, SGPs, props with non-standard formatting) cleanly per FR-009.

**DraftKings bet slip (single straight bet, copied as text)** — observed shape:

```
<selection>
<market label, e.g. "Moneyline" / "Spread" / "Total">
<event description, e.g. "Lakers @ Warriors">
<odds, e.g. "+150" or "-110">
Stake $<amount>
```

**FanDuel bet slip** — observed shape:

```
<selection> <odds>
<market label>
<event description>
Wager $<amount>
```

**Parser strategy**: regex for `^[+-]\d{2,5}$` (American odds) → identify the book by which heuristic fires. Extract selection and event by line position relative to the odds line. Stake is optional input (the user-entered field overrides). Return a `BetSlipParse` with whichever of `{event, selection, odds, book, stake}` could be identified; `null` for the rest.

**Rationale**: No browser DOM access required; parser is pure text → pure object. Spec 001 US3 P2 — covers DK + FD only.

**Alternatives considered**:
- LLM-based parsing: rejected (Constitution §III no new deps, and would require an API key).
- DOM scraping the sportsbook page: rejected (Constitution §VI read-only, content scripts only badge, never read live bet-slip state).
- Manual structured form: that is the fallback when parsing fails; we still want paste as the fast path.

---

## R2 — "Bet & Get" two-stage math

**Decision (per clarification 2)**: Two pure functions in `src/promos/betAndGet.js`:

```
beginnerPlan(qualifyingStake, bonusAmount, qualifyingOdds, hedgeOdds, bonusHedgeOdds)
  → { stage1: HedgePlan, stage2: DeferredBonusPlan, worstCaseLockedCash }

advancedPlan(qualifyingStake, bonusAmount, qualifyingOdds, bonusHedgeOdds)
  → { stage1: UnhedgedPlay, stage2: DeferredBonusPlan, netEV }
```

**Beginner math** (worst-case floor):

- Stage 1: standard cross-book cash hedge on the qualifying bet → locks `L1` regardless of outcome.
- Stage 2 (only if qualifying wins): bonus bet of size `bonusAmount` is credited. Conversion via existing `bonusBet.js` math at the user's typical conversion rate `r` → locks `L2 = bonusAmount * r` *only if qualifying wins*.
- Worst case is the qualifying-loss branch: locked cash = `L1` (no bonus credited).
- Headline: `worstCaseLockedCash = L1`. Stage 2 shown as "if your qualifying bet wins, here's the next play to run."

**Advanced math** (net EV):

- Stage 1: place full `qualifyingStake` unhedged on the +EV side at +EV book.
- Let `p_win` = implied probability of qualifying bet winning (from odds), `payout_win` = qualifying win payout (cash).
- Stage 2 conditional: if win, bonus credits at `bonusAmount`, converts at `r` → `L2 = bonusAmount * r`.
- `netEV = p_win * (payout_win + L2) - (1 - p_win) * qualifyingStake`
- Headline: `netEV`. **This is the only place in spec 001 where the headline is not locked cash** (per FR-016).

**Rationale**: Splitting into two pure functions keeps each Branch trivially testable. Both consume existing `bonusBet.js` for the stage-2 conversion. No new global math; just composition.

**Alternatives considered**:
- Single function with a `mode` parameter: rejected for testability — the assertions are very different (locked-cash equality vs net-EV equality with tolerances).
- Pre-compute both and display the right one based on UI state: rejected because Advanced math requires extra inputs (conversion rate `r`) which the Beginner version uses a fixed default for.

---

## R3 — Hedge-leg selection algorithm (single-book constraint, this spec)

**Decision**: Reuse the existing scanner's cross-book hedge-pairing logic for the single-hedge case. Spec 001 only needs single-book hedges; multi-book splits are owned by spec 002.

**Algorithm** (matches behavior already implemented in `popup/popup.js` scanner code):

1. For the chosen event + +EV leg odds, enumerate hedge books from "My sportsbooks" minus the +EV book.
2. For each candidate hedge book, look up the opposing-side odds in the same market.
3. For each candidate, compute the bonus-bet hedge stake via `src/calc/bonusBet.js`.
4. Return the candidate with the highest locked-cash.

**Extraction**: lift this loop out of `popup/popup.js` into `src/promos/recommend.js` as a pure function `recommendHedge(eventOdds, hedgeCandidates) → { hedgeBook, hedgeOdds, hedgeStake, lockedCash }`. This makes it unit-testable and lets spec 002 extend it to multi-book splits without touching the UI.

**Rationale**: The math is already there; the move is purity + extraction. Risk: regression in scanner output. Mitigation: smoke-test parity against current scanner output in quickstart.md.

**Alternatives considered**:
- Use Pinnacle implied probability as a "fair odds" anchor and compute hedge stake against fair: rejected for this spec — current scanner doesn't do this and the change is out of scope; consider for spec 002 or later.

---

## R4 — Promo-type registry shape

**Decision (per clarification 3)**: `src/promos/registry.js` exports an array:

```js
[
  {
    id: 'bonus-bet',
    label: 'Bonus Bet I already have',
    blurb: 'Convert a credited bonus bet to cash.',
    calc: () => import('../calc/bonusBet.js'),
    fields: [
      { id: 'bonusAmount', label: 'Bonus bet amount ($)', type: 'money' },
      { id: 'targetOddsRange', label: 'Target odds', type: 'oddsRange', default: [300, 500] },
    ],
    produces: 'BestPlay',
  },
  // 'bet-and-get', 'risk-free', 'deposit-match', 'profit-boost'
]
```

**Rationale**: Static data structure — no logic, just wiring. UI iterates this for the picker. Adding a new promo type later is a single registry entry plus a calc module (or composition thereof). No build step needed.

**Alternatives considered**:
- Embed in `popup.js`: rejected (Constitution §I — keeps user-facing strings near the math layer, but better to keep registry separately so spec 003's recipe library can import it).
- TypeScript with discriminated unions: rejected (Constitution §III — no build step).

---

## R5 — Beginner / Advanced toggle relocation

**Decision**: Keep the existing top-right toggle for now. Add a Settings-page mirror so the toggle is discoverable from Settings as well (per FR-008). Default to Beginner on first launch. No deletion of the existing affordance in this spec; can be removed in a follow-up if the Settings location is sufficient.

**Rationale**: Avoid yanking a familiar control. The default-flip to Beginner is the load-bearing change for the friend-share use case; the toggle relocation is secondary.

**Alternatives considered**:
- Move toggle to Settings only: rejected for first ship — too disruptive given existing users.
- Per-card toggle: rejected — adds clutter and undermines the Beginner-default invariant.

---

## R6 — EV tab visibility wiring

**Decision (per clarification 1)**: A new top-level tab in `popup.html` next to "Best Play". The tab element has `data-advanced-only="true"`. `popup.js` toggles its visibility on the Advanced-Mode state change (which is already wired). Beginner Mode is the default → tab is hidden by default.

**Rationale**: Reuses existing mode plumbing. No new mode mechanism.

**Alternatives considered**: see clarification options A/C/D in spec.md — rejected at clarify time.

---

## Decisions summary

| ID | Decision | Owns |
|---|---|---|
| R1 | Regex/keyword paste parser for DK + FD; pure module | `src/parsers/betSlip.js` |
| R2 | Two pure functions for Bet & Get (Beginner floor / Advanced net EV) | `src/promos/betAndGet.js` |
| R3 | Lift scanner's hedge-pair loop into a pure module | `src/promos/recommend.js` |
| R4 | Static registry array | `src/promos/registry.js` |
| R5 | Keep top-right toggle, mirror in Settings, default Beginner | `popup/popup.html` + `popup.js` |
| R6 | New tab, `data-advanced-only`, gated by existing mode state | `popup/popup.html` + `popup.js` |

All NEEDS CLARIFICATION items from `plan.md` Technical Context are resolved.
