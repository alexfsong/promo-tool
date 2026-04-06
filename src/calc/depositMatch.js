// Deposit match EV (beginner single-wager approximation).
//
// Terms:
//   M = match amount (free money credited after deposit)
//   k = rollover / playthrough multiplier (e.g. 5x means you must wager 5*M total)
//   h = house hold per wager (e.g. 0.0476 on a standard -110/-110 market)
//
// The naive expected cost of wagering (k*M) at hold h is (k*M*h). So:
//   EV ≈ M - (k * M * h)
//
// This is a first-order approximation — it ignores variance, partial withdrawals,
// and the fact that rollover often applies to the deposit + match combined. It's
// good enough to tell a beginner "is this promo worth taking at all?"

export function depositMatchEV({ match, rolloverMultiplier, houseHold }) {
  const M = Number(match);
  const k = Number(rolloverMultiplier);
  const h = Number(houseHold);
  if (!Number.isFinite(M) || M <= 0) return null;
  if (!Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(h) || h < 0 || h >= 1) return null;

  const expectedCost = k * M * h;
  const ev = M - expectedCost;
  const evPercent = ev / M;

  return {
    ev,              // expected net dollars from taking the promo
    evPercent,       // EV as fraction of match amount
    expectedCost,    // expected dollars lost to the book via hold
    worthTaking: ev > 0,
  };
}
