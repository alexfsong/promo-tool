import { parseOdds, decimalToAmerican, americanToDecimal } from '../src/calc/odds.js';
import { bonusBetHedge } from '../src/calc/bonusBet.js';
import { riskFreeEV } from '../src/calc/riskFree.js';
import { depositMatchEV } from '../src/calc/depositMatch.js';
import { oddsBoostEV } from '../src/calc/oddsBoost.js';
import { explanations } from '../src/ui/explanations.js';
import { fetchForContentScript, fetchActiveSports, getApiKey, saveApiKey } from '../src/api/oddsApi.js';

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ── Advanced toggle ───────────────────────────────────────────────────────────
document.getElementById('advancedToggle').addEventListener('change', e => {
  document.body.classList.toggle('advanced', e.target.checked);
});

// ── Settings panel ────────────────────────────────────────────────────────────
const settingsPanel = document.getElementById('settingsPanel');
document.getElementById('settingsBtn').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

getApiKey().then(key => {
  if (key) document.getElementById('apiKeyInput').value = key;
});

document.getElementById('saveApiKey').addEventListener('click', async () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  await saveApiKey(key);
  const saved = document.getElementById('apiKeySaved');
  saved.classList.remove('hidden');
  setTimeout(() => saved.classList.add('hidden'), 2000);
});

// ── Searchable select ─────────────────────────────────────────────────────────

function makeSearchableSelect(select) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ss-wrapper';
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-input';
  input.placeholder = 'Search…';
  input.value = select.options[select.selectedIndex]?.text ?? '';

  const list = document.createElement('ul');
  list.className = 'ss-list ss-hidden';

  wrapper.appendChild(input);
  wrapper.appendChild(list);

  function buildList(filter) {
    const q = (filter ?? '').toLowerCase();
    list.innerHTML = '';
    const matches = Array.from(select.options).filter(o =>
      !q || o.text.toLowerCase().includes(q)
    );
    if (!matches.length) {
      list.innerHTML = '<li class="ss-empty">No results</li>';
      return;
    }
    for (const opt of matches) {
      const li = document.createElement('li');
      li.className = 'ss-option' + (opt.value === select.value ? ' ss-selected' : '');
      li.textContent = opt.text;
      li.dataset.value = opt.value;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        select.value = li.dataset.value;
        input.value = li.textContent;
        list.classList.add('ss-hidden');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      list.appendChild(li);
    }
  }

  input.addEventListener('focus', () => { buildList(input.value); list.classList.remove('ss-hidden'); });
  input.addEventListener('input', () => { buildList(input.value); list.classList.remove('ss-hidden'); });
  input.addEventListener('blur', () => setTimeout(() => list.classList.add('ss-hidden'), 150));

  // Call after options change to sync display text and rebuild
  wrapper.rebuild = () => {
    input.value = select.options[select.selectedIndex]?.text ?? '';
  };

  return wrapper;
}

// ── Sport dropdowns (dynamic) ─────────────────────────────────────────────────

const scanSportSS = makeSearchableSelect(document.getElementById('scan-sport'));

async function initSportDropdowns() {
  const apiKey = await getApiKey();
  if (!apiKey) return; // keep hardcoded fallback options

  let sports;
  try {
    sports = await fetchActiveSports(apiKey);
  } catch (e) {
    return; // silently keep hardcoded fallback
  }

  // Group by API "group" field
  const groups = {};
  for (const s of sports) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

  // Priority group order
  const ORDER = [
    'American Football', 'Basketball', 'Baseball', 'Ice Hockey',
    'Tennis', 'Soccer', 'MMA', 'Boxing',
  ];
  const sorted = [
    ...ORDER.filter(g => groups[g]),
    ...Object.keys(groups).filter(g => !ORDER.includes(g)),
  ];

  const sportOptions = sorted.map(g =>
    groups[g].map(s => `<option value="${s.key}">${s.title} (${g})</option>`).join('')
  ).join('');

  document.getElementById('scan-sport').innerHTML =
    `<option value="__all__">Best overall (all sports)</option>` + sportOptions;

  scanSportSS.rebuild();
}

initSportDropdowns();

