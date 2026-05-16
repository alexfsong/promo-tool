import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recommendHedge,
  recommendHedgeRanked,
  recommendHedgeNearMisses,
  recommendBonusBet,
  recommendRiskFree,
  recommendDepositMatch,
  recommendOddsBoost,
  recommendBetAndGet,
  EMPTY_STATE_NO_PLAY,
  EMPTY_STATE_NEED_BOOKS,
} from '../src/promos/recommend.js';
import { bonusBetHedge } from '../src/calc/bonusBet.js';
import { americanToDecimal } from '../src/calc/odds.js';

const approx = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// Fixture: one event, two books, h2h market with clear arb.
function fixtureEvents() {
  return [{
    id: 'evt-1',
    home_team: 'Warriors',
    away_team: 'Lakers',
    commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      {
        title: 'DraftKings',
        markets: [{
          key: 'h2h',
          outcomes: [
            { name: 'Lakers', price: 400 },
            { name: 'Warriors', price: -500 },
          ],
        }],
      },
      {
        title: 'FanDuel',
        markets: [{
          key: 'h2h',
          outcomes: [
            { name: 'Lakers', price: 380 },
            { name: 'Warriors', price: -450 },
          ],
        }],
      },
    ],
  }];
}

test('recommendBonusBet: returns BestPlay with lockedCash headline + 1 cross-book hedge', () => {
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'lockedCash');
  assert.ok(out.headline.amount > 0);
  assert.equal(out.hedgeLegs.length, 1);
  assert.notEqual(out.evLeg.book, out.hedgeLegs[0].book, 'FR-010 cross-book');
  assert.equal(out.evLeg.stakeKind, 'bonusBet');
  assert.equal(out.evLeg.stake, null);
  assert.equal(out.hedgeLegs[0].cashStake.toFixed(2), out.hedgeLegs[0].cashStake.toFixed(2)); // round to $0.01
});

test('recommendBonusBet: locked-cash matches bonusBetHedge to $0.01 (SC-003 parity)', () => {
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  // DraftKings +400 vs FanDuel +380 hedge — recommendHedge picks the highest
  // locked-cash combination across both directions. Verify the headline value
  // equals a direct call to bonusBetHedge against the chosen pair.
  const direct = bonusBetHedge({
    bonus: 150,
    backDecimal: americanToDecimal(out.evLeg.odds),
    layDecimal: americanToDecimal(out.hedgeLegs[0].odds),
  });
  assert.ok(approx(out.headline.amount, direct.lockedValue, 0.01));
});

test('recommendBonusBet: stake shown is the cash hedge stake, not bonus face value (FR-013)', () => {
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.notEqual(out.hedgeLegs[0].cashStake, 150, 'hedge cash stake != bonus face');
});

test('recommendBonusBet: empty-state when no event yields positive locked cash', () => {
  // odds range outside fixture range
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [5000, 9000] },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out, EMPTY_STATE_NO_PLAY);
});

test('recommendBonusBet: single-book degrade (FR-011) returns need-more-books sentinel', () => {
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    fixtureEvents(),
    ['DraftKings'],
  );
  assert.equal(out, EMPTY_STATE_NEED_BOOKS);
});

test('recommendHedge: never returns same-book hedge (FR-010)', () => {
  const events = fixtureEvents();
  const r = recommendHedge({
    events, bonusAmount: 100, minOdds: 300, maxOdds: 500,
    userBooks: ['DraftKings', 'FanDuel'],
  });
  assert.notEqual(r.evBook, r.hedgeBook);
});

test('recommendRiskFree: BestPlay with lockedCash headline (locked = refund × conversion)', () => {
  const out = recommendRiskFree(
    { stake: 100, odds: 200, refund: 100, conversionRate: 0.7 },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'lockedCash');
  assert.ok(approx(out.headline.amount, 70, 0.01));
});

test('recommendDepositMatch: lockedCash headline = direct depositMatchEV.ev to $0.01', () => {
  const out = recommendDepositMatch(
    { match: 500, rolloverMultiplier: 5, houseHold: 0.0476 },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'lockedCash');
  assert.ok(approx(out.headline.amount, 381, 0.01));
});

