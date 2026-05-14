// Pinnacle public Arcadia API.
// No auth beyond a long-public guest key. Returns AMERICAN odds (integers).
//
// Endpoints used:
//   GET /0.1/leagues/{leagueId}/matchups            — game list with teams
//   GET /0.1/leagues/{leagueId}/markets/straight    — h2h/spread/total prices
//
// We emit one bookmaker entry per event titled 'Pinnacle'. Pinnacle is the
// sharp benchmark — the EV+ tab uses its no-vig fair as truth.

import { eventKey } from '../normalize.js';

const BASE = 'https://guest.api.arcadia.pinnacle.com/0.1';
const HEADERS = {
  'X-API-Key': 'CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R',
  'Accept': 'application/json',
  'Referer': 'https://www.pinnacle.com/',
};

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Pinnacle ${path} → ${res.status}`);
  return res.json();
}

async function fetchMatchups(leagueId) {
  // Top-level matchups: parent === null and type === 'matchup'.
  // The rest are 'special' (futures, alternates, props, series).
  const all = await getJson(`/leagues/${leagueId}/matchups`);
  return all.filter(m => m.parent == null && m.type === 'matchup');
}

async function fetchMarkets(leagueId) {
  return getJson(`/leagues/${leagueId}/markets/straight`);
}

function buildBookmakerForMatchup(matchup, marketsForMatchup) {
  const home = matchup.participants?.find(p => p.alignment === 'home');
  const away = matchup.participants?.find(p => p.alignment === 'away');
  if (!home || !away) return null;

  // Period 0 = full game. Filter alternates; we want main line only.
  const main = marketsForMatchup.filter(m => m.period === 0 && m.isAlternate === false);
  const markets = [];

  // h2h
  const ml = main.find(m => m.type === 'moneyline');
  if (ml && ml.prices?.length === 2) {
    const homePrice = ml.prices.find(p => p.designation === 'home');
    const awayPrice = ml.prices.find(p => p.designation === 'away');
    if (Number.isFinite(homePrice?.price) && Number.isFinite(awayPrice?.price)) {
      markets.push({
        key: 'h2h',
        outcomes: [
          { name: home.name, price: homePrice.price },
          { name: away.name, price: awayPrice.price },
        ],
      });
    }
  }

  // spread
  const sp = main.find(m => m.type === 'spread');
  if (sp && sp.prices?.length === 2) {
    const homePrice = sp.prices.find(p => p.designation === 'home');
    const awayPrice = sp.prices.find(p => p.designation === 'away');
    if (Number.isFinite(homePrice?.price) && Number.isFinite(awayPrice?.price)) {
      markets.push({
        key: 'spreads',
        outcomes: [
          { name: home.name, price: homePrice.price, point: homePrice.points },
          { name: away.name, price: awayPrice.price, point: awayPrice.points },
        ],
      });
    }
  }

  // total
  const tot = main.find(m => m.type === 'total');
  if (tot && tot.prices?.length === 2) {
    const overPrice = tot.prices.find(p => p.designation === 'over');
    const underPrice = tot.prices.find(p => p.designation === 'under');
    if (Number.isFinite(overPrice?.price) && Number.isFinite(underPrice?.price)) {
      markets.push({
        key: 'totals',
        outcomes: [
          { name: 'Over', price: overPrice.price, point: overPrice.points },
          { name: 'Under', price: underPrice.price, point: underPrice.points },
        ],
      });
    }
  }

  if (!markets.length) return null;

  return {
    key: 'pinnacle',
    title: 'Pinnacle',
    last_update: new Date().toISOString(),
    markets,
  };
}

// Returns SourceEvent[].
export async function scrapePinnacle(sport) {
  const out = [];
  for (const leagueId of sport.pinnacle.leagueIds) {
    let matchups, markets;
    try {
      [matchups, markets] = await Promise.all([
        fetchMatchups(leagueId),
        fetchMarkets(leagueId),
      ]);
    } catch (err) {
      console.error(`pinnacle ${sport.key} league ${leagueId}: ${err.message}`);
      continue;
    }

    const marketsByMatchup = new Map();
    for (const m of markets) {
      if (!marketsByMatchup.has(m.matchupId)) marketsByMatchup.set(m.matchupId, []);
      marketsByMatchup.get(m.matchupId).push(m);
    }

    for (const matchup of matchups) {
      if (!matchup.startTime) continue;
      const home = matchup.participants?.find(p => p.alignment === 'home');
      const away = matchup.participants?.find(p => p.alignment === 'away');
      if (!home || !away) continue;

      const bookmaker = buildBookmakerForMatchup(matchup, marketsByMatchup.get(matchup.id) || []);
      if (!bookmaker) continue;

      out.push({
        eventKey: eventKey(home.name, away.name, matchup.startTime),
        home_team: home.name,
        away_team: away.name,
        commence_time: matchup.startTime,
        bookmaker,
      });
    }
  }
  return out;
}
