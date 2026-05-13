// Pure orchestration layer. Consumes already-fetched provider events plus
// user inputs, returns a BestPlay (or BestPlayAdvanced) object that the UI
// renders directly. No DOM, no chrome.*, no fetch. Per Constitution §I + §II.

import { americanToDecimal } from '../calc/odds.js';
import { bonusBetHedge } from '../calc/bonusBet.js';
import { riskFreeEV } from '../calc/riskFree.js';
import { depositMatchEV } from '../calc/depositMatch.js';
import { oddsBoostEV } from '../calc/oddsBoost.js';
import { beginnerPlan, advancedPlan } from './betAndGet.js';

/**
 * @typedef {Object} HedgeLeg
 * @property {string} book
 * @property {{home: string, away: string, commenceTime?: string}} event
 * @property {'h2h'|'spreads'|'totals'} market
 * @property {string} selection
 * @property {number} odds        American
 * @property {number} cashStake   Rounded to $0.01 (FR-006)
 */

/**
 * @typedef {Object} BestPlay
 * @property {{kind: 'lockedCash', amount: number}} headline
 * @property {Object} evLeg
 * @property {HedgeLeg[]} hedgeLegs
 * @property {{formulaLine: string, ev?: number}} showDetails
 */

/**
 * @typedef {Object} BestPlayAdvanced
 * @property {{kind: 'netEV', amount: number}} headline
 */

// Sentinels the UI can render as plain-language messages (FR-011, FR-014).
export const EMPTY_STATE_NO_PLAY = { kind: 'no-play' };
export const EMPTY_STATE_NEED_BOOKS = { kind: 'need-more-books' };

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Iterate provider events and find the single best (book + outcome + hedge) that
// converts `bonusAmount` to the highest locked cash inside [minOdds, maxOdds].
// Extracted from popup.js scanner (research.md R3). Pure: no DOM, no chrome.*.
export function recommendHedge({ events, bonusAmount, minOdds, maxOdds, userBooks }) {
  if (!Array.isArray(events) || !events.length) return null;
  if (!Array.isArray(userBooks)) userBooks = [];

  const myBooks = new Set(userBooks);
  let best = null;

  for (const event of events) {
    for (const bm of event.bookmakers || []) {
      const market = (bm.markets || []).find(m => m.key === 'h2h');
      if (!market || market.outcomes.length !== 2) continue;

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const backOdds = outcome.price;
        if (backOdds < minOdds || backOdds > maxOdds) continue;
        if (myBooks.size && !myBooks.has(bm.title)) continue;

        const oppOutcome = market.outcomes.find((_, idx) => idx !== i);
        if (!oppOutcome) continue;

        let bestLayOdds = null;
        let bestLayBook = null;
        for (const bm2 of event.bookmakers || []) {
          if (bm2.title === bm.title) continue;
          if (myBooks.size && !myBooks.has(bm2.title)) continue;
          const mkt2 = (bm2.markets || []).find(m => m.key === 'h2h');
          if (!mkt2) continue;
          const opp = mkt2.outcomes.find(o => o.name === oppOutcome.name);
          if (!opp) continue;
          if (bestLayOdds === null || opp.price > bestLayOdds) {
            bestLayOdds = opp.price;
            bestLayBook = bm2.title;
          }
        }
        if (bestLayOdds === null) continue;

        const hedge = bonusBetHedge({
          bonus: bonusAmount,
          backDecimal: americanToDecimal(backOdds),
          layDecimal: americanToDecimal(bestLayOdds),
        });
        if (!hedge || hedge.lockedValue <= 0) continue;

        if (!best || hedge.lockedValue > best.lockedCash) {
          best = {
            event: { home: event.home_team, away: event.away_team, commenceTime: event.commence_time },
            evBook: bm.title,
            evSelection: outcome.name,
            evOdds: backOdds,
            hedgeBook: bestLayBook,
            hedgeSelection: oppOutcome.name,
            hedgeOdds: bestLayOdds,
            hedgeStake: round2(hedge.hedgeStake),
            lockedCash: round2(hedge.lockedValue),
          };
        }
      }
    }
  }

  return best;
}

