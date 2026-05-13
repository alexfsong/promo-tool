// Bet & Get two-stage math (research.md R2).
//
// Beginner Mode: hedge both stages for a guaranteed worst-case floor.
//   Stage 1: cross-book cash hedge on the qualifying bet → locks L1 regardless.
//   Stage 2 (only if qualifying wins): bonus credits, convert via bonus-bet
//     hedge math at conversion rate r → adds bonusAmount * r in cash.
//   Worst-case headline = L1 (qualifying-loss branch — no bonus credit).
//
// Advanced Mode: skip stage 1 hedge; place qualifying unhedged on the +EV
// side. Hedge only the bonus if it credits.
//   netEV = p_win * (payout_win + L2) - (1 - p_win) * qualifyingStake
// where payout_win = qualifyingStake * (D_qualifying - 1) and L2 =
// bonusAmount * r.

import { americanToDecimal } from '../calc/odds.js';
import { bonusBetHedge } from '../calc/bonusBet.js';

export function beginnerPlan({
  qualifyingStake,
  bonusAmount,
  qualifyingOdds,
  hedgeOdds,
  bonusHedgeOdds, // unused in beginner math but kept in signature for completeness
  conversionRate,
}) {
  const stake = Number(qualifyingStake);
  const bonus = Number(bonusAmount);
  const r = Number(conversionRate);
  if (!Number.isFinite(stake) || stake <= 0) return null;
  if (!Number.isFinite(bonus) || bonus <= 0) return null;
  if (!Number.isFinite(r) || r < 0 || r > 1) return null;

  const qD = americanToDecimal(qualifyingOdds);
  const hD = americanToDecimal(hedgeOdds);
  if (!Number.isFinite(qD) || qD <= 1 || !Number.isFinite(hD) || hD <= 1) return null;

  // Stage 1: standard arb between qualifying-side cash bet at qD and hedge at hD.
  //   Profit if qualifying wins:  stake * (qD - 1) - hedgeStake
  //   Profit if hedge wins:       hedgeStake * (hD - 1) - stake
  // Set equal:
  //   stake*(qD - 1) - hedgeStake = hedgeStake*(hD - 1) - stake
  //   stake*qD = hedgeStake*hD
  //   hedgeStake = stake * qD / hD
  const hedgeStake = (stake * qD) / hD;
  const lockedValue = hedgeStake * (hD - 1) - stake; // worst-case = qualifying-loss branch

  // Stage 2 cash if bonus credits (qualifying-win branch): bonus * r.
  const stage2Cash = bonus * r;

  // Headline floor = worst-case branch = qualifying loses → no bonus credit → stage-1 locked only.
  // Note: stage-1 lockedValue here is *net* of the qualifying cash stake — so it's the floor.
  return {
    stage1: { hedgeStake, lockedValue },
    stage2: { cashIfBonusCredits: stage2Cash },
    worstCaseLockedCash: lockedValue,
  };
}

export function advancedPlan({
  qualifyingStake,
  bonusAmount,
  qualifyingOdds,
  bonusHedgeOdds,
  conversionRate,
}) {
  const stake = Number(qualifyingStake);
  const bonus = Number(bonusAmount);
  const r = Number(conversionRate);
  if (!Number.isFinite(stake) || stake <= 0) return null;
  if (!Number.isFinite(bonus) || bonus <= 0) return null;
  if (!Number.isFinite(r) || r < 0 || r > 1) return null;

  const qD = americanToDecimal(qualifyingOdds);
  if (!Number.isFinite(qD) || qD <= 1) return null;

  const pWin = 1 / qD; // implied prob from qualifying odds
  const payoutWin = stake * (qD - 1);
  const L2 = bonus * r;
  const netEV = pWin * (payoutWin + L2) - (1 - pWin) * stake;

  return {
    stage1: { unhedgedStake: stake, side: 'qualifying-ev-leg' },
    stage2: { cashIfBonusCredits: L2, bonusHedgeOdds },
    netEV,
  };
}
