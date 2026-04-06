// Promo Tool — Content Script
// Self-contained IIFE. No ES module imports.
// Runs on DraftKings and FanDuel pages.

(function () {
  'use strict';

  // ── Odds math (inlined from src/calc/odds.js) ────────────────────────────
  function americanToDecimal(n) {
    n = Number(n);
    if (!isFinite(n) || n === 0) return NaN;
    return n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  }

  function decimalToAmerican(d) {
    d = Number(d);
    if (!isFinite(d) || d <= 1) return NaN;
    return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
  }

  function fmtAmerican(n) {
    if (!isFinite(n)) return '—';
    return n > 0 ? `+${n}` : `${n}`;
  }

  // Remove vig from a two-sided market to get fair odds.
  function noVigFair(americanA, americanB) {
    function impl(a) {
      return a < 0 ? Math.abs(a) / (Math.abs(a) + 100) : 100 / (a + 100);
    }
    const pA = impl(americanA);
    const pB = impl(americanB);
    const total = pA + pB;
    if (total <= 0) return null;
    const fairA = pA / total;
    const fairB = pB / total;
    return {
      fairA: decimalToAmerican(1 / fairA),
      fairB: decimalToAmerican(1 / fairB),
      holdPct: ((total - 1) * 100).toFixed(2),
    };
  }

  // ── Sport detection ───────────────────────────────────────────────────────
  function detectSport() {
    const path = location.pathname.toLowerCase();
    const map = [
      [/football|nfl/,     'americanfootball_nfl'],
      [/basketball|nba/,   'basketball_nba'],
      [/baseball|mlb/,     'baseball_mlb'],
      [/hockey|nhl/,       'icehockey_nhl'],
      [/tennis|atp|wta/,   'tennis_atp_singles'],
    ];
    for (const [re, key] of map) {
      if (re.test(path)) return key;
    }
    return null;
  }

  // ── American odds regex ───────────────────────────────────────────────────
  // Matches +150, -110, +1200. Won't match decimals or plain numbers.
  const ODDS_RE = /(?<![0-9])([+-]\d{3,4})(?!\d)/g;
  const MIN_ODDS = -5000;
  const MAX_ODDS = 5000;

  function isValidOdds(n) {
    return isFinite(n) && n !== 0 && n >= MIN_ODDS && n <= MAX_ODDS && n !== 100 && n !== -100;
  }

  // ── Find odds text nodes ──────────────────────────────────────────────────
  function findOddsNodes() {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const tag = node.parentElement?.tagName?.toUpperCase();
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('[data-pt-badge]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent;
      ODDS_RE.lastIndex = 0;
      let m;
      while ((m = ODDS_RE.exec(text)) !== null) {
        const value = parseInt(m[1], 10);
        if (!isValidOdds(value)) continue;
        results.push({ node, value, parentEl: node.parentElement });
      }
    }
    return results;
  }

  // ── Group odds into markets by DOM proximity ──────────────────────────────
  function getAncestors(el, maxDepth = 10) {
    const ancestors = [];
    let cur = el;
    for (let i = 0; i < maxDepth && cur; i++) {
      ancestors.push(cur);
      cur = cur.parentElement;
    }
    return ancestors;
  }

  function countOddsInText(text) {
    ODDS_RE.lastIndex = 0;
    let count = 0;
    let m;
    while ((m = ODDS_RE.exec(text)) !== null) {
      if (isValidOdds(parseInt(m[1], 10))) count++;
    }
    return count;
  }

  function groupIntoMarkets(oddsNodes) {
    const markets = [];
    const used = new Set();

    for (let i = 0; i < oddsNodes.length; i++) {
      if (used.has(i)) continue;
      const nodeA = oddsNodes[i];
      const ancestorsA = getAncestors(nodeA.parentEl, 8);

      for (let j = i + 1; j < oddsNodes.length; j++) {
        if (used.has(j)) continue;
        const nodeB = oddsNodes[j];

        // Find LCA: shallowest ancestor of A that also contains B
        let container = null;
        for (const anc of ancestorsA) {
          if (anc.contains(nodeB.parentEl)) {
            container = anc;
            break;
          }
        }
        if (!container) continue;

        // Container should have exactly 2 odds values
        const oddsInContainer = countOddsInText(container.innerText || '');
        if (oddsInContainer !== 2) continue;

        // Spatial guard: elements should be close on screen
        const rectA = nodeA.parentEl.getBoundingClientRect();
        const rectB = nodeB.parentEl.getBoundingClientRect();
        const dist = Math.hypot(rectA.left - rectB.left, rectA.top - rectB.top);
        if (dist > 500) continue;

        markets.push({
          elements: [nodeA.parentEl, nodeB.parentEl],
          values: [nodeA.value, nodeB.value],
          containerEl: container,
        });
        used.add(i);
        used.add(j);
        break;
      }
    }
    return markets;
  }

  // ── Team name extraction and API matching ─────────────────────────────────
  function extractTeamCandidates(containerEl) {
    const raw = (containerEl.innerText || '')
      .replace(/[+-]\d{3,4}/g, '')      // strip odds
      .replace(/[oOuU]\d+\.?\d*/g, '')  // strip totals (O47.5)
      .replace(/[+-]\d+\.?\d*/g, '')    // strip spreads (+3.5)
      .replace(/\s+/g, ' ')
      .trim();
    return raw.split(/[\n|@/\\–-]+/).map(s => s.trim()).filter(s => s.length > 2 && s.length < 40);
  }

  function normalizeName(name) {
    return name.toLowerCase()
      .replace(/\b(fc|sc|cf|afc|nfc)\b/g, '')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchEventToApi(apiEvents, candidates) {
    if (!apiEvents?.length || !candidates?.length) return null;
    const normCandidates = candidates.map(normalizeName).filter(Boolean);
    let bestScore = 0;
    let bestEvent = null;

    for (const event of apiEvents) {
      const normHome = normalizeName(event.home_team || '');
      const normAway = normalizeName(event.away_team || '');

      let score = 0;
      for (const c of normCandidates) {
        if (normHome.includes(c) || c.includes(normHome)) score += 2;
        if (normAway.includes(c) || c.includes(normAway)) score += 2;
        // Last word of team name (e.g. "Lakers" from "Los Angeles Lakers")
        for (const w of [...normHome.split(' '), ...normAway.split(' ')]) {
          if (w.length > 3 && c.includes(w)) score += 1;
        }
      }
      if (score > bestScore) { bestScore = score; bestEvent = event; }
    }
    return bestScore >= 2 ? bestEvent : null;
  }

  // ── Find best odds for one side from API event data ───────────────────────
  function bestOddsForOutcome(event, outcomeIndex, market = 'h2h') {
    // outcomeIndex: 0 = away/first, 1 = home/second
    let best = null;
    const bookOdds = [];

    for (const bm of event.bookmakers || []) {
      const mkt = (bm.markets || []).find(m => m.key === market);
      if (!mkt) continue;
      const outcome = mkt.outcomes[outcomeIndex];
      if (!outcome) continue;
      const odds = outcome.price;
      bookOdds.push({ book: bm.title, odds });
      if (best === null || odds > best) best = odds;
    }

    bookOdds.sort((a, b) => b.odds - a.odds);
    return { bestOdds: best, bookOdds };
  }

  // ── Badge rating ──────────────────────────────────────────────────────────
  function rateBadge(pageOdds, bestAvailable) {
    if (bestAvailable === null) return 'neutral';
    const pageDec = americanToDecimal(pageOdds);
    const bestDec = americanToDecimal(bestAvailable);
    if (!isFinite(pageDec) || !isFinite(bestDec)) return 'neutral';
    const diffPct = (bestDec - pageDec) / pageDec * 100;
    if (diffPct <= 0.5) return 'green';
    if (diffPct <= 2.5) return 'yellow';
    return 'red';
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  function removeTooltip() {
    document.querySelectorAll('[data-pt-tooltip]').forEach(el => el.remove());
  }

  function showTooltip(anchorEl, data) {
    removeTooltip();

    const tip = document.createElement('div');
    tip.className = 'pt-tooltip';
    tip.setAttribute('data-pt-tooltip', 'true');

    const bookRows = (data.bookOdds || []).map(b => {
      const isBest = data.bestOdds !== null && b.odds === data.bestOdds;
      return `<div class="pt-tip-row">
        <span class="pt-tip-book">${b.book}</span>
        <span class="pt-tip-odds${isBest ? ' pt-tip-best' : ''}">${fmtAmerican(b.odds)}</span>
      </div>`;
    }).join('') || '<div class="pt-tip-row pt-tip-muted">No cross-book data — add API key in extension.</div>';

    const fairLine = data.fairOdds != null
      ? `<div class="pt-tip-fair">No-vig fair: <strong>${fmtAmerican(data.fairOdds)}</strong> (hold: ${data.holdPct}%)</div>`
      : '';

    tip.innerHTML = `
      <div class="pt-tip-header">${data.label || 'Odds comparison'}</div>
      ${bookRows}
      ${fairLine}
    `;

    document.body.appendChild(tip);

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    const tipW = 220;
    let left = rect.right + 8 + window.scrollX;
    let top = rect.top + window.scrollY;
    if (left + tipW > window.innerWidth + window.scrollX - 16) {
      left = rect.left + window.scrollX - tipW - 8;
    }
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${top}px`;

    setTimeout(() => document.addEventListener('click', removeTooltip, { once: true }), 0);
  }

  // ── Badge injection ───────────────────────────────────────────────────────
  const badgeData = new WeakMap(); // element → marketData for that side

  function injectBadge(targetEl, rating, data) {
    // Remove old badge if present (React may have nuked it)
    const existing = targetEl.nextElementSibling;
    if (existing?.getAttribute('data-pt-badge')) existing.remove();

    const badge = document.createElement('span');
    badge.setAttribute('data-pt-badge', 'true');
    badge.className = `pt-badge pt-badge--${rating}`;
    badge.title = rating === 'green' ? 'Best available odds' :
                  rating === 'yellow' ? 'Better odds available elsewhere' :
                  rating === 'red' ? 'Significantly better odds elsewhere' : '';
    badge.textContent = rating === 'green' ? '✓' : rating === 'yellow' ? '~' : '↓';

    badge.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      showTooltip(badge, data);
    });

    targetEl.setAttribute('data-pt-scanned', 'true');
    targetEl.insertAdjacentElement('afterend', badge);
    badgeData.set(targetEl, data);
  }

  // ── Main scan ─────────────────────────────────────────────────────────────
  let apiEvents = null; // null = not fetched yet, [] = fetched but empty/error

  function scanAndBadge() {
    const oddsNodes = findOddsNodes();
    if (oddsNodes.length < 2) return; // not enough odds on page to do anything useful

    const markets = groupIntoMarkets(oddsNodes);

    for (const market of markets) {
      const [elA, elB] = market.elements;
      const [valA, valB] = market.values;

      // No-vig fair odds — always available
      const vig = noVigFair(valA, valB);
      const candidates = extractTeamCandidates(market.containerEl);
      const matchedEvent = apiEvents?.length ? matchEventToApi(apiEvents, candidates) : null;

      // Data for each side's badge + tooltip
      const sides = [
        { el: elA, val: valA, outcomeIndex: 0, fairOdds: vig?.fairA },
        { el: elB, val: valB, outcomeIndex: 1, fairOdds: vig?.fairB },
      ];

      for (const side of sides) {
        let bestOdds = null;
        let bookOdds = [];

        if (matchedEvent) {
          const result = bestOddsForOutcome(matchedEvent, side.outcomeIndex, 'h2h');
          bestOdds = result.bestOdds;
          bookOdds = result.bookOdds;
        }

        const rating = matchedEvent
          ? rateBadge(side.val, bestOdds)
          : 'neutral';

        // Check if badge needs re-injection
        const nextSib = side.el.nextElementSibling;
        const alreadyBadged = nextSib?.getAttribute('data-pt-badge') === 'true';
        if (alreadyBadged && side.el.getAttribute('data-pt-scanned')) continue;

        injectBadge(side.el, rating, {
          label: candidates.join(' vs '),
          bookOdds,
          bestOdds,
          fairOdds: side.fairOdds,
          holdPct: vig?.holdPct,
        });
      }
    }
  }

  // ── MutationObserver (debounced) ──────────────────────────────────────────
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      observer.disconnect();
      try { scanAndBadge(); } catch (e) { /* swallow — never crash the page */ }
      observer.observe(document.body, { childList: true, subtree: true });
    }, 300);
  });

  // ── Startup ───────────────────────────────────────────────────────────────
  const sport = detectSport();
  if (!sport) return; // not a sports page we recognize

  // Initial scan with no API data (shows no-vig fair odds only)
  try { scanAndBadge(); } catch (e) {}

  // Request API data from background worker
  const requestId = `${Date.now()}-${Math.random()}`;
  chrome.runtime.sendMessage({ type: 'ODDS_REQUEST', sport, requestId }, response => {
    if (chrome.runtime.lastError) return; // extension reloaded or background not ready
    if (response?.ok && response.events) {
      apiEvents = response.events;
      try { scanAndBadge(); } catch (e) {}
    }
    // If !ok, stay in no-vig-only mode gracefully
  });

  // Start observing for React re-renders
  observer.observe(document.body, { childList: true, subtree: true });
})();