// --- Bonus Bet ---
export function recommendBonusBet(inputs, providerEvents, userBooks) {
  if (!Array.isArray(userBooks) || userBooks.length < 2) return EMPTY_STATE_NEED_BOOKS;
  const bonusAmount = Number(inputs?.bonusAmount);
  const [minOdds, maxOdds] = inputs?.targetOddsRange ?? [300, 500];
  if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return null;

  const best = recommendHedge({ events: providerEvents, bonusAmount, minOdds, maxOdds, userBooks });
  if (!best) return EMPTY_STATE_NO_PLAY;

  return {
    headline: { kind: 'lockedCash', amount: best.lockedCash },
    evLeg: {
      book: best.evBook,
      event: best.event,
      market: 'h2h',
      selection: best.evSelection,
      odds: best.evOdds,
      stake: null,
      stakeKind: 'bonusBet',
    },
    hedgeLegs: [{
      book: best.hedgeBook,
      event: best.event,
      market: 'h2h',
      selection: best.hedgeSelection,
      odds: best.hedgeOdds,
      cashStake: best.hedgeStake,
    }],
    showDetails: {
      formulaLine: `Hedge stake = $${bonusAmount} × (B − 1) / L where B = ${best.evOdds > 0 ? '+' : ''}${best.evOdds} (decimal ${americanToDecimal(best.evOdds).toFixed(3)}) and L = ${best.hedgeOdds > 0 ? '+' : ''}${best.hedgeOdds} (decimal ${americanToDecimal(best.hedgeOdds).toFixed(3)}). Locked cash = hedge × (L − 1).`,
    },
  };
}

// --- Risk-Free ---
// Risk-Free's "best play" is to place the qualifying bet at the +EV book/event
// AND, in case it loses, you receive a bonus bet which you then convert. The
// locked-cash headline for Risk-Free uses the same cross-book hedge math as a
// bonus bet of size `refund * conversionRate` (i.e., the cash-equivalent value
// of the refund). EV-style detail is kept in showDetails.ev only.
export function recommendRiskFree(inputs, providerEvents, userBooks) {
  if (!Array.isArray(userBooks) || userBooks.length < 2) return EMPTY_STATE_NEED_BOOKS;
  const stake = Number(inputs?.stake);
  const oddsAmerican = Number(inputs?.odds);
  const refund = Number(inputs?.refund ?? stake);
  const conversionRate = Number(inputs?.conversionRate ?? 0.7);
  if (!Number.isFinite(stake) || stake <= 0) return null;
  if (!Number.isFinite(oddsAmerican) || Math.abs(oddsAmerican) < 100) return null;

  const decimal = americanToDecimal(oddsAmerican);
  const refundCashEquivalent = refund * conversionRate;

  // For the "if you lose" branch we project a bonus-bet conversion against
  // current market odds. Use the bonus-bet recommender to surface a concrete
  // hedge pair to run after the refund credits.
  const deferred = recommendHedge({
    events: providerEvents,
    bonusAmount: refund,
    minOdds: 300,
    maxOdds: 500,
    userBooks,
  });
  if (!deferred) return EMPTY_STATE_NO_PLAY;

  const ev = riskFreeEV({ stake, decimal, refund, conversionRate });
  return {
    headline: { kind: 'lockedCash', amount: round2(refundCashEquivalent) },
    evLeg: {
      book: deferred.evBook,
      event: deferred.event,
      market: 'h2h',
      selection: deferred.evSelection,
      odds: deferred.evOdds,
      stake: round2(stake),
      stakeKind: 'cash',
    },
    hedgeLegs: [{
      book: deferred.hedgeBook,
      event: deferred.event,
      market: 'h2h',
      selection: deferred.hedgeSelection,
      odds: deferred.hedgeOdds,
      cashStake: deferred.hedgeStake,
    }],
    showDetails: {
      formulaLine: `If first bet loses, $${refund} refund converts at ${(conversionRate * 100).toFixed(0)}% via the deferred bonus-bet plan above.`,
      ev: ev?.ev ?? undefined,
    },
  };
}

