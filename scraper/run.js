// Orchestrator. Runs each source, merges per sport, writes JSON to OUT_DIR.
//
// Output:
//   $OUT_DIR/sports.json           — [{ key, title, group, active }]
//   $OUT_DIR/odds/<sportKey>.json  — events array (the-odds-api shape)
//
// Usage:
//   OUT_DIR=/var/www/promo-tool node run.js
//   OUT_DIR=. node run.js --dry-run     # writes nothing, prints sample
//
// Cron suggestion (every 10 min):
//   */10 * * * * cd /opt/promo-tool/scraper && OUT_DIR=/var/www/promo-tool node run.js >> /var/log/promo-scraper.log 2>&1

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { SPORTS, asSportsManifest } from './sports.js';
import { mergeEvents } from './normalize.js';
import { scrapePinnacle } from './sources/pinnacle.js';
import { scrapeActionNetwork } from './sources/actionNetwork.js';

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_DIR = process.env.OUT_DIR || '.';

async function gatherSport(sport) {
  const sources = await Promise.allSettled([
    scrapePinnacle(sport),
    scrapeActionNetwork(sport),
  ]);
  const flat = [];
  for (const r of sources) {
    if (r.status === 'fulfilled') flat.push(...r.value);
    else console.error(`source error for ${sport.key}: ${r.reason?.message ?? r.reason}`);
  }
  return mergeEvents(flat);
}

async function writeJson(relPath, data) {
  if (DRY_RUN) return;
  const full = join(OUT_DIR, relPath);
  await mkdir(join(OUT_DIR, relPath, '..'), { recursive: true });
  await writeFile(full, JSON.stringify(data));
}

async function main() {
  const startedAt = Date.now();
  const summary = [];

  await writeJson('sports.json', asSportsManifest());

  for (const sport of SPORTS) {
    try {
      const events = await gatherSport(sport);
      await writeJson(`odds/${sport.key}.json`, events);
      const bookCount = new Set(events.flatMap(e => e.bookmakers.map(b => b.key))).size;
      summary.push({ sport: sport.key, events: events.length, books: bookCount });
      if (DRY_RUN && events.length) {
        console.log(`\n--- ${sport.key} sample event ---`);
        console.log(JSON.stringify(events[0], null, 2));
      }
    } catch (err) {
      summary.push({ sport: sport.key, error: err.message });
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`done in ${elapsed}s${DRY_RUN ? ' (dry-run, no files written)' : ` → ${OUT_DIR}`}`);
  console.table(summary);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
