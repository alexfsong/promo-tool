import { test } from 'node:test';
import assert from 'node:assert/strict';

import { beginnerPlan, advancedPlan } from '../src/promos/betAndGet.js';

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('beginnerPlan: qualifying-loss branch = stage-1 locked, no bonus credit', () => {
  // $5 qualifying at +200 (D=3), hedge at -120 (D=1.8333…), $150 bonus, r=0.7.
  // hedgeStake = 5 * 3 / 1.8333… = 8.1818…
  // lockedValue = 8.1818… * (1.8333… - 1) - 5 = 8.1818 * 0.8333 - 5 = 6.8181 - 5 = 1.8181…
  const plan = beginnerPlan({
    qualifyingStake: 5,
    bonusAmount: 150,
    qualifyingOdds: 200,
    hedgeOdds: -120,
    bonusHedgeOdds: -110,
    conversionRate: 0.7,
  });
  assert.ok(approx(plan.stage1.hedgeStake, 5 * 3 / (1 + 100 / 120), 1e-4));
  assert.equal(plan.worstCaseLockedCash, plan.stage1.lockedValue);
});

test('beginnerPlan: stage2 cash = bonus * conversionRate', () => {
  const plan = beginnerPlan({
    qualifyingStake: 5,
    bonusAmount: 150,
    qualifyingOdds: 200,
    hedgeOdds: -120,
    bonusHedgeOdds: -110,
    conversionRate: 0.7,
  });
  assert.equal(plan.stage2.cashIfBonusCredits, 105); // 150 * 0.7
});

test('beginnerPlan: rejects invalid inputs', () => {
  assert.equal(beginnerPlan({ qualifyingStake: 0, bonusAmount: 100, qualifyingOdds: 200, hedgeOdds: -120, bonusHedgeOdds: -110, conversionRate: 0.7 }), null);
  assert.equal(beginnerPlan({ qualifyingStake: 5, bonusAmount: 100, qualifyingOdds: 200, hedgeOdds: -120, bonusHedgeOdds: -110, conversionRate: 1.5 }), null);
});

test('advancedPlan: netEV formula p_win * (payout_win + L2) - (1-p_win) * stake', () => {
  // qualifying $5 at +200 (D=3, p_win=1/3, payout=10), bonus $150, r=0.7 (L2=105).
  // netEV = (1/3)*(10 + 105) - (2/3)*5 = 38.333… - 3.333… = 35.0
  const plan = advancedPlan({
    qualifyingStake: 5,
    bonusAmount: 150,
    qualifyingOdds: 200,
    bonusHedgeOdds: -110,
    conversionRate: 0.7,
  });
  assert.ok(approx(plan.netEV, 35, 1e-4));
});

test('advancedPlan: stage2 L2 = bonus * r', () => {
  const plan = advancedPlan({
    qualifyingStake: 5,
    bonusAmount: 150,
    qualifyingOdds: 200,
    bonusHedgeOdds: -110,
    conversionRate: 0.7,
  });
  assert.equal(plan.stage2.cashIfBonusCredits, 105);
});

test('advancedPlan: netEV = bonusAmount * r / qualifyingDecimal (invariant)', () => {
  // Algebraic identity: netEV = pWin*(stake*(qD-1) + L2) - (1-pWin)*stake
  //                          = (pWin*qD - 1)*stake + pWin*L2
  //                          = 0*stake + pWin*L2          [pWin = 1/qD]
  //                          = (bonus * r) / qD
  // At qD = 3 (+200), bonus=$150, r=0.7 → 150*0.7/3 = 35.
  const plan = advancedPlan({
    qualifyingStake: 5,
    bonusAmount: 150,
    qualifyingOdds: 200,
    bonusHedgeOdds: -110,
    conversionRate: 0.7,
  });
  assert.ok(approx(plan.netEV, (150 * 0.7) / 3, 1e-4));
});