// Restore last scan results if the side panel was closed and reopened this session
chrome.storage.session.get(['scanEvents', 'scanParams'], ({ scanEvents, scanParams }) => {
  if (!scanEvents?.length || !scanParams) return;
  window._scanEvents = scanEvents;
  window._scanParams = scanParams;
  document.getElementById('scan-min').value = scanParams.minOdds;
  document.getElementById('scan-max').value = scanParams.maxOdds;
  document.getElementById('scan-amount').value = scanParams.bonusAmount;
  const allBooks = extractBooks(scanEvents);
  const books = myBooksSet.size > 0 ? allBooks.filter(b => myBooksSet.has(b)) : allBooks;
  chrome.storage.local.get('selectedBooks', d => {
    const savedSelection = d.selectedBooks ? new Set(d.selectedBooks) : new Set(books);
    renderBookChips(books, savedSelection);
    applyFilter();
  });
});

// ── My sportsbooks (settings) ─────────────────────────────────────────────────

// Well-known US books — used to seed the chips before any scan runs
const DEFAULT_BOOKS = [
  'bet365', 'BetMGM', 'BetRivers', 'Bovada', 'Caesars',
  'DraftKings', 'ESPN Bet', 'Fanatics', 'FanDuel',
  'Hard Rock Bet', 'Pinnacle', 'PointsBet', 'Unibet', 'WynnBET',
].sort();

let myBooksSet = new Set();

function renderMyBooksChips(books) {
  const list = document.getElementById('my-books-list');
  list.innerHTML = '';
  for (const book of books) {
    const chip = document.createElement('div');
    chip.className = 'book-chip' + (myBooksSet.has(book) ? ' selected' : '');
    chip.dataset.book = book;
    chip.textContent = book;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      myBooksSet[chip.classList.contains('selected') ? 'add' : 'delete'](book);
      chrome.storage.local.set({ myBooks: [...myBooksSet] });
      if (window._scanEvents) applyFilter();
    });
    list.appendChild(chip);
  }
}

async function loadMyBooks() {
  const data = await new Promise(r => chrome.storage.local.get(['myBooks', 'knownBooks'], r));
  const known = [...new Set([...DEFAULT_BOOKS, ...(data.knownBooks || [])])].sort();
  myBooksSet = new Set(data.myBooks || []);
  renderMyBooksChips(known);
}

// After a scan, merge any newly seen books into the settings chips
function mergeKnownBooks(books) {
  chrome.storage.local.get('knownBooks', d => {
    const known = [...new Set([...DEFAULT_BOOKS, ...(d.knownBooks || []), ...books])].sort();
    chrome.storage.local.set({ knownBooks: known });
    renderMyBooksChips(known);
  });
}

loadMyBooks();

// ── Promo Scanner ─────────────────────────────────────────────────────────────

// Find all outcomes in [minOdds, maxOdds] across all books, pair each with the
// best available hedge on the opposite side, and rank by bonus bet conversion rate.
// Extract unique bookmaker names from fetched events
function extractBooks(events) {
  const books = new Set();
  for (const event of events) {
    for (const bm of event.bookmakers || []) books.add(bm.title);
  }
  return [...books].sort();
}

function getSelectedBooks() {
  return [...document.querySelectorAll('#scan-books-list .book-chip.selected')]
    .map(el => el.dataset.book);
}

function renderBookChips(books, savedSelection) {
  const list = document.getElementById('scan-books-list');
  list.innerHTML = '';
  const section = document.getElementById('scan-books-section');
  section.classList.remove('hidden');

  for (const book of books) {
    const chip = document.createElement('div');
    chip.className = 'book-chip' + (savedSelection.has(book) ? ' selected' : '');
    chip.dataset.book = book;
    chip.textContent = book;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (window._scanEvents) applyFilter();
    });
    list.appendChild(chip);
  }
}

function applyFilter() {
  const selected = getSelectedBooks();
  const backFilter = new Set(selected);
  chrome.storage.local.set({ selectedBooks: selected });
  const layFilter = myBooksSet.size > 0 ? myBooksSet : null;
  const { minOdds, maxOdds, bonusAmount } = window._scanParams;
  const opportunities = findPromoOpportunities(window._scanEvents, { minOdds, maxOdds, bonusAmount, backFilter, layFilter });
  const fallback = opportunities.length ? [] : findFallbackOpportunities(window._scanEvents, {
    bonusAmount, backFilter, layFilter, excludeMin: minOdds, excludeMax: maxOdds,
  });
  renderScanResults(opportunities, fallback);
}