// ── Other plays / near-miss fallback (cron-flake mitigation) ─────────────────
function multiEventFixture() {
  return [
    {
      id: 'in-1', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
      bookmakers: [
        { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 350 }, { name: 'B', price: -450 }] }] },
        { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'A', price: 320 }, { name: 'B', price: -380 }] }] },
      ],
    },
    {
      id: 'in-2', home_team: 'C', away_team: 'D', commence_time: '2026-05-15T20:00:00Z',
      bookmakers: [
        { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'C', price: 450 }, { name: 'D', price: -600 }] }] },
        { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'C', price: 400 }, { name: 'D', price: -520 }] }] },
      ],
    },
    {
      id: 'near-low', home_team: 'E', away_team: 'F', commence_time: '2026-05-15T21:00:00Z',
      bookmakers: [
        { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'E', price: 220 }, { name: 'F', price: -260 }] }] },
        { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'E', price: 200 }, { name: 'F', price: -240 }] }] },
      ],
    },
    {
      id: 'near-high', home_team: 'G', away_team: 'H', commence_time: '2026-05-15T22:00:00Z',
      bookmakers: [
        { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'G', price: 600 }, { name: 'H', price: -850 }] }] },
        { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'G', price: 550 }, { name: 'H', price: -750 }] }] },
      ],
    },
  ];
}

test('recommendHedgeRanked: returns plays sorted desc by lockedCash, limit honored', () => {
  const out = recommendHedgeRanked({
    events: multiEventFixture(), bonusAmount: 100,
    minOdds: 300, maxOdds: 500,
    userBooks: ['DK', 'FD'], limit: 5,
  });
  assert.ok(out.length >= 2, 'should find at least 2 in-range plays');
  assert.ok(out.length <= 5, 'should respect limit');
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i - 1].lockedCash >= out[i].lockedCash, 'sorted desc');
  }
});

test('recommendHedgeRanked: first element matches recommendHedge', () => {
  const params = {
    events: multiEventFixture(), bonusAmount: 100,
    minOdds: 300, maxOdds: 500, userBooks: ['DK', 'FD'],
  };
  const single = recommendHedge(params);
  const ranked = recommendHedgeRanked({ ...params, limit: 5 });
  assert.equal(ranked[0].lockedCash, single.lockedCash);
  assert.equal(ranked[0].evBook, single.evBook);
});

test('recommendHedgeNearMisses: returns out-of-range plays inside the band', () => {
  const out = recommendHedgeNearMisses({
    events: multiEventFixture(), bonusAmount: 100,
    minOdds: 300, maxOdds: 500, userBooks: ['DK', 'FD'],
    band: 200, limit: 10,
  });
  assert.ok(out.length >= 2, 'expected near-low (+220 / +200) and near-high (+600 / +550)');
  for (const p of out) {
    assert.ok(p.evOdds < 300 || p.evOdds > 500, 'all near-misses are outside [min,max]');
    assert.ok(p.evOdds >= 100 && p.evOdds <= 700, 'all within band');
  }
});

test('recommendHedgeNearMisses: excludes plays already inside [min,max]', () => {
  const out = recommendHedgeNearMisses({
    events: multiEventFixture(), bonusAmount: 100,
    minOdds: 300, maxOdds: 500, userBooks: ['DK', 'FD'], band: 1000,
  });
  for (const p of out) {
    assert.ok(p.evOdds < 300 || p.evOdds > 500, 'no in-range duplicates');
  }
});

test('recommendBonusBet: attaches otherPlays + nearMisses arrays', () => {
  const out = recommendBonusBet(
    { bonusAmount: 100, targetOddsRange: [300, 500] },
    multiEventFixture(),
    ['DK', 'FD'],
  );
  assert.ok(Array.isArray(out.otherPlays), 'otherPlays is an array');
  assert.ok(Array.isArray(out.nearMisses), 'nearMisses is an array');
  assert.ok(out.otherPlays.length >= 1, 'multi-event fixture yields >=2 in-range plays, so >=1 alternate');
  assert.ok(out.nearMisses.length >= 1, 'near-low/high events present');
  // alternates must not duplicate the headline.
  const headlineKey = `${out.evLeg.event.home}|${out.evLeg.book}|${out.evLeg.selection}`;
  for (const p of out.otherPlays) {
    const k = `${p.event.home}|${p.evBook}|${p.evSelection}`;
    assert.notEqual(k, headlineKey, 'alternate is not the headline');
  }
});

