// Action Network public scoreboard endpoint.
// Returns american odds per book directly. The `book_id → title` map below is
// well-known but volatile; if a book reports as "Unknown #N" in output, look up
// the new id and add it.

import { eventKey } from '../normalize.js';

const BASE = 'https://api.actionnetwork.com/web/v1/scoreboard';

// Books to request. Add/remove freely — unknown ids are skipped at parse time.
const BOOK_IDS = [15, 30, 68, 69, 71, 75, 76, 79, 123, 972, 1004];

const BOOK_NAMES = {
  15: 'DraftKings',
  30: 'FanDuel',
  68: 'BetMGM',
  69: 'Caesars',
  71: 'PointsBet',
  75: 'Unibet',
  76: 'BetRivers',
  79: 'Betway',
  123: 'WynnBET',
  972: 'ESPN BET',
  1004: 'Hard Rock Bet',
};

function ymd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function dateRange(days) {
  const out = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() + i);
    out.push(ymd(d));
  }
  return out;
}

async function fetchDay(slug, dateStr) {
  const url = new URL(`${BASE}/${slug}`);
  url.searchParams.set('bookIds', BOOK_IDS.join(','));
  url.searchParams.set('date', dateStr);
  url.searchParams.set('periods', 'event');
  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'User-Agent': 'promo-tool-scraper/0.1' },
  });
  if (!res.ok) throw new Error(`Action ${slug}/${dateStr} → ${res.status}`);
  return res.json();
}

// Convert one game.odds[] entry (one book) into outcome arrays for h2h/spreads/totals.
// `sportGroup` (e.g. 'Soccer') gates 3-way h2h emission: soccer moneylines
// are home/draw/away, not binary, and silently dropping the draw caused
// false-hedge recommendations (spec 006 FR-006). Always emit the draw
// outcome for soccer so downstream consumers see outcomes.length === 3
// even when a specific book omits the draw price.
function bookmakerForBook(odds, homeName, awayName, sportGroup) {
  const title = BOOK_NAMES[odds.book_id];
  if (!title) return null;

  const markets = [];

  if (Number.isFinite(odds.ml_home) && Number.isFinite(odds.ml_away)) {
    const outcomes = [
      { name: homeName, price: odds.ml_home },
      { name: awayName, price: odds.ml_away },
    ];
    if (sportGroup === 'Soccer') {
      outcomes.push({ name: 'Draw', price: Number.isFinite(odds.draw) ? odds.draw : null });
    }
    markets.push({ key: 'h2h', outcomes });
  }

  if (Number.isFinite(odds.spread_home_line) && Number.isFinite(odds.spread_away_line)
      && Number.isFinite(odds.spread_home)) {
    markets.push({
      key: 'spreads',
      outcomes: [
        { name: homeName, price: odds.spread_home_line, point: odds.spread_home },
        { name: awayName, price: odds.spread_away_line, point: odds.spread_away },
      ],
    });
  }

  if (Number.isFinite(odds.over) && Number.isFinite(odds.under)
      && Number.isFinite(odds.total)) {
    markets.push({
      key: 'totals',
      outcomes: [
        { name: 'Over', price: odds.over, point: odds.total },
        { name: 'Under', price: odds.under, point: odds.total },
      ],
    });
  }

  if (!markets.length) return null;

  return {
    key: `actionnetwork:${odds.book_id}`,
    title,
    last_update: odds.inserted ?? new Date().toISOString(),
    markets,
  };
}

// Action Network's MMA / UFC feed uses a different payload shape from team
// sports: v1 `/scoreboard/ufc` returns `competitions[]` with empty markets,
// while v2 `/scoreboard/ufc` populates `markets[<book_id>].event.moneyline`
// keyed by competitor_id. Caller opts in via sport.actionNetwork.shape.
const V2_BASE = 'https://api.actionnetwork.com/web/v2/scoreboard';

async function fetchV2Day(slug, dateStr) {
  const url = new URL(`${V2_BASE}/${slug}`);
  url.searchParams.set('bookIds', BOOK_IDS.join(','));
  url.searchParams.set('date', dateStr);
  const res = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'User-Agent': 'promo-tool-scraper/0.1' },
  });
  if (!res.ok) throw new Error(`Action v2/${slug}/${dateStr} → ${res.status}`);
  return res.json();
}

