# Promo Tool

A Chrome extension that helps you find and maximize value from sportsbook promotions — bonus bets, risk-free bets, deposit match offers, and odds boosts. Designed to be shared with friends who want to capture free EV without needing to understand the underlying math.

Opens as a **side panel** so it stays visible while you browse sportsbook pages.

## Features

### Promo Scanner
Scans live odds across all books and ranks every outcome by bonus bet conversion rate. Set your target odds range (+300–+500 is ideal) and your bonus bet amount, and the scanner finds the best available cross-book hedge for each opportunity.

- Searches a single sport or **all active sports at once**
- Skips 3-way markets (soccer, etc.) that can't be cleanly hedged
- Filters hedges to only books in your "My sportsbooks" list
- Click any result to auto-fill the Bonus Bet calculator
- Results persist for the browser session — no re-scanning needed when you switch tabs

### Calculators

| Tab | What it does |
|---|---|
| **Bonus Bet** | Computes the hedge stake and guaranteed cash locked from a bonus bet |
| **Risk-Free** | Expected value of a risk-free / second-chance bet given a conversion rate |
| **Deposit Match** | Whether a deposit match is worth taking after rollover requirements |
| **Odds Boost** | Whether a boosted line is actually +EV vs fair market odds |

Inputs accept American (`-110`, `+200`) or decimal (`1.91`, `3.0`) odds — auto-detected.

### Settings
- **The Odds API key** — required for Scanner. Free at [the-odds-api.com](https://the-odds-api.com) (500 requests/month).
- **My sportsbooks** — select every book you have an account at. The scanner restricts hedge legs to these books so results are always actionable.

### Advanced Mode
Toggle in the top-right to hide beginner explanations and unlock extra inputs (e.g., custom win probability for risk-free EV).

## Install

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `promo-tool/` directory
4. Click the extension icon — the side panel opens and stays open while you browse

## Setup

1. Open Settings (⚙) and paste your Odds API key
2. Select all the sportsbooks you have accounts at under **My sportsbooks**
3. Run a scan from the Scanner tab — results filter automatically to books you can use

## Run Tests

```bash
npm test
```

## Project Structure

```
promo-tool/
├── manifest.json
├── popup/
│   ├── popup.html          # Side panel UI
│   ├── popup.css
│   └── popup.js            # Tab logic, scanner, calculators
├── src/
│   ├── api/
│   │   └── oddsApi.js      # The Odds API client
│   ├── calc/
│   │   ├── odds.js         # American ↔ decimal conversions
│   │   ├── bonusBet.js     # Hedge stake + conversion rate
│   │   ├── riskFree.js     # Risk-free EV
│   │   ├── depositMatch.js # Deposit match EV
│   │   └── oddsBoost.js    # Odds boost EV
│   └── ui/
│       └── explanations.js # Beginner explainer text
├── background/
│   └── serviceWorker.js    # Side panel behavior + odds cache
├── content/
│   ├── contentScript.js    # Badges live odds on DK/FD pages
│   └── contentScript.css
└── test/
    └── calc.test.js
```