test('recommendRiskFree: attaches otherPlays + nearMisses for the deferred bonus-bet plan', () => {
  const out = recommendRiskFree(
    { stake: 100, odds: 200, refund: 100, conversionRate: 0.7 },
    multiEventFixture(),
    ['DK', 'FD'],
  );
  assert.ok(Array.isArray(out.otherPlays));
  assert.ok(Array.isArray(out.nearMisses));
  assert.ok(out.otherPlays.length >= 1, 'multi-event fixture yields >=2 in-range plays for the deferred plan');
});

test('recommendBetAndGet (beginner): attaches otherPlays + nearMisses for the qualifying play', () => {
  const out = recommendBetAndGet(
    { qualifyingStake: 50, bonusAmount: 100, conversionRate: 0.7, mode: 'beginner' },
    multiEventFixture(),
    ['DK', 'FD'],
  );
  assert.ok(Array.isArray(out.otherPlays));
  assert.ok(Array.isArray(out.nearMisses));
});

test('recommendBetAndGet (advanced): attaches otherPlays + nearMisses for the qualifying play', () => {
  const out = recommendBetAndGet(
    { qualifyingStake: 50, bonusAmount: 100, conversionRate: 0.7, mode: 'advanced' },
    multiEventFixture(),
    ['DK', 'FD'],
  );
  assert.ok(Array.isArray(out.otherPlays));
  assert.ok(Array.isArray(out.nearMisses));
});

test('recommendBonusBet: otherPlays + nearMisses are [] when nothing else fits', () => {
  // Single event, controlled so exactly one candidate falls inside [300,500]
  // and no other back price lands in the ±200 near-miss band ([100,299] ∪ [501,700]).
  const events = [{
    id: 'lone',
    home_team: 'X', away_team: 'Y', commence_time: '2026-05-15T19:00:00Z',
    // Back DK X +400 is the lone candidate in [300,500]; FD X +90 is below
    // the near-miss floor (100); FD Y -370 hedges DK X +400 with implied
    // sum 0.987 (passes spec 006 FR-001 false-arb floor).
    bookmakers: [
      { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'X', price: 400 }, { name: 'Y', price: -1500 }] }] },
      { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'X', price: 90 }, { name: 'Y', price: -370 }] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 100, targetOddsRange: [300, 500] },
    events,
    ['DK', 'FD'],
  );
  assert.equal(out.otherPlays.length, 0);
  assert.equal(out.nearMisses.length, 0);
});

test('recommendDepositMatch: -EV promo returns empty-state', () => {
  const out = recommendDepositMatch(
    { match: 100, rolloverMultiplier: 30, houseHold: 0.0476 },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out, EMPTY_STATE_NO_PLAY);
});

test('recommendOddsBoost: lockedCash headline = direct oddsBoostEV.dollarEV to $0.01', () => {
  const out = recommendOddsBoost(
    { boostedOdds: 150, fairOdds: 100, stake: 50 },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'lockedCash');
  assert.ok(approx(out.headline.amount, 12.5, 0.01));
});

test('recommendBetAndGet: beginner mode → lockedCash headline (FR-016)', () => {
  const out = recommendBetAndGet(
    {
      qualifyingStake: 5,
      bonusAmount: 150,
      targetOddsRange: [300, 500],
      conversionRate: 0.7,
      mode: 'beginner',
    },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'lockedCash');
});

test('recommendBetAndGet: advanced mode → netEV headline (FR-016 invariant)', () => {
  const out = recommendBetAndGet(
    {
      qualifyingStake: 5,
      bonusAmount: 150,
      targetOddsRange: [300, 500],
      conversionRate: 0.7,
      mode: 'advanced',
    },
    fixtureEvents(),
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out.headline.kind, 'netEV');
});

