// Odds conversions. American odds use the convention: positive = underdog
// (profit per $100 stake), negative = favorite (stake needed to profit $100).
// Decimal odds are the total payout multiplier including stake.

export function americanToDecimal(american) {
  const n = Number(american);
  if (!Number.isFinite(n) || n === 0) return NaN;
  return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
}

export function decimalToAmerican(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) return NaN;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

export function impliedProb(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 0) return NaN;
  return 1 / d;
}

// Parse a user-entered odds value. Accepts:
//   - decimal ("1.91", "2.5")  — must be > 1 and < 100
//   - american ("-110", "+150", "200")
// Heuristic: if it starts with +/- or has |n| >= 100, treat as American.
export function parseOdds(input) {
  if (input == null) return NaN;
  const s = String(input).trim();
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  if (s.startsWith('+') || s.startsWith('-')) return americanToDecimal(n);
  if (Math.abs(n) >= 100) return americanToDecimal(n);
  return n; // decimal
}
