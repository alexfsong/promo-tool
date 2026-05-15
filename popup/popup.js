import { parseOdds, decimalToAmerican, americanToDecimal } from '../src/calc/odds.js';
import { bonusBetHedge } from '../src/calc/bonusBet.js';
import { riskFreeEV } from '../src/calc/riskFree.js';
import { depositMatchEV } from '../src/calc/depositMatch.js';
import { oddsBoostEV } from '../src/calc/oddsBoost.js';
import { explanations } from '../src/ui/explanations.js';
import {
  fetchOdds,
  fetchSports,
  getApiKey,
  saveApiKey,
  credentialLabel,
  credentialPlaceholder,
  credentialHint,
} from '../src/api/provider.js';
import { promoRegistry, getPromoType } from '../src/promos/registry.js';
import {
  recommendBonusBet,
  recommendRiskFree,
  recommendDepositMatch,
  recommendOddsBoost,
  recommendBetAndGet,
  EMPTY_STATE_NO_PLAY,
  EMPTY_STATE_NEED_BOOKS,
} from '../src/promos/recommend.js';
import { parseBetSlip, PARSE_PARLAY } from '../src/parsers/betSlip.js';

// ── Tabs ──────────────────────────────────────────────────────────────────────
// Top-level tabs. Legacy calculators use their own data-legacy-tab attribute
// and live inside #legacy-calcs (reached from Settings only — FR-012).
document.querySelectorAll('nav.tabs > .tab[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs > .tab[data-tab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('section.tab-panel:not(.legacy-panel)').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    if (btn.dataset.tab === 'ev') renderEvTab();
  });
});

// ── Advanced mode (Beginner is default — FR-008) ──────────────────────────────
const headerToggle = document.getElementById('advancedToggle');
const settingsToggle = document.getElementById('advancedToggleSettings');

function applyAdvancedMode(on) {
  document.body.classList.toggle('advanced', on);
  headerToggle.checked = on;
  settingsToggle.checked = on;
  // If Beginner and the EV/Scanner tab is currently active, fall back to Best Play.
  if (!on) {
    const activeTab = document.querySelector('nav.tabs > .tab.active');
    if (activeTab && activeTab.dataset.advancedOnly === 'true') {
      document.querySelector('nav.tabs > .tab[data-tab="bestplay"]').click();
    }
  }
}

chrome.storage.local.get('advancedMode', ({ advancedMode }) => {
  // Default Beginner. Only previously-toggled-on users land in Advanced.
  applyAdvancedMode(advancedMode === true);
});

[headerToggle, settingsToggle].forEach(el => {
  el.addEventListener('change', () => {
    const on = el.checked;
    applyAdvancedMode(on);
    chrome.storage.local.set({ advancedMode: on });
  });
});

// ── Settings panel ────────────────────────────────────────────────────────────
const settingsPanel = document.getElementById('settingsPanel');
document.getElementById('settingsBtn').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

// Provider-driven copy (spec 005 FR-006). The HTML ships with empty
// placeholders; the active provider fills in the label / placeholder / hint.
const apiKeyInputEl = document.getElementById('apiKeyInput');
const apiKeyLabelEl = document.querySelector('label[for="apiKeyInput"]');
const apiKeyHintEl = document.getElementById('apiKeyHint');
if (apiKeyLabelEl) apiKeyLabelEl.textContent = credentialLabel;
if (apiKeyInputEl) apiKeyInputEl.placeholder = credentialPlaceholder;
if (apiKeyHintEl) apiKeyHintEl.innerHTML = credentialHint;

getApiKey().then(key => {
  if (key) apiKeyInputEl.value = key;
});

document.getElementById('saveApiKey').addEventListener('click', async () => {
  const key = apiKeyInputEl.value.trim();
  const saved = document.getElementById('apiKeySaved');
  try {
    await saveApiKey(key);
    saved.textContent = 'Saved!';
    saved.style.color = '#22c55e';
    saved.classList.remove('hidden');
    setTimeout(() => saved.classList.add('hidden'), 2000);
  } catch (err) {
    saved.textContent = err.message || 'Could not save.';
    saved.style.color = '#ef4444';
    saved.classList.remove('hidden');
  }
});