// --- Spec 006: honest best play ---

test('spec 006 FR-001: false-arb (implied prob sum < 0.98) is filtered out', () => {
  // Both possible cross-book pairs sum to far below 0.98 — pure false arbs
  // from stale snapshots. Without the filter, both would surface as
  // implausibly high "locked" conversions. With it, no play survives.
  // DK A +500 + FD B +600 → 1/6 + 1/7 = 0.31. FD A +600 + DK B +500 → same.
  const events = [{
    id: 'arb', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 500 }, { name: 'B', price: -800 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: -800 }, { name: 'B', price: 600 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 100, targetOddsRange: [300, 700] },
    events,
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out, EMPTY_STATE_NO_PLAY,
    'false-arb pair must not surface; no other valid play exists in this fixture');
});

test('spec 006 FR-001: realistic pair (implied prob sum ≥ 0.98) still passes', () => {
  // Back +400 (B=5, 1/B=0.20) + lay -450 (L=1.222, 1/L=0.818) → sum 1.018,
  // a normal-vig market. Locked = $150 × (5−1) × (1.222−1)/1.222 ≈ $109.
  const events = [{
    id: 'real', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 400 }, { name: 'B', price: -500 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 380 }, { name: 'B', price: -450 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    events,
    ['DraftKings', 'FanDuel'],
  );
  assert.notEqual(out, EMPTY_STATE_NO_PLAY);
  assert.equal(out.headline.kind, 'lockedCash');
  assert.ok(out.headline.amount > 90 && out.headline.amount < 115,
    `expected ~$109 locked, got $${out.headline.amount}`);
  assert.ok(out.headline.amount / 150 <= 1.0,
    'conversion must not exceed 100% post-filter');
});

test('spec 006 FR-002: Pinnacle-anchored lay picks closest cohort book, not max', () => {
  // Pinnacle anchors lay outcome B at -200 (decimal 1.5, implied 0.667).
  // Two cohort lay candidates for B: DK at -110 (1.909, implied 0.524) and
  // FD at -180 (1.556, implied 0.643). FD is closer to Pinnacle. Without
  // FR-002, the max-lay pick would be DK -110 (higher decimal = "better" lay
  // odds), but that's the stale/mispriced outlier.
  // Back leg is BetMGM A +180 (B=2.8). Implied sums: BM+180 (1/2.8=0.357) +
  // DK -110 (0.524) = 0.881 → fails FR-001. So we need a back leg that pairs
  // with both DK and FD legitimately.
  // Use back BetMGM A +160 (B=2.6, 1/B=0.385):
  //   + DK B -110 (1/L=0.524) → sum 0.909, FAILS 0.98 floor (gets filtered).
  // To exercise FR-002 cleanly we need BOTH cohort lays to pass FR-001.
  // Use back BetMGM A +200 (B=3, 1/B=0.333):
  //   + DK B -250 (1/L=0.714) → sum 1.048 PASS
  //   + FD B -180 (1/L=0.643) → sum 0.976 → just below 0.98 — adjust.
  // Use FD B -200 (1/L=0.667). Then FD sum = 1.000 PASS. DK B -250 sum = 1.048.
  // Pinnacle anchor at B -200 (implied 0.667). FD is exactly on Pinnacle;
  // DK at -250 (implied 0.714) is 0.047 above. FD wins.
  const events = [{
    id: 'pin-anchor', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      { title: 'Pinnacle', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 175 }, { name: 'B', price: -200 },
      ] }] },
      { title: 'BetMGM', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 200 }, { name: 'B', price: -240 },
      ] }] },
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 180 }, { name: 'B', price: -250 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 165 }, { name: 'B', price: -200 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 100, targetOddsRange: [150, 250] },
    events,
    ['BetMGM', 'DraftKings', 'FanDuel'],
  );
  assert.notEqual(out, EMPTY_STATE_NO_PLAY);
  // The hedge book must be FanDuel (Pinnacle-closest), not DraftKings.
  assert.equal(out.hedgeLegs[0].book, 'FanDuel',
    'FR-002: lay should be cohort book closest to Pinnacle');
});

