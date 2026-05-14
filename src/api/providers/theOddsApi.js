// The Odds API provider — https://the-odds-api.com
// Implements the OddsProvider contract defined in src/api/provider.js.

const BASE = 'https://api.the-odds-api.com/v4';

export const name = 'the-odds-api';

// Settings-UI copy. Read by src/api/provider.js and rendered into the
// credentials field at popup init time (spec 005 FR-006).
export const credentialLabel = 'The Odds API key';
export const credentialPlaceholder = 'Paste your API key here';
export const credentialHint =
  'Free at the-odds-api.com — 500 requests/month.';

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

async function requireKey() {
  const key = await getApiKey();
  if (!key) throw new Error('No API key — add one in the extension settings (⚙).');
  return key;
}

export async function fetchSports() {
  const apiKey = await requireKey();
  return apiFetch('/sports', apiKey, { all: 'false' });
}

const FULL_MARKETS = 'h2h,spreads,totals';
const TENNIS_MARKETS = 'h2h';

export async function fetchOdds(sportKey) {
  const apiKey = await requireKey();
  const markets = sportKey.startsWith('tennis_') ? TENNIS_MARKETS : FULL_MARKETS;
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
