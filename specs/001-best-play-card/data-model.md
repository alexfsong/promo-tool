# Data Model: Best Play Card (spec 001)

All data shapes are JavaScript object literals (no class hierarchies, no runtime validation library — Constitution §III). Where field constraints matter, they are documented inline and enforced at call sites in pure functions, not via decorators.

---

## Entities

### `PromoType`

Static registry entry. Describes one user-facing promo offering.

```js
{
  id: string,            // stable kebab-case, e.g. 'bonus-bet'
  label: string,         // user-facing, sportsbook language (e.g. "Bonus Bet I already have")
  blurb: string,         // one-sentence beginner explainer
  fields: FieldDef[],    // inputs required from the user
  produces: 'BestPlay' | 'BestPlayAdvanced',  // discriminator for headline shape
  calc: () => Promise<Module>,  // dynamic import of the relevant pure calc module
}
```

`FieldDef`:

```js
{
  id: string,
  label: string,
  type: 'money' | 'odds' | 'oddsRange' | 'percent' | 'select',
  default?: any,
  options?: { value: any, label: string }[],  // for type 'select'
}
```

Registry lives at `src/promos/registry.js`. Spec 003's recipe library will import this registry by `id` to wire a recipe to its promo type.

---

### `PromoInputs`

User-entered values for the active promo type.

```js
{
  promoTypeId: string,        // matches PromoType.id
  mode: 'beginner' | 'advanced',
  fields: { [fieldId: string]: any },   // shape determined by PromoType.fields
}
```

Persisted (per FR-015): `{promoTypeId, mode}` only; field values are session-scoped.

---

### `BestPlay`

The recommendation produced by `src/promos/recommend.js`. Consumed by `popup.js` to render the card.

```js
{
  headline: {
    kind: 'lockedCash',
    amount: number,         // dollars (e.g., 73.40)
  },
  evLeg: {
    book: string,           // bookmaker key matching provider response
    event: { home: string, away: string, commenceTime: string },
    market: 'h2h' | 'spreads' | 'totals',
    selection: string,
    odds: number,           // American
    stake: number | null,   // null when the leg uses the user's bonus bet
    stakeKind: 'bonusBet' | 'cash',
  },
  hedgeLegs: HedgeLeg[],    // length 1 for spec 001 (spec 002 may extend)
  showDetails: {
    formulaLine: string,    // plain-English math summary for the "Show details" panel
    ev?: number,            // only populated for promos where EV is computed; not displayed by default
  },
}
```

`HedgeLeg`:

```js
{
  book: string,
  event: { home: string, away: string, commenceTime: string },
  market: 'h2h' | 'spreads' | 'totals',
  selection: string,
  odds: number,
  cashStake: number,        // rounded to $0.01 per FR-006 (spec 001)
}
```

---

### `BestPlayAdvanced` (Bet & Get, Advanced mode only — per FR-016)

Same shape as `BestPlay` except:

```js
headline: {
  kind: 'netEV',
  amount: number,           // can be negative; advanced users only
}
```

This is the only headline kind that is **not** `lockedCash` in spec 001. UI must render it differently (label changes to "Net EV", clarifying copy added) to satisfy SC-002 ("zero users describe the headline as 'expected'").

---

### `BetSlipParse`

Output of `src/parsers/betSlip.js`. All fields optional — partial parses are first-class per FR-009.

```js
{
  book: 'draftkings' | 'fanduel' | null,
  event: { home?: string, away?: string } | null,
  selection: string | null,
  market: 'h2h' | 'spreads' | 'totals' | null,
  odds: number | null,
  rawText: string,          // always set; the original pasted text, for fallback display
}
```

---

### `UserBooks`

Existing setting. Spec 001 reads only; no shape changes.

```js
string[]    // bookmaker keys matching provider response
```

Spec 002 will extend this to a richer shape (per-book status, ceilings). Spec 001 treats it as the current flat array.

---

### `BookCeilings` (read-only consumer in spec 001)

Spec 002 introduces a per-(book, sport, market) ceiling map. Spec 001 does **not** consume it; it uses a global default of `Infinity` (i.e., no split) for all books. When spec 002 ships, `recommend.js` will gain a ceilings argument; that is a non-breaking change to spec 001's signature.

---

## Storage layout (`chrome.storage.local`)

| Key | Value | Owner |
|---|---|---|
| `oddsApiKey` | string (API key *or* feed base URL) | provider abstraction (existing) |
| `userBooks` | string[] | settings UI (existing) |
| `advancedMode` | boolean | popup mode toggle (existing; default flips to false in this spec) |
| `promoType` | string (PromoType.id) | **NEW** in spec 001 |
| `scanCache` | object | service worker (existing) |

Only `promoType` is added. `advancedMode` already exists; its default semantics change (was `false`, stays `false`, but is now the documented default; first-launch users land in Beginner Mode regardless of what was set before).

---

## Lifecycle / state transitions

### Promo selection

```
[start] → pick PromoType → fields populated (defaults or paste) → submit
       → recommend() runs → BestPlay rendered → optional: Show details
       → user places legs at sportsbooks (out of tool)
       → optional: tap "Done" (owned by spec 003)
```

### Mode toggle

```
beginner  ←→  advanced
```

Toggling exposes / hides the EV tab and the EV details in "Show details". For Bet & Get specifically, toggle changes the math path between `beginnerPlan` and `advancedPlan`.

### Bet-slip paste

```
paste → parser yields BetSlipParse
      → if all of {book, event, selection, odds} present → fill all fields
      → else partial: fill recognized fields; UI prompts user for missing piece
      → else full failure: keep existing field values; show one-line error
```

---

## Validation rules

- `odds`: integer with `|odds| ≥ 100`. American format only. `-100` is forbidden (no zero EV in conversion math); both `-99` and `+99` are invalid because they map to decimal < 1.0.
- `bonusAmount`: number, `> 0`, rounded to cents.
- `cashStake`: number, `≥ 0`, rounded to cents.
- `targetOddsRange`: tuple `[low, high]`, both American, `low ≤ high`.
- `mode`: enum `'beginner' | 'advanced'`.

Violations of these rules are programming errors in spec 001 — the UI is responsible for preventing invalid inputs from reaching pure functions. Pure modules may assert / throw; they MUST NOT silently coerce.

---

## Cross-spec data ownership

| Field / entity | Spec 001 | Spec 002 | Spec 003 | Spec 004 |
|---|---|---|---|---|
| `PromoType` registry | **owner** | reads | reads | — |
| `BestPlay` shape | **owner** | extends (multi-leg) | reads (Done action) | — |
| `UserBooks` | reads | **owner** (extends to per-book status) | reads | — |
| `BookCeilings` | — | **owner** | — | — |
| Recipe library | — | — | **owner** | — |
| Completion log | — | — | **owner** | — |
| Live-event filter | — | — | — | **owner** |
| `oddsAgeBadge` field | reads (from provider) | — | — | **owner** |
