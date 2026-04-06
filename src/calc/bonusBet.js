// Bonus bet conversion: bonus bets pay *profit only* (stake is not returned).
// To lock in cash value, place the bonus bet on one outcome at decimal odds B,
// and hedge the other outcome with a cash stake S at decimal odds L.
//
// Profit if bonus wins:  (B - 1) * bonus - S
// Profit if hedge wins:  S * (L - 1)
//
// Setting these equal and solving for S:
//   S = bonus * (B - 1) / L
// Locked value is then the common profit on either outcome.

export function bonusBetHedge({ bonus, backDecimal, layDecimal }) {
  const bonusAmt = Number(bonus);
  const B = Number(backDecimal);
  const L = Number(layDecimal);
  if (!Number.isFinite(bonusAmt) || bonusAmt <= 0) return null;
  if (!Number.isFinite(B) || B <= 1) return null;
  if (!Number.isFinite(L) || L <= 1) return null;

  const hedgeStake = (bonusAmt * (B - 1)) / L;
  const lockedValue = hedgeStake * (L - 1);
  const conversionRate = lockedValue / bonusAmt;

  return {
    hedgeStake,      // cash to put on the opposite outcome
    lockedValue,     // guaranteed profit regardless of outcome
    conversionRate,  // lockedValue / bonus, e.g. 0.72 = 72%
  };
}
