// VPS feed provider — fetches static JSON written by scraper/run.js.
//
// "Credentials" for this provider is the feed base URL with optional HTTP
// Basic Auth embedded as userinfo (https://user:pass@host/path). The same
// chrome.storage key the-odds-api uses (`oddsApiKey`) holds it, so the
// Settings UI single text field works for both providers (Constitution §V).
//
// Output shape is identical to the-odds-api response, so downstream callers
// (popup scanner, content-script badges) need no changes.

export const name = 'vps-feed';

// Settings-UI copy. Read by src/api/provider.js and rendered into the
// credentials field at popup init time (spec 005 FR-006).
export const credentialLabel = 'Feed URL';
export const credentialPlaceholder = 'https://you:pw@promo-tool.195-201-99-206.sslip.io';
export const credentialHint =
  'Paste the feed URL your friend sent you. It has your username and password embedded.';

const STORAGE_KEY = 'oddsApiKey'; // shared with the-odds-api so Settings UI works either way

function chromeStorageGet(key) {
  return new Promise(resolve => chrome.storage.local.get(key, d => resolve(d[key] ?? '')));
}

function chromeStorageSet(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

// Pure: text → {baseUrl, authHeader}. No I/O, no chrome.*, no fetch.
// Tested under test/vpsFeed.test.js. Spec 005 FR-002 + research.md R4.
export function normalizeFeedUrl(input) {
  if (input == null) throw new Error('No feed URL set — add one in the extension settings (⚙).');
  const trimmed = String(input).trim();
  if (!trimmed) throw new Error('No feed URL set — add one in the extension settings (⚙).');

  // Auto-prefix https:// when no protocol is present (FR-002).
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  // Reject http:// outright (FR-011). Basic Auth credentials only over HTTPS.
  if (!/^https:\/\//i.test(withProtocol)) {
    throw new Error('Feed URL must start with https://');
  }

  const u = new URL(withProtocol);

  let authHeader = null;
  if (u.username) {
    const user = decodeURIComponent(u.username);
    const pass = decodeURIComponent(u.password ?? '');
    authHeader = 'Basic ' + btoa(`${user}:${pass}`);
    u.username = '';
    u.password = '';
  }

  // Strip trailing slashes from pathname so `${baseUrl}/sports.json` joins cleanly.
  const baseUrl = u.toString().replace(/\/+$/, '');

  return { baseUrl, authHeader };
}

export function getApiKey() {
  return chromeStorageGet(STORAGE_KEY);
}

// Persist the normalized form so what the user re-opens in Settings is
// what the provider will use on the next request (FR-002). Userinfo
// (the user:pass@ portion) is kept in the stored URL so credentials
// survive reloads — they're never broken out into a separate key.
export async function saveApiKey(value) {
  if (value == null || String(value).trim() === '') {
    return chromeStorageSet(STORAGE_KEY, '');
  }
  // Validates the URL early so garbage never lands in storage.
  normalizeFeedUrl(value);

  const raw = String(value).trim();
  const withProtocol = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = new URL(withProtocol);
  return chromeStorageSet(STORAGE_KEY, u.toString().replace(/\/+$/, ''));
}

async function requireFeed() {
  const stored = await getApiKey();
  return normalizeFeedUrl(stored);
}

async function fetchJson(path) {
  const { baseUrl, authHeader } = await requireFeed();
  const url = `${baseUrl}${path}`;
  const opts = authHeader ? { headers: { Authorization: authHeader } } : undefined;
  const res = await fetch(url, opts);
  if (res.status === 401 || res.status === 403) {
    // FR-013: surface a credentials-specific message. Never log the URL or
    // header contents anywhere — only this generic line.
    throw new Error('Feed credentials rejected — check the URL you pasted in Settings.');
  }
  if (res.status === 404) {
    const err = new Error('Sport not found in feed.');
    err.status = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`Feed error ${res.status}`);
  return res.json();
}

export async function fetchSports() {
  return fetchJson('/sports.json');
}

export async function fetchOdds(sportKey) {
  return fetchJson(`/odds/${encodeURIComponent(sportKey)}.json`);
}