function findPromoOpportunities(events, { minOdds, maxOdds, bonusAmount, backFilter, layFilter }) {
  const results = [];
  const seen = new Set(); // dedupe: event+outcome+backBook

  for (const event of events) {
    for (const bm of event.bookmakers || []) {
      const market = (bm.markets || []).find(m => m.key === 'h2h');
      if (!market || market.outcomes.length !== 2) continue;

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const backOdds = outcome.price; // American

        if (backOdds < minOdds || backOdds > maxOdds) continue;

        // Filter by selected back books (if any selected)
        if (backFilter?.size && !backFilter.has(bm.title)) continue;

        // Dedupe: same outcome at same book shouldn't appear twice
        const key = `${event.id}|${outcome.name}|${bm.title}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Find best lay odds (opposite outcome) across ALL books
        const oppOutcome = market.outcomes.find((_, idx) => idx !== i);
        if (!oppOutcome) continue;
        const oppName = oppOutcome.name;

        let bestLayOdds = null;
        let bestLayBook = null;

        for (const bm2 of event.bookmakers || []) {
          if (bm2.title === bm.title) continue; // hedge must be a different book
          if (layFilter?.size && !layFilter.has(bm2.title)) continue; // hedge must be at one of my books
          const mkt2 = (bm2.markets || []).find(m => m.key === 'h2h');
          if (!mkt2) continue;
          const opp = mkt2.outcomes.find(o => o.name === oppName);
          if (!opp) continue;
          // Higher is better for the lay (we get more back if the hedge wins)
          if (bestLayOdds === null || opp.price > bestLayOdds) {
            bestLayOdds = opp.price;
            bestLayBook = bm2.title;
          }
        }

        if (bestLayOdds === null) continue;

        const hedge = bonusBetHedge({
          bonus: bonusAmount,
          backDecimal: americanToDecimal(backOdds),
          layDecimal: americanToDecimal(bestLayOdds),
        });
        if (!hedge || hedge.conversionRate < 0.5) continue;

        results.push({
          eventLabel: `${event.away_team} @ ${event.home_team}`,
          outcome: outcome.name,
          backOdds,
          backBook: bm.title,
          layOdds: bestLayOdds,
          layBook: bestLayBook,
          conversionRate: hedge.conversionRate,
          hedgeStake: hedge.hedgeStake,
          lockedValue: hedge.lockedValue,
          bonusAmount,
        });
      }
    }
  }

  results.sort((a, b) => b.conversionRate - a.conversionRate);
  return results;
}

// When the target range yields nothing, find best opportunities from all positive odds.
function findFallbackOpportunities(events, { bonusAmount, backFilter, layFilter, excludeMin, excludeMax }) {
  return findPromoOpportunities(events, {
    minOdds: 110,
    maxOdds: 10000,
    bonusAmount,
    backFilter,
    layFilter,
  }).filter(r => r.backOdds < excludeMin || r.backOdds > excludeMax).slice(0, 5);
}

function makeCardHtml(op, globalIdx) {
  return `<div class="scan-card" data-idx="${globalIdx}">
    <div class="scan-card-top">
      <div class="scan-outcome">${op.outcome}</div>
      <div class="scan-conversion">${pct(op.conversionRate)}</div>
    </div>
    <div class="scan-event">${op.eventLabel}</div>
    <div class="scan-legs">
      <div class="scan-leg">
        <span class="scan-leg-label">Bonus bet</span>
        <span class="scan-leg-book">${op.backBook}</span>
        <span class="scan-leg-odds back">${fmtAmerican(op.backOdds)}</span>
      </div>
      <div class="scan-leg">
        <span class="scan-leg-label">Hedge</span>
        <span class="scan-leg-book">${op.layBook}</span>
        <span class="scan-leg-odds lay">${fmtAmerican(op.layOdds)}</span>
      </div>
    </div>
    <div class="scan-locked">
      On $${op.bonusAmount} bonus → hedge <strong>$${op.hedgeStake.toFixed(2)}</strong> → lock <strong>$${op.lockedValue.toFixed(2)}</strong>
    </div>
  </div>`;
}

function renderScanResults(opportunities, fallback = []) {
  const container = document.getElementById('scan-results');
  const allOps = [...opportunities, ...fallback];

  if (!allOps.length) {
    container.innerHTML = '<div class="scan-empty">No opportunities found. Try a different sport or wider range.</div>';
    container.classList.remove('hidden');
    return;
  }

  const { minOdds, maxOdds } = window._scanParams || {};
  const mainHtml = opportunities.length
    ? opportunities.map((op, i) => makeCardHtml(op, i)).join('')
    : `<div class="scan-empty" style="padding:8px 0">No results in +${minOdds}–+${maxOdds} range.</div>`;

  const fallbackHtml = fallback.length
    ? `<div class="scan-section-label scan-section-fallback">Best available outside range</div>` +
      fallback.map((op, i) => makeCardHtml(op, opportunities.length + i)).join('')
    : '';

  container.innerHTML = mainHtml + fallbackHtml;
  container.classList.remove('hidden');

  container.querySelectorAll('.scan-card').forEach(card => {
    card.addEventListener('click', () => {
      const op = allOps[parseInt(card.dataset.idx)];
      document.getElementById('bonus-amount').value = op.bonusAmount;
      document.getElementById('bonus-back').value = fmtAmerican(op.backOdds);
      document.getElementById('bonus-lay').value = fmtAmerican(op.layOdds);
      document.querySelector('[data-tab="bonus"]').click();
      document.getElementById('bonus-calc').click();
    });
  });
}

document.getElementById('scan-load').addEventListener('click', async () => {
  const apiKey = await getApiKey();
  const statusEl = document.getElementById('scan-status');
  const resultsEl = document.getElementById('scan-results');

  if (!apiKey) {
    statusEl.textContent = 'Add your API key in Settings (⚙) first.';
    statusEl.className = 'odds-error';
    statusEl.classList.remove('hidden');
    resultsEl.classList.add('hidden');
    return;
  }

  const sport = document.getElementById('scan-sport').value;
  const minOdds = parseInt(document.getElementById('scan-min').value) || 300;
  const maxOdds = parseInt(document.getElementById('scan-max').value) || 500;
  const bonusAmount = parseFloat(document.getElementById('scan-amount').value) || 100;

  statusEl.textContent = 'Scanning…';
  statusEl.className = 'odds-loading';
  statusEl.style.display = 'block';
  resultsEl.classList.add('hidden');

  try {
    let events;
    if (sport === '__all__') {
      let activeSports;
      try {
        activeSports = await fetchActiveSports(apiKey);
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'odds-error';
        statusEl.style.display = 'block';
        return;
      }
      const sportKeys = activeSports.map(s => s.key);
      statusEl.textContent = `Scanning ${sportKeys.length} sports…`;
      const settled = await Promise.allSettled(
        sportKeys.map(k => fetchForContentScript(k, apiKey))
      );
      events = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      if (!events.length) {
        statusEl.textContent = 'No active markets found across any sport.';
        statusEl.className = 'odds-error';
        statusEl.style.display = 'block';
        return;
      }
    } else {
      try {
        events = await fetchForContentScript(sport, apiKey);
      } catch (err) {
        if (err.status === 404) {
          statusEl.textContent = 'No active markets for this sport right now. Try another.';
          statusEl.className = 'odds-error';
          statusEl.style.display = 'block';
          return;
        }
        throw err;
      }
    }
    statusEl.style.display = 'none';

    // Store globally so book filter chips can re-run without re-fetching
    window._scanEvents = events;
    window._scanParams = { minOdds, maxOdds, bonusAmount };

    // Persist scan state for side panel session resume
    chrome.storage.session.set({ scanEvents: events, scanParams: { minOdds, maxOdds, bonusAmount } });

    const allBooks = extractBooks(events);
    mergeKnownBooks(allBooks); // add newly seen books to settings chips

    // Back-book chips: if my books configured, only show books I have; else all
    const books = myBooksSet.size > 0 ? allBooks.filter(b => myBooksSet.has(b)) : allBooks;
    const stored = await new Promise(r => chrome.storage.local.get('selectedBooks', d => r(d.selectedBooks)));
    const savedSelection = stored ? new Set(stored) : new Set(books);
    renderBookChips(books, savedSelection);

    applyFilter();
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = 'odds-error';
    statusEl.style.display = 'block';
  }
});

// ── Populate explainer text ───────────────────────────────────────────────────
document.getElementById('bonus-explainer').textContent = explanations.bonusBet.body;
document.getElementById('rf-explainer').textContent = explanations.riskFree.body;
document.getElementById('dep-explainer').textContent = explanations.depositMatch.body;
document.getElementById('boost-explainer').textContent = explanations.oddsBoost.body;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => `$${Math.abs(n).toFixed(2)}`;
const pct = n => `${(n * 100).toFixed(1)}%`;
const fmtAmerican = n => n > 0 ? `+${n}` : `${n}`;

function showResult(id, { good, headline, details = [] }) {
  const el = document.getElementById(id);
  el.className = `result ${good ? 'good' : 'bad'}`;
  el.innerHTML = `<div class="headline">${headline}</div>` +
    details.map(d => `<div class="detail">${d}</div>`).join('');
}

function getOdds(inputId) {
  return parseOdds(document.getElementById(inputId).value);
}

function getNum(inputId, fallback) {
  const v = parseFloat(document.getElementById(inputId).value);
  return Number.isFinite(v) ? v : fallback;
}

// ── Bonus Bet ─────────────────────────────────────────────────────────────────
document.getElementById('bonus-calc').addEventListener('click', () => {
  const bonus = getNum('bonus-amount', NaN);
  const backDecimal = getOdds('bonus-back');
  const layDecimal = getOdds('bonus-lay');
  const r = bonusBetHedge({ bonus, backDecimal, layDecimal });
  if (!r) return showResult('bonus-result', {
    good: false,
    headline: 'Please fill in all three fields with valid odds.',
  });
  showResult('bonus-result', {
    good: r.conversionRate >= 0.6,
    headline: `You'll lock in ${fmt(r.lockedValue)} — a ${pct(r.conversionRate)} conversion rate.`,
    details: [
      `Bet ${fmt(bonus)} bonus on the first side, then hedge ${fmt(r.hedgeStake)} cash on the other side.`,
      r.conversionRate >= 0.6
        ? 'Solid conversion — go for it.'
        : 'Conversion is low. Look for better odds on the hedge side.',
    ],
  });
});

