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

import * as theOddsApi from './providers/theOddsApi.js';
// import * as vpsFeed from './providers/vpsFeed.js';

const provider = theOddsApi;
// const provider = vpsFeed;  // swap once scraper is deployed

export const providerName = provider.name;
export const fetchSports = (...a) => provider.fetchSports(...a);
export const fetchOdds = (...a) => provider.fetchOdds(...a);
export const getApiKey = (...a) => provider.getApiKey(...a);
export const saveApiKey = (...a) => provider.saveApiKey(...a);