// --- Deposit Match ---
// No hedge — deposit-match is a long-running rollover grind, not a single
// event play. The "best play" surface is a no-event card with the EV summary.
export function recommendDepositMatch(inputs /*, providerEvents, userBooks */) {
  const match = Number(inputs?.match);
  const rolloverMultiplier = Number(inputs?.rolloverMultiplier);
  const houseHold = Number(inputs?.houseHold ?? 0.0476);
  if (!Number.isFinite(match) || match <= 0) return null;
  if (!Number.isFinite(rolloverMultiplier) || rolloverMultiplier <= 0) return null;

  const ev = depositMatchEV({ match, rolloverMultiplier, houseHold });
  if (!ev) return null;
  if (!ev.worthTaking) return EMPTY_STATE_NO_PLAY;

  return {
    headline: { kind: 'lockedCash', amount: round2(ev.ev) },
    evLeg: null,
    hedgeLegs: [],
    showDetails: {
      formulaLine: `EV ≈ match − (rollover × match × hold) = $${match} − ($${(rolloverMultiplier * match).toFixed(2)} × ${(houseHold * 100).toFixed(2)}%) = $${round2(ev.ev).toFixed(2)}. Grind on low-hold markets.`,
      ev: ev.ev,
    },
  };
}

// --- Odds Boost ---
// A boost is point-in-time; recommend a single cash play at the boost.
export function recommendOddsBoost(inputs /*, providerEvents, userBooks */) {
  const boostedOddsAmerican = Number(inputs?.boostedOdds);
  const fairOddsAmerican = Number(inputs?.fairOdds);
  const stake = Number(inputs?.stake);
  if (!Number.isFinite(stake) || stake <= 0) return null;
  if (Math.abs(boostedOddsAmerican) < 100 || Math.abs(fairOddsAmerican) < 100) return null;

  const boostedDecimal = americanToDecimal(boostedOddsAmerican);
  const fairDecimal = americanToDecimal(fairOddsAmerican);
  const ev = oddsBoostEV({ boostedDecimal, fairDecimal, stake });
  if (!ev) return null;
  if (!ev.worthTaking) return EMPTY_STATE_NO_PLAY;

  return {
    headline: { kind: 'lockedCash', amount: round2(ev.dollarEV) },
    evLeg: null,
    hedgeLegs: [],
    showDetails: {
      formulaLine: `Edge = boosted/fair − 1 = ${(ev.evPercent * 100).toFixed(2)}%. Bet $${stake} → expected +$${round2(ev.dollarEV).toFixed(2)}.`,
      ev: ev.dollarEV,
    },
  };
}

