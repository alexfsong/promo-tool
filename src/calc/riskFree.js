// Risk-free / second-chance bet EV.
// The user stakes S at decimal odds D. If the bet loses, the book refunds a
// bonus bet worth R (typically R = S, but some promos cap the refund).
// The bonus bet can be converted to cash at rate c (use 0.70 as a safe default).
//
// Standard assumption: true win probability p = 1/D (fair odds). The advanced
// UI can override p if the user believes the line has an edge.
//
// EV = p * S * (D - 1)            // win: net profit
//    - (1 - p) * S                // lose: lose stake
//    + (1 - p) * R * c            // lose: receive bonus bet worth R*c in cash

export function riskFreeEV({ stake, decimal, refund, conversionRate, winProb }) {
  const S = Number(stake);
  const D = Number(decimal);
  const R = Number(refund ?? stake);
  const c = Number(conversionRate ?? 0.7);
  if (!Number.isFinite(S) || S <= 0) return null;
  if (!Number.isFinite(D) || D <= 1) return null;
  if (!Number.isFinite(R) || R < 0) return null;
  if (!Number.isFinite(c) || c < 0 || c > 1) return null;

  const p = Number.isFinite(winProb) ? winProb : 1 / D;
  if (p < 0 || p > 1) return null;

  const winPayout = p * S * (D - 1);
  const loseLoss = (1 - p) * S;
  const refundValue = (1 - p) * R * c;
  const ev = winPayout - loseLoss + refundValue;

  return {
    ev,                 // expected dollar value of taking the promo
    evPercent: ev / S,  // EV as a fraction of stake
    winProb: p,
    refundValueIfLose: R * c,
  };
}
