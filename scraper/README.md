# promo-tool scraper

Pulls public odds feeds (Pinnacle + Action Network), normalizes to The-Odds-API
event shape, writes static JSON for the client to consume.

**Deploying for real?** Read [DEPLOY.md](./DEPLOY.md) for the end-to-end VPS
walkthrough (caddy site block, automatic TLS, per-friend HTTP Basic Auth, cron).

**The feed is served behind HTTP Basic Auth** (spec 005 FR-013). The client's
`vpsFeed` provider extracts `user:pass@` from the stored URL and sends an
`Authorization: Basic …` header on every request. Friends each get a unique
caddy `basic_auth` stanza so credentials are revocable per-friend.

## Local run

```bash
cd scraper
node run.js --dry-run    # prints first event per sport, writes nothing
OUT_DIR=/tmp/feed node run.js
```

No npm deps — uses Node 20+ built-in `fetch`.

## Output

```
$OUT_DIR/
  sports.json              # [{ key, title, group, active }]
  odds/
    americanfootball_nfl.json
    basketball_nba.json
    baseball_mlb.json
    icehockey_nhl.json
```

Each `odds/*.json` is a JSON array of events shaped like The-Odds-API's
`/sports/{key}/odds?oddsFormat=american&markets=h2h,spreads,totals` response.
The client (`src/api/providers/vpsFeed.js`) consumes it directly.

## VPS deploy

Repo lives at `/opt/promo-tool`. caddy serves
`/var/www/promo-tool/` as a static directory at
`https://promo-tool.195-201-99-206.sslip.io/` (see [DEPLOY.md](./DEPLOY.md)
for the full site block + per-friend basic_auth setup).

```bash
# one-time
git clone <repo> /opt/promo-tool

# cron — every 10 minutes
*/10 * * * * cd /opt/promo-tool/scraper && OUT_DIR=/var/www/promo-tool node run.js >> /var/log/promo-scraper.log 2>&1
```

Each friend pastes `https://<user>:<pass>@promo-tool.195-201-99-206.sslip.io`
into the extension Settings.

## Sources

| Source | Provides | Stable? | Notes |
|---|---|---|---|
| Pinnacle (`sources/pinnacle.js`) | Sharp h2h/spreads/totals, decimal odds | Yes | Public guest API. Single bookmaker entry titled "Pinnacle". |
| Action Network (`sources/actionNetwork.js`) | Per-book US odds (DK, FD, MGM, Caesars, etc.) | Mostly | Public scoreboard JSON. `BOOK_NAMES` map may need updates as books rebrand. |

## Adding a sport

Add an entry to `sports.js` with the The-Odds-API key, and per-source identifiers:
- Pinnacle: `sportId` + `leagueIds[]` (find via `GET /0.1/sports/{sportId}/leagues`)
- Action Network: the URL slug used at `actionnetwork.com/<slug>/...`

## Adding a source

Create `sources/foo.js` exporting `scrapeFoo(sport)` returning `SourceEvent[]`
(see `normalize.js` for shape). Wire into `run.js` `gatherSport()`. The merger
unions bookmakers across sources keyed by `(home, away, date)`.