// --- Bet & Get ---
// Mode-dependent per FR-016. Headline differs by mode (lockedCash vs netEV).
export function recommendBetAndGet(inputs, providerEvents, userBooks) {
  if (!Array.isArray(userBooks) || userBooks.length < 2) return EMPTY_STATE_NEED_BOOKS;
  const qualifyingStake = Number(inputs?.qualifyingStake);
  const bonusAmount = Number(inputs?.bonusAmount);
  const conversionRate = Number(inputs?.conversionRate ?? 0.7);
  const mode = inputs?.mode === 'advanced' ? 'advanced' : 'beginner';
  if (!Number.isFinite(qualifyingStake) || qualifyingStake <= 0) return null;
  if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return null;

  const qualifyingPlay = recommendHedge({
    events: providerEvents,
    bonusAmount: qualifyingStake,
    minOdds: -300,
    maxOdds: 500,
    userBooks,
  });
  if (!qualifyingPlay) return EMPTY_STATE_NO_PLAY;

  const deferredBonusPlay = recommendHedge({
    events: providerEvents,
    bonusAmount,
    minOdds: 300,
    maxOdds: 500,
    userBooks,
  });
  if (!deferredBonusPlay) return EMPTY_STATE_NO_PLAY;

  if (mode === 'beginner') {
    const plan = beginnerPlan({
      qualifyingStake,
      bonusAmount,
      qualifyingOdds: qualifyingPlay.evOdds,
      hedgeOdds: qualifyingPlay.hedgeOdds,
      bonusHedgeOdds: deferredBonusPlay.hedgeOdds,
      conversionRate,
    });
    return {
      headline: { kind: 'lockedCash', amount: round2(plan.worstCaseLockedCash) },
      evLeg: {
        book: qualifyingPlay.evBook,
        event: qualifyingPlay.event,
        market: 'h2h',
        selection: qualifyingPlay.evSelection,
        odds: qualifyingPlay.evOdds,
        stake: round2(qualifyingStake),
        stakeKind: 'cash',
      },
      hedgeLegs: [{
        book: qualifyingPlay.hedgeBook,
        event: qualifyingPlay.event,
        market: 'h2h',
        selection: qualifyingPlay.hedgeSelection,
        odds: qualifyingPlay.hedgeOdds,
        cashStake: round2(plan.stage1.hedgeStake),
      }],
      showDetails: {
        formulaLine: `Stage 1 hedge locks $${plan.stage1.lockedValue.toFixed(2)} now. Stage 2 (if qualifying wins): bonus bet converts via deferred plan, adding ~$${plan.stage2.cashIfBonusCredits.toFixed(2)}. Worst case (qualifying loses, no bonus credit): $${plan.worstCaseLockedCash.toFixed(2)}.`,
      },
      stage2: {
        book: deferredBonusPlay.evBook,
        event: deferredBonusPlay.event,
        evSelection: deferredBonusPlay.evSelection,
        evOdds: deferredBonusPlay.evOdds,
        hedgeBook: deferredBonusPlay.hedgeBook,
        hedgeSelection: deferredBonusPlay.hedgeSelection,
        hedgeOdds: deferredBonusPlay.hedgeOdds,
        hedgeCashStake: round2(deferredBonusPlay.hedgeStake),
      },
    };
  }

  // Advanced
  const plan = advancedPlan({
    qualifyingStake,
    bonusAmount,
    qualifyingOdds: qualifyingPlay.evOdds,
    bonusHedgeOdds: deferredBonusPlay.hedgeOdds,
    conversionRate,
  });
  return {
    headline: { kind: 'netEV', amount: round2(plan.netEV) },
    evLeg: {
      book: qualifyingPlay.evBook,
      event: qualifyingPlay.event,
      market: 'h2h',
      selection: qualifyingPlay.evSelection,
      odds: qualifyingPlay.evOdds,
      stake: round2(qualifyingStake),
      stakeKind: 'cash',
    },
    hedgeLegs: [],
    showDetails: {
      formulaLine: `Advanced: place qualifying $${qualifyingStake} unhedged at +EV. If it wins, hedge the bonus per stage 2. Net EV = p_win × (payout + L2) − (1 − p_win) × stake = $${plan.netEV.toFixed(2)}.`,
      ev: plan.netEV,
    },
    stage2: {
      book: deferredBonusPlay.evBook,
      event: deferredBonusPlay.event,
      evSelection: deferredBonusPlay.evSelection,
      evOdds: deferredBonusPlay.evOdds,
      hedgeBook: deferredBonusPlay.hedgeBook,
      hedgeSelection: deferredBonusPlay.hedgeSelection,
      hedgeOdds: deferredBonusPlay.hedgeOdds,
      hedgeCashStake: round2(deferredBonusPlay.hedgeStake),
    },
  };
}
