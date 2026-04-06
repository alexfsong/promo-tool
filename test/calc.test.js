import { test } from 'node:test';
import assert from 'node:assert/strict';

import { americanToDecimal, decimalToAmerican, impliedProb, parseOdds } from '../src/calc/odds.js';
import { bonusBetHedge } from '../src/calc/bonusBet.js';
import { riskFreeEV } from '../src/calc/riskFree.js';
import { depositMatchEV } from '../src/calc/depositMatch.js';
import { oddsBoostEV } from '../src/calc/oddsBoost.js';

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('americanToDecimal: +100=2.0, -110≈1.909, +200=3.0', () => {
  assert.equal(americanToDecimal(100), 2);
  assert.ok(approx(americanToDecimal(-110), 1 + 100 / 110));
  assert.equal(americanToDecimal(200), 3);
  assert.ok(approx(americanToDecimal(-200), 1.5));
});

test('decimalToAmerican: 2.0=+100, 1.5=-200, 3.0=+200', () => {
  assert.equal(decimalToAmerican(2), 100);
  assert.equal(decimalToAmerican(1.5), -200);
  assert.equal(decimalToAmerican(3), 200);
});

test('impliedProb: 2.0=0.5, 4.0=0.25', () => {
  assert.equal(impliedProb(2), 0.5);
  assert.equal(impliedProb(4), 0.25);
});

test('parseOdds: american with sign, american >=100, decimal <100', () => {
  assert.equal(parseOdds('+100'), 2);
  assert.equal(parseOdds('-200'), 1.5);
  assert.equal(parseOdds('150'), 2.5);
  assert.equal(parseOdds('2.5'), 2.5);
  assert.equal(parseOdds('1.91'), 1.91);
});

test('bonusBetHedge: symmetric 2.0/2.0 = 50% conversion', () => {
  const r = bonusBetHedge({ bonus: 100, backDecimal: 2, layDecimal: 2 });
  assert.equal(r.hedgeStake, 50);
  assert.equal(r.lockedValue, 50);
  assert.equal(r.conversionRate, 0.5);
});

test('bonusBetHedge: $100 bonus at back +200 (B=3), lay -110 (L=21/11)', () => {
  // hedge = 100*(3-1)/(21/11) = 2200/21 ≈ 104.76
  // locked = 104.76*(10/11) ≈ 95.24
  const L = 21 / 11;
  const r = bonusBetHedge({ bonus: 100, backDecimal: 3, layDecimal: L });
  assert.ok(approx(r.hedgeStake, 2200 / 21, 1e-4));
  assert.ok(approx(r.lockedValue, 2000 / 21, 1e-4));
});

test('bonusBetHedge: rejects invalid inputs', () => {
  assert.equal(bonusBetHedge({ bonus: 0, backDecimal: 2, layDecimal: 2 }), null);
  assert.equal(bonusBetHedge({ bonus: 100, backDecimal: 1, layDecimal: 2 }), null);
});

test('riskFreeEV: $50 stake at even odds, $50 refund, 70% conversion', () => {
  // p=0.5, win=25, lose=25, refund=0.5*50*0.7=17.5, ev=17.5
  const r = riskFreeEV({ stake: 50, decimal: 2, refund: 50, conversionRate: 0.7 });
  assert.ok(approx(r.ev, 17.5, 1e-6));
});

test('riskFreeEV: $100 stake at +200, $100 refund, 70% conversion', () => {
  // p=1/3, win=66.67, lose=66.67, refund=(2/3)*100*0.7=46.67, ev=46.67
  const r = riskFreeEV({ stake: 100, decimal: 3, refund: 100, conversionRate: 0.7 });
  assert.ok(approx(r.ev, 140 / 3, 1e-4));
});

test('depositMatchEV: $500 match, 5x rollover, 4.76% hold', () => {
  const r = depositMatchEV({ match: 500, rolloverMultiplier: 5, houseHold: 0.0476 });
  assert.ok(approx(r.expectedCost, 119, 1e-6));
  assert.ok(approx(r.ev, 381, 1e-6));
  assert.equal(r.worthTaking, true);
});

test('depositMatchEV: high rollover = negative EV', () => {
  const r = depositMatchEV({ match: 100, rolloverMultiplier: 30, houseHold: 0.0476 });
  assert.ok(r.ev < 0);
  assert.equal(r.worthTaking, false);
});

test('oddsBoostEV: boosted +150 vs fair +100, $50 stake', () => {
  const r = oddsBoostEV({ boostedDecimal: 2.5, fairDecimal: 2, stake: 50 });
  assert.ok(approx(r.evPercent, 0.25, 1e-9));
  assert.ok(approx(r.dollarEV, 12.5, 1e-9));
  assert.equal(r.worthTaking, true);
});

test('oddsBoostEV: boost below fair = -EV', () => {
  const r = oddsBoostEV({ boostedDecimal: 1.9, fairDecimal: 2, stake: 100 });
  assert.ok(r.evPercent < 0);
  assert.equal(r.worthTaking, false);
});
