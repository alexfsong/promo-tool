import { fetchForContentScript, getApiKey } from '../src/api/oddsApi.js';

// Open the side panel when the toolbar icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// In-memory cache: sportKey → { events, fetchedAt }
// TTL is 15 minutes to protect the 500 req/month free tier.
const cache = new Map();
const TTL_MS = 15 * 60 * 1000;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ODDS_REQUEST') return false;

  (async () => {
    const apiKey = await getApiKey();
    if (!apiKey) {
      sendResponse({ type: 'ODDS_RESPONSE', requestId: msg.requestId,
                     ok: false, error: 'No API key — add one in the extension settings (⚙).' });
      return;
    }

    const sport = msg.sport;
    const cached = cache.get(sport);
    if (cached && (Date.now() - cached.fetchedAt) < TTL_MS) {
      sendResponse({ type: 'ODDS_RESPONSE', requestId: msg.requestId,
                     ok: true, events: cached.events, cachedAt: cached.fetchedAt });
      return;
    }

    try {
      const events = await fetchForContentScript(sport, apiKey);
      cache.set(sport, { events, fetchedAt: Date.now() });
      sendResponse({ type: 'ODDS_RESPONSE', requestId: msg.requestId,
                     ok: true, events, cachedAt: Date.now() });
    } catch (err) {
      sendResponse({ type: 'ODDS_RESPONSE', requestId: msg.requestId,
                     ok: false, error: err.message });
    }
  })();

  return true; // keep message channel open for async sendResponse
});
