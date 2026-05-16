#!/usr/bin/env node
// SC-003 book-parity check (spec 005 T041a).
//
// For every sport in the vpsFeed `/sports.json` manifest:
//   1. Fetch the same sport from The-Odds-API.
//   2. Match events across feeds by (home, away, commence-date).
//   3. For each matched event, compute the cohort-book title set
//      (DraftKings / FanDuel / BetMGM / Caesars) present on each side.
//   4. Assert vpsFeed set ⊇ The-Odds-API set per event.
//
// Out-of-season sports are auto-skipped (one side empty → no overlap to check).
// Cost: ~1 The-Odds-API request per in-season sport. Budget: ≤8 requests.
//
// Usage:
//   FEED_URL='https://user:pw@host' \
//   ODDS_API_KEY='...' \
//   node scraper/tools/check-parity.js
//
// Or pass as positional args:
//   node scraper/tools/check-parity.js <feed-url> <odds-api-key>

import { eventKey } from '../normalize.js';

const COHORT_TITLES = new Set(['DraftKings', 'FanDuel', 'BetMGM', 'Caesars']);
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';

function parseFeedUrl(raw) {
  if (!raw) throw new Error('FEED_URL is required');
  const withProto = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const u = new URL(withProto);
  let authHeader = null;
  if (u.username) {
    const user = decodeURIComponent(u.username);
    const pass = decodeURIComponent(u.password ?? '');
    authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    u.username = '';
    u.password = '';
  }
  return { baseUrl: u.toString().replace(/\/+$/, ''), authHeader };
}

async function fetchFeed(path, feed) {
  const opts = feed.authHeader ? { headers: { Authorization: feed.authHeader } } : undefined;
  const res = await fetch(`${feed.baseUrl}${path}`, opts);
  if (!res.ok) throw new Error(`Feed ${path} → ${res.status}`);
  return res.json();
}

async function fetchOddsApi(sportKey, apiKey) {
  const markets = sportKey.startsWith('tennis_') ? 'h2h' : 'h2h,spreads,totals';
  const url = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', 'us');
  url.searchParams.set('markets', markets);
  url.searchParams.set('oddsFormat', 'american');
  const res = await fetch(url.toString());
  if (res.status === 404 || res.status === 422) return []; // out of season / no markets
  if (!res.ok) throw new Error(`The-Odds-API ${sportKey} → ${res.status}`);
  return res.json();
}

function cohortTitles(event) {
  const set = new Set();
  for (const bm of event.bookmakers ?? []) {
    if (COHORT_TITLES.has(bm.title)) set.add(bm.title);
  }
  return set;
}

function indexByEventKey(events) {
  const map = new Map();
  for (const ev of events) {
    const k = eventKey(ev.home_team, ev.away_team, ev.commence_time);
    map.set(k, ev);
  }
  return map;
}

function diffSet(superset, subset) {
  return [...subset].filter(x => !superset.has(x));
}

async function main() {
  const feedUrl = process.env.FEED_URL ?? process.argv[2];
  const apiKey = process.env.ODDS_API_KEY ?? process.argv[3];
  if (!feedUrl || !apiKey) {
    console.error('Usage: FEED_URL=... ODDS_API_KEY=... node scraper/tools/check-parity.js');
    console.error('   or: node scraper/tools/check-parity.js <feed-url> <api-key>');
    process.exit(1);
  }

  const feed = parseFeedUrl(feedUrl);
  // Debug: show what we parsed without leaking the password.
  const dbgUrl = new URL(/^[a-z]+:\/\//i.test(feedUrl) ? feedUrl : `https://${feedUrl}`);
  console.log(`[debug] parsed user='${decodeURIComponent(dbgUrl.username)}' passLen=${dbgUrl.password.length} baseUrl=${feed.baseUrl} authPresent=${!!feed.authHeader}`);
  const sports = await fetchFeed('/sports.json', feed);
  console.log(`feed has ${sports.length} sports: ${sports.map(s => s.key).join(', ')}\n`);

  let totalEventsCompared = 0;
  let totalDeficits = 0;
  const deficitDetail = [];
  const sportSummary = [];

  for (const sport of sports) {
    let feedEvents, apiEvents;
    try {
      [feedEvents, apiEvents] = await Promise.all([
        fetchFeed(`/odds/${encodeURIComponent(sport.key)}.json`, feed).catch(e => {
          if (String(e.message).includes('404')) return [];
          throw e;
        }),
        fetchOddsApi(sport.key, apiKey),
      ]);
    } catch (err) {
      console.log(`${sport.key}: fetch error → ${err.message}`);
      continue;
    }

    if (!feedEvents.length && !apiEvents.length) {
      sportSummary.push({ key: sport.key, status: 'both empty (off-season)' });
      continue;
    }
    if (!apiEvents.length) {
      sportSummary.push({ key: sport.key, status: `vpsFeed=${feedEvents.length}, odds-api=0 (skip parity)` });
      continue;
    }
    if (!feedEvents.length) {
      sportSummary.push({ key: sport.key, status: `vpsFeed=0, odds-api=${apiEvents.length} ⚠️ FEED GAP` });
      continue;
    }

    const feedIdx = indexByEventKey(feedEvents);
    const apiIdx = indexByEventKey(apiEvents);

    let overlap = 0;
    let deficitEvents = 0;
    for (const [k, apiEv] of apiIdx) {
      const feedEv = feedIdx.get(k);
      if (!feedEv) continue;
      overlap++;
      totalEventsCompared++;
      const apiCohort = cohortTitles(apiEv);
      const feedCohort = cohortTitles(feedEv);
      const missing = diffSet(feedCohort, apiCohort);
      if (missing.length) {
        deficitEvents++;
        totalDeficits++;
        deficitDetail.push({
          sport: sport.key,
          event: `${apiEv.home_team} vs ${apiEv.away_team}`,
          date: apiEv.commence_time.slice(0, 10),
          missing,
          feedHas: [...feedCohort],
          apiHas: [...apiCohort],
        });
      }
    }

    sportSummary.push({
      key: sport.key,
      status: `feed=${feedEvents.length} api=${apiEvents.length} overlap=${overlap} deficits=${deficitEvents}`,
    });
  }

  console.log('--- per-sport summary ---');
  for (const s of sportSummary) console.log(`  ${s.key.padEnd(28)} ${s.status}`);
  console.log();

  console.log('--- aggregate ---');
  console.log(`  events compared: ${totalEventsCompared}`);
  console.log(`  events with deficit: ${totalDeficits}`);
  let verdict;
  if (totalEventsCompared === 0) verdict = '⚠️ NO EVENTS COMPARED (check API key / season window)';
  else if (totalDeficits === 0) verdict = '✅ PASS';
  else verdict = '⚠️ INVESTIGATE';
  console.log(`  pass criterion: 0 unjustified deficits, ≥1 event compared → ${verdict}`);

  if (deficitDetail.length) {
    console.log('\n--- deficit detail ---');
    for (const d of deficitDetail) {
      console.log(`  [${d.sport}] ${d.date} ${d.event}`);
      console.log(`    missing from feed: ${d.missing.join(', ')}`);
      console.log(`    feed has: ${d.feedHas.join(', ') || '(none)'}`);
      console.log(`    odds-api has: ${d.apiHas.join(', ') || '(none)'}`);
    }
  }

  if (totalEventsCompared === 0) process.exit(3);
  process.exit(totalDeficits === 0 ? 0 : 2);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.cause) console.error('  cause:', err.cause);
  console.error(err.stack);
  process.exit(1);
});
