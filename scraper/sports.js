// Curated sport registry. Keys match The-Odds-API so the existing client doesn't
// need remapping. Per-source IDs/paths point at each provider's identifier.
//
// Pinnacle league IDs are stable for in-season leagues but verify if a sport
// disappears: GET https://guest.api.arcadia.pinnacle.com/0.1/sports/{sportId}/leagues
//
// Action Network paths are the slug used in their public scoreboard endpoint.

export const SPORTS = [
  {
    key: 'americanfootball_nfl',
    title: 'NFL',
    group: 'American Football',
    pinnacle: { sportId: 29, leagueIds: [889] },
    actionNetwork: { path: 'nfl' },
  },
  {
    key: 'basketball_nba',
    title: 'NBA',
    group: 'Basketball',
    pinnacle: { sportId: 4, leagueIds: [487] },
    actionNetwork: { path: 'nba' },
  },
  {
    key: 'baseball_mlb',
    title: 'MLB',
    group: 'Baseball',
    pinnacle: { sportId: 9, leagueIds: [246] },
    actionNetwork: { path: 'mlb' },
  },
  {
    key: 'icehockey_nhl',
    title: 'NHL',
    group: 'Ice Hockey',
    pinnacle: { sportId: 19, leagueIds: [1456] },
    actionNetwork: { path: 'nhl' },
  },
  // Spec 005 FR-009 — extended coverage for the friend cohort. League IDs are
  // verified per research.md R5 at deploy time; rotate if Pinnacle reorganizes.
  // Action Network slugs are best-effort: if missing, Pinnacle covers alone.
  //
  // Soccer (EPL + UEFA CL) was removed in spec 006: soccer h2h is 3-way
  // (home/draw/away), so a binary back+lay hedge leaves the user uncovered
  // on a draw. Cohort doesn't use soccer; revisit if demand returns and the
  // recommender learns a real 3-way hedge.
  {
    key: 'tennis_atp_wta',
    title: 'ATP + WTA',
    group: 'Tennis',
    pinnacle: { sportId: 33, leagueIds: [2272, 2273] },
    actionNetwork: { path: 'tennis' },
  },
  {
    key: 'mma_mixed_martial_arts',
    title: 'MMA (UFC)',
    group: 'MMA',
    pinnacle: { sportId: 22, leagueIds: [1582] },
    actionNetwork: { path: 'ufc', shape: 'competitions' },
  },
];

// Public shape returned by /sports.json (matches The-Odds-API).
export function asSportsManifest() {
  return SPORTS.map(s => ({
    key: s.key,
    title: s.title,
    group: s.group,
    active: true,
  }));
}
