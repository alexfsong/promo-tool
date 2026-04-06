export const explanations = {
  bonusBet: {
    title: 'How bonus bet conversion works',
    body: `A bonus bet is different from cash — if it wins, you only get the profit, not your stake back.
The trick is to use the bonus bet on one outcome and bet your own cash on the opposite outcome.
No matter what happens, one side wins. With the right amounts, you guarantee yourself a profit.

Example: You have a $100 bonus bet. You use it on Team A to win at +200.
You also bet $95 of your own cash on Team B to win at -110.
• If Team A wins: bonus profit = $200, minus your $95 hedge = $105 profit
• If Team B wins: your hedge wins $86, and you lost nothing on the bonus
Either way, you walk away with cash.`,
  },

  riskFree: {
    title: 'How risk-free bets work',
    body: `A "risk-free" or "second chance" bet means: if your first bet loses, the book gives you a bonus bet back (usually the same amount).
Because you get a second shot, there's expected value even on a fair-odds bet.

Example: $100 risk-free bet at +100 (even odds), refund converts at 70%.
• Win (50% chance): +$100
• Lose (50% chance): get $100 bonus bet → convert to ~$70 cash
Expected value ≈ $35 — free money just for placing the first bet.`,
  },

  depositMatch: {
    title: 'How deposit match offers work',
    body: `The book matches your deposit with bonus money, but there's a catch: you usually have to wager a multiple of the bonus before you can withdraw.
The key number is the rollover requirement — e.g. "5x" means wager 5× the bonus amount.

Every time you wager, the house takes a small edge (the "hold"). Multiplied over the rollover, this eats into your bonus.
If the hold × rollover is less than 100%, the promo is profitable.

Example: $200 match, 5x rollover, 4.76% hold per bet.
Expected cost: $200 × 5 × 0.0476 = $47.60
Net EV: $200 − $47.60 = $152.40 — worth doing!`,
  },

  oddsBoost: {
    title: 'How odds boosts work',
    body: `Sportsbooks sometimes temporarily increase the payout on a bet — e.g. boosting +100 to +150.
The question is whether the boosted odds are better than the true ("fair") odds.

Fair odds represent no house edge. They can be found on sharp books like Pinnacle, or by removing the vig from the book's own market.

Example: A team's fair odds are +100 (50% win chance). The book boosts them to +150.
At +150 you're getting paid as if the team has a 40% win chance, but they actually win 50% of the time.
That gap is your edge — and the bigger it is, the more you should bet.`,
  },
};