// Legacy calculators open/close
const legacyCalcs = document.getElementById('legacy-calcs');
document.getElementById('openCalculatorsLink').addEventListener('click', () => {
  legacyCalcs.classList.remove('hidden');
  settingsPanel.classList.add('hidden');
});
document.getElementById('closeLegacyCalcs').addEventListener('click', () => {
  legacyCalcs.classList.add('hidden');
});

// Legacy tab switching (independent of top-level tabs)
document.querySelectorAll('.tab[data-legacy-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-legacy-tab]').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.legacy-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.legacyTab}`).classList.remove('hidden');
  });
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

  wrapper.rebuild = () => {
    input.value = select.options[select.selectedIndex]?.text ?? '';
  };

  return wrapper;
}

const scanSportSS = makeSearchableSelect(document.getElementById('scan-sport'));

async function initSportDropdowns() {
  const apiKey = await getApiKey();
  if (!apiKey) return;

  let sports;
  try {
    sports = await fetchSports();
  } catch (e) {
    return;
  }

  const groups = {};
  for (const s of sports) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

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

// ── My sportsbooks (settings) ─────────────────────────────────────────────────

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

function mergeKnownBooks(books) {
  chrome.storage.local.get('knownBooks', d => {
    const known = [...new Set([...DEFAULT_BOOKS, ...(d.knownBooks || []), ...books])].sort();
    chrome.storage.local.set({ knownBooks: known });
    renderMyBooksChips(known);
  });
}

loadMyBooks();

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = n => `$${Math.abs(n).toFixed(2)}`;
const fmtSigned = n => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
const pct = n => `${(n * 100).toFixed(1)}%`;
const fmtAmerican = n => n > 0 ? `+${n}` : `${n}`;

// ── Best Play tab ─────────────────────────────────────────────────────────────

const bpPromoSelect = document.getElementById('bp-promo-type');
const bpBlurb = document.getElementById('bp-promo-blurb');
const bpFieldsContainer = document.getElementById('bp-fields');
const bpCard = document.getElementById('bp-card');
const bpStatus = document.getElementById('bp-status');
const bpPaste = document.getElementById('bp-paste');
const bpPasteStatus = document.getElementById('bp-paste-status');
const bpPasteConfirm = document.getElementById('bp-paste-confirm');

let lastBestPlayByPromo = {}; // for EV tab
let lastProviderEvents = null;

function buildPromoPicker() {
  bpPromoSelect.innerHTML = '';
  for (const p of promoRegistry) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    bpPromoSelect.appendChild(opt);
  }
}

function renderPromoFields(promoTypeId) {
  const promo = getPromoType(promoTypeId);
  if (!promo) {
    bpFieldsContainer.innerHTML = '';
    bpBlurb.textContent = '';
    return;
  }
  bpBlurb.textContent = promo.blurb;
  bpFieldsContainer.innerHTML = '';
  for (const f of promo.fields) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const label = document.createElement('label');
    label.textContent = f.label;
    label.setAttribute('for', `bpf-${f.id}`);
    wrap.appendChild(label);

    if (f.type === 'oddsRange') {
      const row = document.createElement('div');
      row.className = 'range-row';
      const [lo, hi] = f.default ?? [300, 500];
      const inLow = document.createElement('input');
      inLow.type = 'number';
      inLow.id = `bpf-${f.id}-low`;
      inLow.value = lo;
      const inHigh = document.createElement('input');
      inHigh.type = 'number';
      inHigh.id = `bpf-${f.id}-high`;
      inHigh.value = hi;
      const wrapLow = document.createElement('div'); wrapLow.className = 'field';
      const labLow = document.createElement('label'); labLow.textContent = 'Min'; wrapLow.appendChild(labLow); wrapLow.appendChild(inLow);
      const wrapHigh = document.createElement('div'); wrapHigh.className = 'field';
      const labHigh = document.createElement('label'); labHigh.textContent = 'Max'; wrapHigh.appendChild(labHigh); wrapHigh.appendChild(inHigh);
      row.appendChild(wrapLow);
      row.appendChild(wrapHigh);
      wrap.appendChild(row);
    } else if (f.type === 'percent') {
      const input = document.createElement('input');
      input.type = 'number';
      input.id = `bpf-${f.id}`;
      input.min = 0;
      input.max = 100;
      input.step = 1;
      input.value = f.default != null ? Math.round(f.default * 100) : '';
      wrap.appendChild(input);
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = 'Enter as %, e.g. 70 = 0.70.';
      wrap.appendChild(hint);
    } else if (f.type === 'odds') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `bpf-${f.id}`;
      input.placeholder = '+200 or -110';
      wrap.appendChild(input);
    } else {
      // money or fallback
      const input = document.createElement('input');
      input.type = 'number';
      input.id = `bpf-${f.id}`;
      input.min = 0;
      input.step = 1;
      input.placeholder = f.default != null ? String(f.default) : '';
      if (f.default != null && typeof f.default !== 'object') input.value = f.default;
      wrap.appendChild(input);
    }
    bpFieldsContainer.appendChild(wrap);
  }
}

function readPromoInputs(promoTypeId) {
  const promo = getPromoType(promoTypeId);
  if (!promo) return null;
  const inputs = { promoTypeId };
  for (const f of promo.fields) {
    if (f.type === 'oddsRange') {
      const lo = parseFloat(document.getElementById(`bpf-${f.id}-low`).value);
      const hi = parseFloat(document.getElementById(`bpf-${f.id}-high`).value);
      inputs[f.id] = [lo, hi];
    } else if (f.type === 'percent') {
      const v = parseFloat(document.getElementById(`bpf-${f.id}`).value);
      inputs[f.id] = Number.isFinite(v) ? v / 100 : f.default;
    } else if (f.type === 'odds') {
      const raw = document.getElementById(`bpf-${f.id}`).value;
      const d = parseOdds(raw);
      inputs[f.id] = Number.isFinite(d) ? decimalToAmerican(d) : NaN;
    } else {
      const v = parseFloat(document.getElementById(`bpf-${f.id}`).value);
      inputs[f.id] = v;
    }
  }
  inputs.mode = document.body.classList.contains('advanced') ? 'advanced' : 'beginner';
  return inputs;
}

buildPromoPicker();

chrome.storage.local.get('promoType', ({ promoType }) => {
  const id = promoType && promoRegistry.find(p => p.id === promoType) ? promoType : promoRegistry[0].id;
  bpPromoSelect.value = id;
  renderPromoFields(id);
});

bpPromoSelect.addEventListener('change', () => {
  const id = bpPromoSelect.value;
  chrome.storage.local.set({ promoType: id });
  renderPromoFields(id);
  bpCard.classList.add('hidden');
});

// Fetch provider events on demand. Cache for the session.
async function fetchAllEvents() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    bpStatus.textContent = 'Add your API key in Settings (⚙) first.';
    bpStatus.className = 'odds-error';
    bpStatus.classList.remove('hidden');
    return null;
  }
  bpStatus.textContent = 'Scanning the markets…';
  bpStatus.className = 'odds-loading';
  bpStatus.classList.remove('hidden');

  let activeSports;
  try {
    activeSports = await fetchSports();
  } catch (err) {
    // FR-013: credentials errors surface verbatim. Other errors fall back
    // to the generic "couldn't reach" copy with the underlying message.
    const isCredsError = /credentials rejected/i.test(err.message);
    bpStatus.textContent = isCredsError
      ? err.message
      : `Couldn't reach the odds source — check Settings. (${err.message})`;
    bpStatus.className = 'odds-error';
    return null;
  }
  const sportKeys = activeSports.map(s => s.key);
  const settled = await Promise.allSettled(sportKeys.map(k => fetchOdds(k)));
  const events = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  bpStatus.classList.add('hidden');
  lastProviderEvents = events;
  // Persist book names so chips know about them.
  const books = new Set();
  for (const ev of events) for (const bm of ev.bookmakers || []) books.add(bm.title);
  mergeKnownBooks([...books]);
  return events;
}

