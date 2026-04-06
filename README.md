# Promo Tool

A Chrome extension that calculates the expected value of sportsbook promotions. Designed for beginners — plain-English explanations alongside the math.

## Calculators

| Tab | What it does |
|---|---|
| **Bonus Bet** | Finds the hedge stake to lock in guaranteed cash from a bonus bet |
| **Risk-Free** | Calculates expected value of a risk-free / second-chance bet |
| **Deposit Match** | Determines if a deposit match offer is worth taking after rollover |
| **Odds Boost** | Checks whether a boosted line is actually +EV vs fair odds |

## Install (Developer Mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `promo-tool/` directory
5. Click the extension icon in your toolbar

## Run Tests

```bash
npm test
```

All 13 unit tests cover every calculator formula with hand-verified expected values.

## Project Structure

```
promo-tool/
├── manifest.json
├── package.json
├── popup/
│   ├── popup.html       # Extension UI
│   ├── popup.css
│   └── popup.js         # Tab wiring + result rendering
├── src/
│   ├── calc/
│   │   ├── odds.js          # Odds conversions (American ↔ decimal)
│   │   ├── bonusBet.js      # Hedge stake calculator
│   │   ├── riskFree.js      # EV for risk-free bets
│   │   ├── depositMatch.js  # Deposit match EV
│   │   └── oddsBoost.js     # Odds boost EV
│   └── ui/
│       └── explanations.js  # Beginner-friendly explainer text
└── test/
    └── calc.test.js
```

## Advanced Mode

Toggle **Advanced mode** in the top-right to hide the beginner explanations and access extra inputs (e.g., custom win probability for risk-free bets).

## v2 Ideas

- Auto-fill odds by reading from the DraftKings/FanDuel bet slip (content script)
- Promo feed: surface current DK/FD offers
- Kelly stake sizing
- Mobile web app version (calc logic is already framework-free)