// ── Risk-Free ─────────────────────────────────────────────────────────────────
document.getElementById('rf-calc').addEventListener('click', () => {
  const stake = getNum('rf-stake', NaN);
  const decimal = getOdds('rf-odds');
  const refundInput = document.getElementById('rf-refund').value;
  const refund = refundInput ? parseFloat(refundInput) : stake;
  const conversionRate = getNum('rf-conversion', 70) / 100;
  const winProbInput = document.getElementById('rf-winprob').value;
  const winProb = winProbInput ? parseFloat(winProbInput) / 100 : undefined;

  const r = riskFreeEV({ stake, decimal, refund, conversionRate, winProb });
  if (!r) return showResult('rf-result', {
    good: false,
    headline: 'Please fill in all required fields with valid values.',
  });
  showResult('rf-result', {
    good: r.ev > 0,
    headline: `Expected value: ${r.ev >= 0 ? '+' : ''}${fmt(r.ev)} on a ${fmt(stake)} bet.`,
    details: [
      `If the bet loses, your ${fmt(refund)} refund is worth ~${fmt(r.refundValueIfLose)} in cash after hedging.`,
      r.ev > 0 ? 'Positive EV — worth taking.' : 'Negative EV — not worth it.',
    ],
  });
});

// ── Deposit Match ─────────────────────────────────────────────────────────────
document.getElementById('dep-calc').addEventListener('click', () => {
  const match = getNum('dep-match', NaN);
  const rolloverMultiplier = getNum('dep-rollover', NaN);
  const houseHold = getNum('dep-hold', NaN) / 100;
  const r = depositMatchEV({ match, rolloverMultiplier, houseHold });
  if (!r) return showResult('dep-result', {
    good: false,
    headline: 'Please fill in all three fields.',
  });
  showResult('dep-result', {
    good: r.worthTaking,
    headline: r.worthTaking
      ? `This promo is worth ~${fmt(r.ev)} in expected profit.`
      : `Not worth it — expected loss of ${fmt(Math.abs(r.ev))}.`,
    details: [
      `You'll need to wager ${fmt(match * rolloverMultiplier)} total.`,
      `Expected cost from house edge: ${fmt(r.expectedCost)}.`,
      r.worthTaking
        ? 'Grind through the rollover on low-hold markets (spreads, totals).'
        : 'Rollover requirement is too steep.',
    ],
  });
});

// ── Odds Boost ────────────────────────────────────────────────────────────────
document.getElementById('boost-calc').addEventListener('click', () => {
  const boostedDecimal = getOdds('boost-boosted');
  const fairDecimal = getOdds('boost-fair');
  const stake = getNum('boost-stake', NaN);
  const r = oddsBoostEV({ boostedDecimal, fairDecimal, stake });
  if (!r) return showResult('boost-result', {
    good: false,
    headline: 'Please fill in all three fields with valid values.',
  });
  const sign = r.dollarEV >= 0 ? '+' : '';
  showResult('boost-result', {
    good: r.worthTaking,
    headline: `${sign}${pct(r.evPercent)} edge → ${sign}${fmt(r.dollarEV)} expected on a ${fmt(stake)} bet.`,
    details: [
      r.worthTaking ? 'This boost is +EV. Bet the max allowed.' : 'Boosted odds are still worse than fair. Skip.',
      `Boosted: ${fmtAmerican(decimalToAmerican(boostedDecimal))} vs fair: ${fmtAmerican(decimalToAmerican(fairDecimal))}.`,
    ],
  });
});