function recommend(promoTypeId, inputs, events, userBooks) {
  switch (promoTypeId) {
    case 'bonus-bet':     return recommendBonusBet(inputs, events, userBooks);
    case 'bet-and-get':   return recommendBetAndGet(inputs, events, userBooks);
    case 'risk-free':     return recommendRiskFree(inputs, events, userBooks);
    case 'deposit-match': return recommendDepositMatch(inputs, events, userBooks);
    case 'profit-boost':  return recommendOddsBoost(inputs, events, userBooks);
    default: return null;
  }
}

function renderEmptyState(kind) {
  bpStatus.textContent = '';
  bpStatus.classList.add('hidden');
  bpCard.classList.remove('hidden');
  if (kind === EMPTY_STATE_NEED_BOOKS) {
    bpCard.innerHTML = `<div class="bp-empty">
      <div>You need at least two sportsbooks in <strong>My sportsbooks</strong> to lock in cash with a cross-book hedge.</div>
      <button class="bp-empty-action" id="bp-open-settings">Open Settings</button>
    </div>`;
    document.getElementById('bp-open-settings').addEventListener('click', () => {
      settingsPanel.classList.remove('hidden');
    });
    return;
  }
  bpCard.innerHTML = `<div class="bp-empty">
    <div>No conversion above $0 right now for these inputs. Try widening the odds range, raising the amount, or re-scanning later.</div>
    <button class="bp-empty-action" id="bp-rescan">Re-scan</button>
  </div>`;
  document.getElementById('bp-rescan').addEventListener('click', () => {
    lastProviderEvents = null;
    document.getElementById('bp-go').click();
  });
}

