const BASE = 'https://api.the-odds-api.com/v4';

const SPORTS = [
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'basketball_nba',       label: 'NBA' },
  { key: 'baseball_mlb',         label: 'MLB' },
  { key: 'icehockey_nhl',        label: 'NHL' },
  { key: 'tennis_atp_singles',   label: 'Tennis (ATP)' },
  { key: 'tennis_wta_singles',   label: 'Tennis (WTA)' },
];

export function getSports() {
  return SPORTS;
}

async function apiFetch(path, apiKey, params = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('apiKey', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (res.status === 401) throw new Error('Invalid API key.');
  if (res.status === 422) throw new Error('API request invalid — some markets may require a paid plan.');
  if (res.status === 429) throw new Error('Out of API requests for this month.');
  if (res.status === 404) {
    const err = new Error('Sport not found or no active markets.');
    err.status = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Fetch active sports from the API. Returns [{ key, title, group, active }].
export async function fetchActiveSports(apiKey) {
  return apiFetch('/sports', apiKey, { all: 'false' });
}

// Returns upcoming games for a sport: [{ id, home_team, away_team, commence_time }]
export async function fetchGames(sportKey, apiKey) {
  const data = await apiFetch(`/sports/${sportKey}/odds`, apiKey, {
    regions: 'us',
    markets: 'h2h',
    oddsFormat: 'american',
  });
  return data.map(event => ({
    id: event.id,
    home: event.home_team,
    away: event.away_team,
    commenceTime: event.commence_time,
    bookmakers: event.bookmakers,
  }));
}

// Given a game object from fetchGames, return best odds per outcome across all books.
// Returns: { home: { odds, book }, away: { odds, book } }
export function bestOdds(game) {
  const best = {};
  for (const bm of game.bookmakers ?? []) {
    const market = bm.markets?.find(m => m.key === 'h2h');
    if (!market) continue;
    for (const outcome of market.outcomes) {
      const name = outcome.name;
      const odds = outcome.price; // american
      if (!best[name] || odds > best[name].odds) {
        best[name] = { odds, book: bm.title };
      }
    }
  }
  return best; // { [teamName]: { odds, book } }
}

// All odds per book for a game, for the comparison table.
// Returns: [{ book, home, away }] sorted by home odds descending.
export function allOdds(game) {
  const rows = [];
  for (const bm of game.bookmakers ?? []) {
    const market = bm.markets?.find(m => m.key === 'h2h');
    if (!market) continue;
    const row = { book: bm.title };
    for (const o of market.outcomes) row[o.name] = o.price;
    rows.push(row);
  }
  rows.sort((a, b) => (b[game.home] ?? -Infinity) - (a[game.home] ?? -Infinity));
  return rows;
}

// Markets available for content script full-scan (comma-separated for API param).
// Tennis only supports h2h; skip alternate markets for it.
const FULL_MARKETS = 'h2h,spreads,totals';
const TENNIS_MARKETS = 'h2h';

// Fetches all markets for use by the background service worker / content script.
// Returns raw event array with all bookmakers and all markets.
export async function fetchForContentScript(sportKey, apiKey) {
  const isTennis = sportKey.startsWith('tennis_');
  const markets = isTennis ? TENNIS_MARKETS : FULL_MARKETS;
  return apiFetch(`/sports/${sportKey}/odds`, apiKey, {
    regions: 'us',
    markets,
    oddsFormat: 'american',
  });
}

export function getApiKey() {
  return new Promise(resolve => chrome.storage.local.get('oddsApiKey', d => resolve(d.oddsApiKey ?? '')));
}

export function saveApiKey(key) {
  return new Promise(resolve => chrome.storage.local.set({ oddsApiKey: key }, resolve));
}