function bookmakerForCompetition(bookId, bookMarkets, sides) {
  const title = BOOK_NAMES[bookId];
  if (!title) return null;
  const evt = bookMarkets?.event;
  if (!evt) return null;
  const ml = Array.isArray(evt.moneyline) ? evt.moneyline : [];
  const home = ml.find(m => sides.get(m.competitor_id)?.side === 'home');
  const away = ml.find(m => sides.get(m.competitor_id)?.side === 'away');
  if (!home || !away || !Number.isFinite(home.odds) || !Number.isFinite(away.odds)) return null;
  return {
    key: `actionnetwork:${bookId}`,
    title,
    last_update: new Date().toISOString(),
    markets: [{
      key: 'h2h',
      outcomes: [
        { name: sides.get(home.competitor_id).name, price: home.odds },
        { name: sides.get(away.competitor_id).name, price: away.odds },
      ],
    }],
  };
}

async function scrapeCompetitions(sport, days) {
  const slug = sport.actionNetwork.path;
  const dates = dateRange(days);
  const results = await Promise.allSettled(dates.map(d => fetchV2Day(slug, d)));
  const seen = new Set();
  const out = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.error(`actionNetwork ${sport.key}: ${r.reason?.message ?? r.reason}`);
      continue;
    }
    const comps = r.value?.competitions || [];
    for (const c of comps) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const home = c.competitors?.find(x => x.side === 'home');
      const away = c.competitors?.find(x => x.side === 'away');
      const homeName = home?.player?.full_name;
      const awayName = away?.player?.full_name;
      const startTime = c.start_time;
      if (!homeName || !awayName || !startTime) continue;
      const sides = new Map([
        [home.id, { side: 'home', name: homeName }],
        [away.id, { side: 'away', name: awayName }],
      ]);
      const markets = c.markets || {};
      for (const bid of Object.keys(markets)) {
        const bm = bookmakerForCompetition(Number(bid), markets[bid], sides);
        if (!bm) continue;
        out.push({
          eventKey: eventKey(homeName, awayName, startTime),
          home_team: homeName,
          away_team: awayName,
          commence_time: startTime,
          bookmaker: bm,
        });
      }
    }
  }
  return out;
}

// Returns SourceEvent[].
export async function scrapeActionNetwork(sport, { days = 7 } = {}) {
  if (sport.actionNetwork?.shape === 'competitions') {
    return scrapeCompetitions(sport, days);
  }
  const slug = sport.actionNetwork.path;
  const dates = dateRange(days);

  const results = await Promise.allSettled(dates.map(d => fetchDay(slug, d)));
  const seenGameIds = new Set();
  const out = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.error(`actionNetwork ${sport.key}: ${r.reason?.message ?? r.reason}`);
      continue;
    }
    const games = r.value?.games || [];
    for (const game of games) {
      if (seenGameIds.has(game.id)) continue;
      seenGameIds.add(game.id);

      const home = game.teams?.find(t => t.id === game.home_team_id);
      const away = game.teams?.find(t => t.id === game.away_team_id);
      const homeName = home?.full_name || home?.display_name;
      const awayName = away?.full_name || away?.display_name;
      const startTime = game.start_time;
      if (!homeName || !awayName || !startTime) continue;

      const oddsArr = game.odds || [];
      // Take the freshest entry per book_id (api may return multiple snapshots)
      const latestPerBook = new Map();
      for (const o of oddsArr) {
        const cur = latestPerBook.get(o.book_id);
        if (!cur || (o.inserted ?? 0) > (cur.inserted ?? 0)) latestPerBook.set(o.book_id, o);
      }

      for (const o of latestPerBook.values()) {
        const bookmaker = bookmakerForBook(o, homeName, awayName, sport.group);
        if (!bookmaker) continue;
        out.push({
          eventKey: eventKey(homeName, awayName, startTime),
          home_team: homeName,
          away_team: awayName,
          commence_time: startTime,
          bookmaker,
        });
      }
    }
  }

  return out;
}