function renderAltPlaysSection(title, blurb, plays) {
  if (!Array.isArray(plays) || !plays.length) return '';
  const rows = plays.map(p => `
    <li class="bp-alt-row">
      <div class="bp-alt-event">${p.event.away} @ ${p.event.home}</div>
      <div class="bp-alt-line">
        <span><strong>${p.evSelection}</strong> ${fmtAmerican(p.evOdds)} @ ${p.evBook}</span>
        <span class="bp-alt-arrow">→ hedge</span>
        <span><strong>${p.hedgeLeg.selection}</strong> ${fmtAmerican(p.hedgeLeg.odds)} @ ${p.hedgeLeg.book} (${fmt(p.hedgeLeg.cashStake)})</span>
      </div>
      <div class="bp-alt-locked">Locked ${fmt(p.lockedCash)}</div>
    </li>`).join('');
  return `
    <details class="bp-alts">
      <summary>${title} (${plays.length})</summary>
      <div class="bp-alts-blurb">${blurb}</div>
      <ul class="bp-alts-list">${rows}</ul>
    </details>`;
}

function renderBestPlayCard(play, promoTypeId) {
  bpStatus.textContent = '';
  bpStatus.classList.add('hidden');
  const isAdvancedHeadline = play.headline.kind === 'netEV';
  const headlineLabel = isAdvancedHeadline ? 'Net EV (Advanced)' : 'Guaranteed locked';
  const headlineAmount = isAdvancedHeadline
    ? fmtSigned(play.headline.amount)
    : fmt(play.headline.amount);

  let evLegHtml = '';
  if (play.evLeg) {
    const stakeLine = play.evLeg.stakeKind === 'bonusBet'
      ? `Place your <strong>bonus bet</strong> on this side.`
      : `Stake <strong>${fmt(play.evLeg.stake ?? 0)}</strong> cash.`;
    evLegHtml = `
      <div class="bp-leg">
        <span class="bp-leg-label">Place this bet</span>
        <span class="bp-leg-book">${play.evLeg.book}</span>
        <div class="bp-leg-event">${play.evLeg.event.away} @ ${play.evLeg.event.home}</div>
        <div class="bp-leg-line">
          <span class="bp-leg-selection">${play.evLeg.selection}</span>
          <span class="bp-leg-odds">${fmtAmerican(play.evLeg.odds)}</span>
        </div>
        <div class="bp-leg-stake">${stakeLine}</div>
      </div>`;
  }

  let hedgeHtml = '';
  for (const leg of play.hedgeLegs) {
    hedgeHtml += `
      <div class="bp-leg">
        <span class="bp-leg-label">Then hedge here</span>
        <span class="bp-leg-book">${leg.book}</span>
        <div class="bp-leg-event">${leg.event.away} @ ${leg.event.home}</div>
        <div class="bp-leg-line">
          <span class="bp-leg-selection">${leg.selection}</span>
          <span class="bp-leg-odds">${fmtAmerican(leg.odds)}</span>
        </div>
        <div class="bp-leg-stake">Stake <strong>${fmt(leg.cashStake)}</strong> cash.</div>
      </div>`;
  }

  let stage2Html = '';
  if (play.stage2) {
    const s2 = play.stage2;
    stage2Html = `
      <div class="bp-stage2">
        <div class="bp-stage2-label">Stage 2 — if your qualifying bet wins</div>
        <div>Use the credited bonus bet on <strong>${s2.evSelection}</strong> at <strong>${s2.book}</strong> (${fmtAmerican(s2.evOdds)}).</div>
        <div>Then hedge <strong>${fmt(s2.hedgeCashStake)}</strong> cash on <strong>${s2.hedgeSelection}</strong> at <strong>${s2.hedgeBook}</strong> (${fmtAmerican(s2.hedgeOdds)}).</div>
      </div>`;
  }

  const otherPlaysHtml = renderAltPlaysSection(
    'Other plays',
    'Top alternates in your odds range. Useful when the feed snapshot is stale or a book disagrees.',
    play.otherPlays,
  );
  const nearMissesHtml = renderAltPlaysSection(
    'Near-miss plays',
    'Positive-locked plays just outside your odds range. Widen the range to make these primary.',
    play.nearMisses,
  );

  bpCard.classList.remove('hidden');
  bpCard.innerHTML = `
    <div class="bp-card${isAdvancedHeadline ? ' advanced-headline' : ''}">
      <div class="bp-headline">
        <span class="bp-headline-label">${headlineLabel}</span>
        <span class="bp-headline-amount">${headlineAmount}</span>
      </div>
      ${evLegHtml}
      ${hedgeHtml}
      ${stage2Html}
      ${otherPlaysHtml}
      ${nearMissesHtml}
      <details class="bp-details">
        <summary>Show details</summary>
        <div class="bp-details-body">${play.showDetails.formulaLine}</div>
      </details>
    </div>`;

  // Track this BestPlay for the EV tab (Advanced only).
  lastBestPlayByPromo[promoTypeId] = play;
}

