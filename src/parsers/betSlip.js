// Bet-slip text parser. Pure: text in, structured BetSlipParse out.
// Heuristic-driven; DK and FD only (research.md R1). Partial parses are
// first-class per FR-009 — any field that cannot be confidently extracted is
// returned as null, with rawText always preserved.

const AMERICAN_ODDS_RE = /^([+-]\d{2,5})$/;
const STAKE_RE = /\$\s?(\d+(?:\.\d+)?)/;
// Constrained to a single line: no `\s` in the character classes, so newlines
// cannot be swallowed into the team names.
const EVENT_RE = /([A-Z][\w .'-]+?)[ \t]*(?:@|vs\.?)[ \t]*([A-Z][\w .'-]+)/;

const MARKET_LABELS = new Map([
  ['moneyline', 'h2h'],
  ['ml', 'h2h'],
  ['h2h', 'h2h'],
  ['spread', 'spreads'],
  ['point spread', 'spreads'],
  ['total', 'totals'],
  ['over/under', 'totals'],
  ['o/u', 'totals'],
]);

const PARLAY_KEYWORDS = /\b(?:parlay|sgp|same\s*game\s*parlay|multi|accumulator|round\s*robin)\b/i;

function findOddsLine(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/[+-]\d{2,5}/);
    if (m && Math.abs(Number(m[0])) >= 100) {
      return { idx: i, odds: Number(m[0]), token: m[0] };
    }
  }
  return null;
}

function detectBook(text) {
  const lower = text.toLowerCase();
  // DK slip uses "Stake $..." for cash bets; FD uses "Wager $...".
  if (/\bstake\s*\$/i.test(text) || /draftkings/i.test(text)) return 'draftkings';
  if (/\bwager\s*\$/i.test(text) || /fanduel/i.test(text)) return 'fanduel';
  return null;
}

function detectMarket(text) {
  const lower = text.toLowerCase();
  for (const [label, key] of MARKET_LABELS) {
    if (lower.includes(label)) return key;
  }
  return null;
}

function detectEvent(text) {
  const m = text.match(EVENT_RE);
  if (!m) return null;
  const left = m[1].trim();
  const right = m[2].trim();
  // For DK "Lakers @ Warriors": away @ home. For FD: same convention typically.
  return { away: left, home: right };
}

function detectSelection(lines, oddsIdx, book) {
  if (oddsIdx == null) return null;
  if (book === 'draftkings') {
    // DK shape: selection is the line *above* the market label, which is above odds.
    // Conservative: take the first non-empty line before the odds line.
    for (let i = oddsIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (!t) continue;
      // Skip a line that itself is a market label.
      const lower = t.toLowerCase();
      if ([...MARKET_LABELS.keys()].some(k => lower === k)) continue;
      if (EVENT_RE.test(t)) continue;
      return t;
    }
    return null;
  }
  if (book === 'fanduel') {
    // FD shape: "<selection> <odds>" on a single line.
    const oddsLine = lines[oddsIdx];
    const stripped = oddsLine.replace(/[+-]\d{2,5}/, '').trim();
    if (stripped) return stripped;
    // Fallback: previous non-empty line.
    for (let i = oddsIdx - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t) return t;
    }
    return null;
  }
  // Unknown book heuristic: line above odds.
  for (let i = oddsIdx - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return null;
}

export const PARSE_PARLAY = { kind: 'parlay-rejected' };

export function parseBetSlip(text) {
  const rawText = String(text ?? '');
  const trimmed = rawText.trim();

  if (PARLAY_KEYWORDS.test(trimmed) && /[+-]\d{2,5}.*[+-]\d{2,5}/s.test(trimmed)) {
    return PARSE_PARLAY;
  }
  // Multi-leg detection: >1 American-odds tokens AND parlay-ish wording.
  const allOdds = trimmed.match(/[+-]\d{2,5}/g) ?? [];
  if (allOdds.length > 1 && PARLAY_KEYWORDS.test(trimmed)) {
    return PARSE_PARLAY;
  }

  if (!trimmed) {
    return { book: null, event: null, selection: null, market: null, odds: null, rawText };
  }

  const lines = trimmed.split(/\r?\n/);
  const book = detectBook(trimmed);
  const oddsHit = findOddsLine(lines);
  const odds = oddsHit?.odds ?? null;
  const market = detectMarket(trimmed);
  const event = detectEvent(trimmed);
  const selection = detectSelection(lines, oddsHit?.idx, book);

  return {
    book,
    event,
    selection,
    market,
    odds,
    rawText,
  };
}
