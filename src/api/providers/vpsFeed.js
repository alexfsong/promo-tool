// VPS feed provider — fetches static JSON written by scraper/run.js.
//
// "Credentials" for this provider is the feed base URL (stored under the same
// chrome.storage key the-odds-api uses, so the Settings UI single text field
// works unchanged: paste 'https://your.host/promo-tool' instead of an API key).
//
// Output shape is identical to the-odds-api response, so downstream callers
// (popup scanner, content-script badges) need no changes.

export const name = 'vps-feed';

const STORAGE_KEY = 'oddsApiKey'; // shared with the-odds-api so settings UI works either way

function chromeStorageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, d => resolve(d[key] ?? '')));
}

function chromeStorageSet(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

export function getApiKey() {
  return chromeStorageGet(STORAGE_KEY);
}

export function saveApiKey(value) {
  return chromeStorageSet(STORAGE_KEY, String(value).replace(/\/+$/, ''));
}

async function requireBase() {
  const base = await getApiKey();
  if (!base) throw new Error('No feed URL set — add one in the extension settings (⚙).');
  return base.replace(/\/+$/, '');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (res.status === 404) {
    const err = new Error('Sport not found in feed.');
    err.status = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`Feed error ${res.status}`);
  return res.json();
}

export async function fetchSports() {
  const base = await requireBase();
  return fetchJson(`${base}/sports.json`);
}

export async function fetchOdds(sportKey) {
  const base = await requireBase();
  return fetchJson(`${base}/odds/${encodeURIComponent(sportKey)}.json`);
}
