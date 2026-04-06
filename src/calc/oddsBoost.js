// Odds boost evaluator. A boost is +EV whenever the boosted decimal odds
// exceed the "fair" decimal odds (usually taken from a sharp reference book
// like Pinnacle or from a no-vig calculation across a soft book's market).
//
//   EV% = (boosted / fair) - 1
//   $EV = stake * EV%

export function oddsBoostEV({ boostedDecimal, fairDecimal, stake }) {
  const Db = Number(boostedDecimal);
  const Df = Number(fairDecimal);
  const S = Number(stake);
  if (!Number.isFinite(Db) || Db <= 1) return null;
  if (!Number.isFinite(Df) || Df <= 1) return null;
  if (!Number.isFinite(S) || S <= 0) return null;

  const evPercent = Db / Df - 1;
  const dollarEV = S * evPercent;

  return {
    evPercent,
    dollarEV,
    worthTaking: evPercent > 0,
  };
}
