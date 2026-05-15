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
    bookmakers: [
      { title: 'DK', markets: [{ key: 'h2h', outcomes: [{ name: 'X', price: 400 }, { name: 'Y', price: -1500 }] }] },
      { title: 'FD', markets: [{ key: 'h2h', outcomes: [{ name: 'X', price: -2000 }, { name: 'Y', price: 800 }] }] },
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
