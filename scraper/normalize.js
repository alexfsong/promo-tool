// Common shape every source produces. The orchestrator merges across sources
// keyed by (sportKey, eventKey). The final output matches the The-Odds-API
// event shape so the client provider can be swapped 1:1.
//
// SourceEvent (what each source returns):
//   {
//     eventKey: string         // stable cross-source id (homeNorm|awayNorm|YYYY-MM-DD)
//     home_team: string        // canonical
//     away_team: string
//     commence_time: ISO8601
//     bookmaker: {
//       key: string,           // e.g. 'pinnacle', 'draftkings'
//       title: string,         // human-readable
//       last_update: ISO8601,
//       markets: [{ key, outcomes: [{ name, price, point? }] }]
//     }
//   }

export function normalizeTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(fc|sc|cf|afc|nfc)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stable key for matching the same event across sources.
export function eventKey(home, away, commenceIso) {
  const day = String(commenceIso || '').slice(0, 10); // YYYY-MM-DD
  return `${normalizeTeamName(home)}|${normalizeTeamName(away)}|${day}`;
}

// Merge an array of SourceEvent into [{ id, home_team, away_team, commence_time, bookmakers: [...] }].
// Bookmakers from later sources are appended; if the same bookmaker.key appears twice,
// the second one wins (later sources override earlier).
export function mergeEvents(sourceEvents) {
  const byKey = new Map();
  for (const ev of sourceEvents) {
    const cur = byKey.get(ev.eventKey);
    if (!cur) {
      byKey.set(ev.eventKey, {
        id: ev.eventKey,
        home_team: ev.home_team,
        away_team: ev.away_team,
        commence_time: ev.commence_time,
        bookmakers: [ev.bookmaker],
      });
    } else {
      const existingIdx = cur.bookmakers.findIndex(b => b.key === ev.bookmaker.key);
      if (existingIdx >= 0) cur.bookmakers[existingIdx] = ev.bookmaker;
      else cur.bookmakers.push(ev.bookmaker);
    }
  }
  return [...byKey.values()];
}
