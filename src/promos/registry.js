// Promo type registry. User-facing labels keyed in sportsbook language
// (FR-002), wired to the pure calculators under src/calc/. UI iterates this
// array to render the promo picker and the dynamic input fields.

export const promoRegistry = [
  {
    id: 'bonus-bet',
    label: 'Bonus Bet I already have',
    blurb: 'Convert a credited bonus bet into guaranteed cash.',
    fields: [
      { id: 'bonusAmount', label: 'Bonus bet amount ($)', type: 'money' },
      {
        id: 'targetOddsRange',
        label: 'Target odds range (American)',
        type: 'oddsRange',
        default: [300, 500],
      },
    ],
    produces: 'BestPlay',
  },
  {
    id: 'bet-and-get',
    label: 'Bet & Get bonus bets',
    blurb: 'Bet a qualifying amount, get bonus bets if it settles.',
    fields: [
      { id: 'qualifyingStake', label: 'Qualifying bet ($)', type: 'money' },
      { id: 'bonusAmount', label: 'Bonus bets credited if qualifying settles ($)', type: 'money' },
      {
        id: 'targetOddsRange',
        label: 'Target odds range (American)',
        type: 'oddsRange',
        default: [300, 500],
      },
      {
        id: 'conversionRate',
        label: 'Assumed bonus-to-cash conversion rate',
        type: 'percent',
        default: 0.70,
      },
    ],
    produces: 'BestPlay',
  },
  {
    id: 'risk-free',
    label: 'Risk-Free / No-Sweat First Bet',
    blurb: 'If your first bet loses, the book refunds it as a bonus bet.',
    fields: [
      { id: 'stake', label: 'Stake ($)', type: 'money' },
      { id: 'odds', label: 'Odds (American)', type: 'odds' },
      { id: 'refund', label: 'Refund amount if you lose ($)', type: 'money' },
      {
        id: 'conversionRate',
        label: 'Bonus-to-cash conversion rate',
        type: 'percent',
        default: 0.70,
      },
    ],
    produces: 'BestPlay',
  },
  {
    id: 'deposit-match',
    label: 'Deposit Match',
    blurb: 'The book matches part of your deposit with bonus money under a rollover.',
    fields: [
      { id: 'match', label: 'Match amount ($)', type: 'money' },
      { id: 'rolloverMultiplier', label: 'Rollover (x times the bonus)', type: 'money' },
      {
        id: 'houseHold',
        label: 'House edge per bet (%)',
        type: 'percent',
        default: 0.0476,
      },
    ],
    produces: 'BestPlay',
  },
  {
    id: 'profit-boost',
    label: 'Profit Boost / Odds Boost',
    blurb: 'The book temporarily raises a market\'s payout.',
    fields: [
      { id: 'boostedOdds', label: 'Boosted odds (American)', type: 'odds' },
      { id: 'fairOdds', label: 'Fair odds (American, e.g. Pinnacle)', type: 'odds' },
      { id: 'stake', label: 'Stake ($)', type: 'money' },
    ],
    produces: 'BestPlay',
  },
];

export function getPromoType(id) {
  return promoRegistry.find(p => p.id === id) ?? null;
}
