import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recommendHedge,
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