document.getElementById('bp-go').addEventListener('click', async () => {
  const promoTypeId = bpPromoSelect.value;
  const inputs = readPromoInputs(promoTypeId);
  if (!inputs) return;

  bpCard.classList.add('hidden');
  const events = lastProviderEvents ?? await fetchAllEvents();
  if (!events) return;

  const userBooks = [...myBooksSet];
  const play = recommend(promoTypeId, inputs, events, userBooks);

  if (!play) {
    bpStatus.textContent = 'Please fill in all required fields with valid values.';
    bpStatus.className = 'odds-error';
    bpStatus.classList.remove('hidden');
    return;
  }
  if (play === EMPTY_STATE_NEED_BOOKS || play === EMPTY_STATE_NO_PLAY) {
    return renderEmptyState(play);
  }
  renderBestPlayCard(play, promoTypeId);
});

// ── Bet-slip paste handling ───────────────────────────────────────────────────
bpPaste.addEventListener('paste', () => setTimeout(handlePaste, 10));

function handlePaste() {
  const text = bpPaste.value;
  if (!text.trim()) {
    bpPasteStatus.textContent = '';
    bpPasteConfirm.classList.add('hidden');
    return;
  }
  const parsed = parseBetSlip(text);

  if (parsed === PARSE_PARLAY) {
    bpPasteStatus.textContent = "Parlays aren't supported yet — paste a single-leg straight bet.";
    bpPasteConfirm.classList.add('hidden');
    return;
  }

  const recognized = [];
  if (parsed.book) recognized.push(`book: ${parsed.book}`);
  if (parsed.odds != null) recognized.push(`odds: ${fmtAmerican(parsed.odds)}`);
  if (parsed.selection) recognized.push(`selection: ${parsed.selection}`);
  if (parsed.event) recognized.push(`event: ${parsed.event.away} @ ${parsed.event.home}`);
  if (parsed.market) recognized.push(`market: ${parsed.market}`);

  if (!recognized.length) {
    bpPasteStatus.textContent = "Couldn't read that bet slip. Paste a DraftKings or FanDuel single-leg slip, or fill the fields above by hand.";
    bpPasteConfirm.classList.add('hidden');
    return;
  }

  bpPasteStatus.textContent = `Picked up: ${recognized.join(' · ')}.`;

  const missing = !parsed.event ? 'event' : (!parsed.selection ? 'selection' : null);
  if (missing) {
    bpPasteConfirm.classList.remove('hidden');
    bpPasteConfirm.innerHTML = `Couldn't read the <strong>${missing}</strong> from your paste. Type it into the fields above before tapping <em>Find best play</em> — we won't guess against scanned events.`;
  } else {
    bpPasteConfirm.classList.add('hidden');
  }
}

// ── EV tab (Advanced-only — FR-007) ───────────────────────────────────────────