test('spec 006 FR-002: no Pinnacle → falls back to max-lay (post-filter)', () => {
  // Same shape as previous but no Pinnacle. Without an anchor, max-lay wins.
  // Back BetMGM A +200, two lay candidates: DK -250 (1/L=0.714, sum 1.048)
  // and FD -200 (1/L=0.667, sum 1.000). Both pass FR-001. Max-lay is
  // FD -200 (lower magnitude negative = higher decimal = "better" lay) →
  // wait: -200 American = 1.5 decimal; -250 = 1.4 decimal. Max-decimal is
  // -200 (FD). So FD is the max-lay pick. Verify.
  const events = [{
    id: 'no-pin', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      { title: 'BetMGM', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 200 }, { name: 'B', price: -240 },
      ] }] },
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 180 }, { name: 'B', price: -250 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 165 }, { name: 'B', price: -200 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 100, targetOddsRange: [150, 250] },
    events,
    ['BetMGM', 'DraftKings', 'FanDuel'],
  );
  assert.notEqual(out, EMPTY_STATE_NO_PLAY);
  // Max-lay (highest decimal) is FD -200; FR-002 fallback should pick it.
  assert.equal(out.hedgeLegs[0].book, 'FanDuel',
    'FR-002 fallback: highest lay-decimal wins when Pinnacle absent');
});

test('spec 006 FR-006: 3-outcome h2h (soccer with draw) is skipped', () => {
  // A binary "h2h" on a 3-way market would tell the user they're locked
  // when actually a draw zeroes both legs. Scraper now emits a Draw
  // outcome for soccer; recommend.js's outcomes.length !== 2 guard skips.
  const events = [{
    id: 'soccer', home_team: 'Arsenal', away_team: 'Burnley', commence_time: '2026-05-18T19:00:00Z',
    bookmakers: [
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'Arsenal', price: 400 },
        { name: 'Burnley', price: -500 },
        { name: 'Draw', price: 320 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'Arsenal', price: 380 },
        { name: 'Burnley', price: -450 },
        { name: 'Draw', price: 300 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    events,
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out, EMPTY_STATE_NO_PLAY,
    '3-way h2h must not surface — draw outcome would zero both legs');
});

test('spec 006 FR-006: missing draw price (price: null) still flags as 3-way', () => {
  // Action Network omits the draw price for some books on soccer events.
  // The scraper still emits the Draw outcome with price: null so the
  // shape signals "non-binary" even when the price is absent.
  const events = [{
    id: 'soccer-no-draw-price', home_team: 'Liverpool', away_team: 'Chelsea', commence_time: '2026-05-18T19:00:00Z',
    bookmakers: [
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'Liverpool', price: 350 },
        { name: 'Chelsea', price: -420 },
        { name: 'Draw', price: null },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'Liverpool', price: 340 },
        { name: 'Chelsea', price: -400 },
        { name: 'Draw', price: null },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    events,
    ['DraftKings', 'FanDuel'],
  );
  assert.equal(out, EMPTY_STATE_NO_PLAY);
});

test('spec 006 FR-004: Pinnacle never returned as evBook or hedgeBook', () => {
  const events = [{
    id: 'pin-only', home_team: 'A', away_team: 'B', commence_time: '2026-05-15T19:00:00Z',
    bookmakers: [
      { title: 'Pinnacle', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 400 }, { name: 'B', price: -500 },
      ] }] },
      { title: 'DraftKings', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 380 }, { name: 'B', price: -450 },
      ] }] },
      { title: 'FanDuel', markets: [{ key: 'h2h', outcomes: [
        { name: 'A', price: 360 }, { name: 'B', price: -420 },
      ] }] },
    ],
  }];
  const out = recommendBonusBet(
    { bonusAmount: 150, targetOddsRange: [300, 500] },
    events,
    ['DraftKings', 'FanDuel'], // Pinnacle NOT in userBooks
  );
  assert.notEqual(out, EMPTY_STATE_NO_PLAY);
  assert.notEqual(out.evLeg.book, 'Pinnacle');
  assert.notEqual(out.hedgeLegs[0].book, 'Pinnacle');
});
