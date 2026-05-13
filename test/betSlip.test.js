import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseBetSlip, PARSE_PARLAY } from '../src/parsers/betSlip.js';

test('parses a DraftKings single straight bet', () => {
  const slip = `Lakers
Moneyline
Lakers @ Warriors
+400
Stake $50`;
  const r = parseBetSlip(slip);
  assert.equal(r.book, 'draftkings');
  assert.equal(r.odds, 400);
  assert.equal(r.market, 'h2h');
  assert.equal(r.event.away, 'Lakers');
  assert.equal(r.event.home, 'Warriors');
  assert.equal(r.selection, 'Lakers');
  assert.ok(r.rawText.includes('Stake $50'));
});

test('parses a FanDuel single straight bet', () => {
  const slip = `Lakers +400
Moneyline
Lakers @ Warriors
Wager $25`;
  const r = parseBetSlip(slip);
  assert.equal(r.book, 'fanduel');
  assert.equal(r.odds, 400);
  assert.equal(r.market, 'h2h');
  assert.equal(r.event.away, 'Lakers');
  assert.equal(r.event.home, 'Warriors');
  assert.ok(/Lakers/.test(r.selection));
});

test('partial parse: odds + selection but no event line — event is null, other fields preserved', () => {
  const slip = `Lakers
+400`;
  const r = parseBetSlip(slip);
  assert.equal(r.odds, 400);
  assert.equal(r.event, null);
  assert.equal(r.selection, 'Lakers');
  assert.ok(r.rawText.includes('Lakers'));
});

test('full failure on gibberish: all detection fields null, rawText preserved', () => {
  const slip = 'asdf qwerty zxcv';
  const r = parseBetSlip(slip);
  assert.equal(r.book, null);
  assert.equal(r.event, null);
  assert.equal(r.odds, null);
  assert.equal(r.market, null);
  assert.equal(r.selection, null);
  assert.equal(r.rawText, slip);
});

test('rejects a multi-leg parlay slip', () => {
  const slip = `2-Leg Parlay
Lakers +400
Warriors -110
Stake $25`;
  const r = parseBetSlip(slip);
  assert.equal(r, PARSE_PARLAY);
});

test('rejects an SGP', () => {
  const slip = `SGP
Lakers +400
Davis Over 25.5 +200
Stake $25`;
  const r = parseBetSlip(slip);
  assert.equal(r, PARSE_PARLAY);
});

test('preserves rawText even when empty input', () => {
  const r = parseBetSlip('');
  assert.equal(r.book, null);
  assert.equal(r.odds, null);
  assert.equal(r.rawText, '');
});