function renderEvTab() {
  const container = document.getElementById('ev-content');
  const entries = Object.entries(lastBestPlayByPromo);
  if (!entries.length) {
    container.innerHTML = `<div class="hint">Run a Best Play first. EV per promo type will appear here.</div>`;
    return;
  }
  container.innerHTML = entries
    .filter(([_, play]) => play && play.showDetails?.ev != null)
    .map(([id, play]) => {
      const promo = getPromoType(id);
      return `<div class="ev-row">
        <span class="ev-row-label">${promo?.label ?? id}</span>
        <span class="ev-row-value">${fmtSigned(play.showDetails.ev)}</span>
      </div>
      <div class="hint" style="margin-top:-4px;padding-left:12px;">if the bonus bet converts at your assumed rate</div>`;
    })
    .join('') || `<div class="hint">No EV data for the promo types you've run yet.</div>`;
}

// ── Legacy: Promo Scanner (Advanced-only tab) ─────────────────────────────────

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
  const seen = new Set();

  for (const event of events) {
    for (const bm of event.bookmakers || []) {
      const market = (bm.markets || []).find(m => m.key === 'h2h');
      if (!market || market.outcomes.length !== 2) continue;

      for (let i = 0; i < market.outcomes.length; i++) {
        const outcome = market.outcomes[i];
        const backOdds = outcome.price;

        if (backOdds < minOdds || backOdds > maxOdds) continue;
        if (backFilter?.size && !backFilter.has(bm.title)) continue;

        const key = `${event.id}|${outcome.name}|${bm.title}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const oppOutcome = market.outcomes.find((_, idx) => idx !== i);
        if (!oppOutcome) continue;
        const oppName = oppOutcome.name;

        let bestLayOdds = null;
        let bestLayBook = null;

        for (const bm2 of event.bookmakers || []) {
          if (bm2.title === bm.title) continue;
          if (layFilter?.size && !layFilter.has(bm2.title)) continue;
          const mkt2 = (bm2.markets || []).find(m => m.key === 'h2h');
          if (!mkt2) continue;
          const opp = mkt2.outcomes.find(o => o.name === oppName);
          if (!opp) continue;
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
      // Click → open legacy Bonus Bet calculator pre-filled.
      const op = allOps[parseInt(card.dataset.idx)];
      legacyCalcs.classList.remove('hidden');
      document.querySelector('.tab[data-legacy-tab="bonus"]').click();
      document.getElementById('bonus-amount').value = op.bonusAmount;
      document.getElementById('bonus-back').value = fmtAmerican(op.backOdds);
      document.getElementById('bonus-lay').value = fmtAmerican(op.layOdds);
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
        activeSports = await fetchSports();
      } catch (err) {
        statusEl.textContent = err.message;
        statusEl.className = 'odds-error';
        statusEl.style.display = 'block';
        return;
      }
      const sportKeys = activeSports.map(s => s.key);
      statusEl.textContent = `Scanning ${sportKeys.length} sports…`;
      const settled = await Promise.allSettled(sportKeys.map(k => fetchOdds(k)));
      events = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      if (!events.length) {
        statusEl.textContent = 'No active markets found across any sport.';
        statusEl.className = 'odds-error';
        statusEl.style.display = 'block';
        return;
      }
    } else {
      try {
        events = await fetchOdds(sport);
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

    window._scanEvents = events;
    window._scanParams = { minOdds, maxOdds, bonusAmount };

    chrome.storage.session.set({ scanEvents: events, scanParams: { minOdds, maxOdds, bonusAmount } });

    const allBooks = extractBooks(events);
    mergeKnownBooks(allBooks);

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

// ── Legacy calculator explainers ──────────────────────────────────────────────
document.getElementById('bonus-explainer').textContent = explanations.bonusBet.body;
document.getElementById('rf-explainer').textContent = explanations.riskFree.body;
document.getElementById('dep-explainer').textContent = explanations.depositMatch.body;
document.getElementById('boost-explainer').textContent = explanations.oddsBoost.body;

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

// ── Legacy: Bonus Bet ─────────────────────────────────────────────────────────
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

// ── Legacy: Risk-Free ─────────────────────────────────────────────────────────
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

// ── Legacy: Deposit Match ─────────────────────────────────────────────────────
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

// ── Legacy: Odds Boost ────────────────────────────────────────────────────────
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
