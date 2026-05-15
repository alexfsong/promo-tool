import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeFeedUrl } from '../src/api/providers/vpsFeed.js';

// T007 — happy path: full URL with userinfo and trailing slash.
test('normalizeFeedUrl: extracts userinfo + strips trailing slash + emits Authorization header', () => {
  const r = normalizeFeedUrl('https://u:p@host.example.com/path/');
  assert.equal(r.baseUrl, 'https://host.example.com/path');
  assert.equal(r.authHeader, 'Basic ' + btoa('u:p'));
});

// T008 — auto-prefix https://; reject http://.
test('normalizeFeedUrl: auto-prefixes https when no protocol present', () => {
  const r = normalizeFeedUrl('host.example.com/feed');
  assert.equal(r.baseUrl, 'https://host.example.com/feed');
  assert.equal(r.authHeader, null);
});

test('normalizeFeedUrl: rejects http:// with a thrown error', () => {
  assert.throws(
    () => normalizeFeedUrl('http://host.example.com/feed'),
    /must start with https:\/\//,
  );
});

// T009 — percent-decoded userinfo before base64.
test('normalizeFeedUrl: percent-decodes userinfo before base64-encoding', () => {
  // password p@ss → percent-encoded as p%40ss in the URL
  const r = normalizeFeedUrl('https://alice:p%40ss@host.example.com/');
  assert.equal(r.authHeader, 'Basic ' + btoa('alice:p@ss'));
});

test('normalizeFeedUrl: percent-decodes a username with reserved char too', () => {
  const r = normalizeFeedUrl('https://us%3Aer:pw@host.example.com/');
  // username "us:er" + password "pw" → base64 of "us:er:pw"
  assert.equal(r.authHeader, 'Basic ' + btoa('us:er:pw'));
});

// T010 — trim whitespace + strip trailing slashes.
test('normalizeFeedUrl: trims surrounding whitespace and strips multiple trailing slashes', () => {
  const r = normalizeFeedUrl('  https://host.example.com/feed///  ');
  assert.equal(r.baseUrl, 'https://host.example.com/feed');
});

// T011 — no userinfo → null authHeader.
test('normalizeFeedUrl: returns authHeader: null when no userinfo is present', () => {
  const r = normalizeFeedUrl('https://host.example.com/feed');
  assert.equal(r.baseUrl, 'https://host.example.com/feed');
  assert.equal(r.authHeader, null);
});

// T012 — empty / whitespace input throws; http:// throws.
test('normalizeFeedUrl: throws on empty input', () => {
  assert.throws(() => normalizeFeedUrl(''), /No feed URL set/);
  assert.throws(() => normalizeFeedUrl('   '), /No feed URL set/);
  assert.throws(() => normalizeFeedUrl(null), /No feed URL set/);
  assert.throws(() => normalizeFeedUrl(undefined), /No feed URL set/);
});

test('normalizeFeedUrl: idempotent on already-normalized input', () => {
  const r1 = normalizeFeedUrl('https://host.example.com/feed');
  const r2 = normalizeFeedUrl(r1.baseUrl);
  assert.equal(r1.baseUrl, r2.baseUrl);
});

// T036 parity — both providers expose distinct credential copy so the
// provider.js comment-toggle automatically swaps the Settings UI strings
// without any popup.html / popup.js edit (FR-006).
test('US5 parity: vpsFeed credential copy is feed-URL flavored', async () => {
  const vps = await import('../src/api/providers/vpsFeed.js');
  assert.equal(vps.credentialLabel, 'Feed URL');
  assert.ok(/promo-tool\..*sslip\.io/i.test(vps.credentialPlaceholder), 'placeholder names the feed host');
  assert.ok(!/the-odds-api/i.test(vps.credentialHint), 'hint must not mention the-odds-api.com');
});

test('US5 parity: theOddsApi credential copy is API-key flavored', async () => {
  const oa = await import('../src/api/providers/theOddsApi.js');
  assert.equal(oa.credentialLabel, 'The Odds API key');
  assert.ok(/api key/i.test(oa.credentialPlaceholder) || /paste/i.test(oa.credentialPlaceholder));
  assert.ok(/the-odds-api/i.test(oa.credentialHint), 'hint should reference the-odds-api.com');
});

test('US5 parity: active provider.js re-exports the credential copy verbatim', async () => {
  const provider = await import('../src/api/provider.js');
  const vps = await import('../src/api/providers/vpsFeed.js');
  // provider.js currently points at vpsFeed; if/when comment-toggled to
  // theOddsApi, this test should be flipped to compare against that module.
  assert.equal(provider.credentialLabel, vps.credentialLabel);
  assert.equal(provider.credentialPlaceholder, vps.credentialPlaceholder);
  assert.equal(provider.credentialHint, vps.credentialHint);
});
