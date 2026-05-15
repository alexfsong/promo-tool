# promo-tool scraper

Pulls public odds feeds (Pinnacle + Action Network), normalizes to The-Odds-API
event shape, writes static JSON for the client to consume.

**Deploying for real?** Read [DEPLOY.md](./DEPLOY.md) for the end-to-end ops
walkthrough (GitHub Actions runs the scraper, caddy on the VPS serves the
result, automatic TLS, per-friend HTTP Basic Auth).

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
    soccer_epl.json
    soccer_uefa_champs_league.json
    tennis_atp_wta.json
    mma_mixed_martial_arts.json
```

Each `odds/*.json` is a JSON array of events shaped like The-Odds-API's
`/sports/{key}/odds?oddsFormat=american&markets=h2h,spreads,totals` response.
The client (`src/api/providers/vpsFeed.js`) consumes it directly.

## Deploy architecture

The scraper runs on **GitHub Actions** (`.github/workflows/scraper.yml`),
not on the VPS. Pinnacle's Cloudflare WAF hard-blocks the VPS's Hetzner
IP range (see `specs/005-vps-feed-cutover/research.md` R9), so the VPS
is reduced to a static host: caddy + a `deploy` user that owns
`/var/www/promo-tool/`. The workflow rsyncs scraper output to that
directory over a `command=`-restricted SSH key on a schedule.

```
GitHub Actions (free, public repo)         VPS @ 195.201.99.206
─────────────────────────                  ──────────────────────
  schedule: every 10 min                     /var/www/promo-tool/
  node scraper/run.js   ──── rsync ─────►     ├── sports.json
  → $RUNNER_TEMP/promo-out  (SSH+rrsync)      └── odds/*.json
                                                    │
                                                    ▼
                                             caddy (basicauth + TLS)
                                                    │
                                                    ▼
                                       https://promo-tool.195-201-99-206.sslip.io
```

Friends paste `https://<user>:<pass>@promo-tool.195-201-99-206.sslip.io`
into the extension Settings. See [DEPLOY.md](./DEPLOY.md) for the full
setup walkthrough and ops runbook (rotating keys, adding/revoking
friends, troubleshooting).

**Known limitation**: GitHub's free-tier scheduler drifts heavily for
`*/10` cron — observed cadence ≈ hourly with occasional skips on
low-activity repos. The feed is a heuristic, not a real-time source;
re-check odds at the books before placing the bet.

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
