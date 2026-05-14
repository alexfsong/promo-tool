// Pluggable odds-provider interface.
//
// Every provider exports:
//   name           — string identifier
//   fetchSports()  — Promise<[{ key, title, group, active }]>
//   fetchOdds(key) — Promise<rawEvents[]> (The-Odds-API event shape:
//                    { id, home_team, away_team, commence_time, bookmakers })
//   getApiKey()    — Promise<string>  (provider-specific credentials read)
//   saveApiKey(k)  — Promise<void>    (provider-specific credentials write)
//
// To swap providers, change the import below.

// import * as theOddsApi from './providers/theOddsApi.js';
import * as vpsFeed from './providers/vpsFeed.js';

// Active provider. To roll back to The Odds API during a feed outage,
// swap the two import lines above AND the two const lines below.
const provider = vpsFeed;
// const provider = theOddsApi;

export const providerName = provider.name;
export const fetchSports = (...a) => provider.fetchSports(...a);
export const fetchOdds = (...a) => provider.fetchOdds(...a);
export const getApiKey = (...a) => provider.getApiKey(...a);
export const saveApiKey = (...a) => provider.saveApiKey(...a);

// Settings-UI copy follows the active provider (FR-006). popup.js reads
// these and patches the Settings DOM on init.
export const credentialLabel = provider.credentialLabel;
export const credentialPlaceholder = provider.credentialPlaceholder;
export const credentialHint = provider.credentialHint;
