import test from 'node:test';
import assert from 'node:assert/strict';
import {
  foldPl, normalizeTitle, parseEventDate, dateKey, formatDateLabel, escapeHtml,
  starKey, starSetFromEvents, toggleStar, isStarred, loadJson, normalizeEvents,
  eventCategoryKey, matchesQuery, filterEvents, sortEvents, formatDistance,
} from '../js/logic.js';

const NOW = new Date(2026, 9, 21, 12, 0, 0); // 21 Oct 2026

test('foldPl strips Polish diacritics and lowercases', () => {
  assert.equal(foldPl('Łódź GÓRA'), 'lodz gora');
  assert.equal(foldPl('Wrocław'), 'wroclaw');
});

test('normalizeTitle removes punctuation and whitespace', () => {
  assert.equal(normalizeTitle('Rajd \'Trophy\' 4x4!'), 'rajdtrophy4x4');
  assert.equal(normalizeTitle(undefined), '');
});

test('parseEventDate reads Polish textual dates', () => {
  assert.equal(dateKey('24 października', NOW), '2026-10-24');
  assert.equal(dateKey('23-25 października', NOW), '2026-10-23');
});

test('parseEventDate reads numeric dates and ranges', () => {
  assert.equal(dateKey('23-10-2026', NOW), '2026-10-23');
  assert.equal(dateKey('23-10-2026 - 31-10-2026', NOW), '2026-10-23');
  assert.equal(dateKey('24.10.2026', NOW), '2026-10-24');
  assert.equal(dateKey('24/10/26', NOW), '2026-10-24');
});

test('parseEventDate rolls a far-past month name into next year', () => {
  const january = new Date(2026, 0, 5);
  assert.equal(dateKey('20 grudnia', january), '2026-12-20');
  assert.equal(dateKey('24 października', january), '2026-10-24');
});

test('parseEventDate returns null for unscheduled events', () => {
  assert.equal(parseEventDate('Wkrótce', NOW), null);
  assert.equal(parseEventDate('Najbliższy termin', NOW), null);
  assert.equal(parseEventDate('', NOW), null);
  assert.equal(parseEventDate(undefined, NOW), null);
});

test('formatDateLabel produces relative Polish labels', () => {
  assert.deepEqual(formatDateLabel('21-10-2026', NOW), { text: 'Dziś', days: 0, isSoon: true });
  assert.deepEqual(formatDateLabel('22-10-2026', NOW), { text: 'Jutro', days: 1, isSoon: true });
  assert.deepEqual(formatDateLabel('25-10-2026', NOW), { text: 'Za 4 dni', days: 4, isSoon: false });
  assert.deepEqual(formatDateLabel('18-10-2026', NOW), { text: '3 dni temu', days: -3, isSoon: false });
  assert.deepEqual(formatDateLabel('Wkrótce', NOW), { text: 'Wkrótce', days: null, isSoon: false });
});

test('escapeHtml neutralises markup from scraped text', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(escapeHtml("Rajd 'Zmota' & 4x4"), 'Rajd &#39;Zmota&#39; &amp; 4x4');
});

const ev = (title, date, extra = {}) => ({ title, date, ...extra });

test('starKey is stable per title+date', () => {
  assert.equal(starKey(ev('Rajd Zmota', '23-10-2026')), 'rajdzmota|23-10-2026');
});

test('starSetFromEvents seeds once and then stays empty', () => {
  const seed = starSetFromEvents([ev('A', '1-01-2027', { starred: true }), ev('B', '2-01-2027')], false);
  assert.equal(seed.size, 1);
  assert.equal(starSetFromEvents([ev('A', '1-01-2027', { starred: true })], true).size, 0);
});

test('toggleStar is immutable', () => {
  const first = toggleStar(new Set(), 'a|b');
  const second = toggleStar(first, 'a|b');
  assert.equal(first.has('a|b'), true);
  assert.equal(second.has('a|b'), false);
});

test('isStarred honours the persisted set only', () => {
  assert.equal(isStarred(ev('A', 'x', { starred: true }), new Set()), false);
  assert.equal(isStarred(ev('A', 'x'), new Set(['a|x'])), true);
});

test('loadJson survives corrupt localStorage', () => {
  assert.deepEqual(loadJson('{oops', []), []);
  assert.deepEqual(loadJson(null, []), []);
  assert.deepEqual(loadJson('["k"]', []), ['k']);
});

test('normalizeEvents dedupes the same event from two sources', () => {
  const out = normalizeEvents([
    ev('Rajd Zmota Challenge', '23-10-2026', { fullDescription: 'short', source: 'https://a' }),
    ev('Zmota Challenge', '23-10-2026', { fullDescription: 'a much longer description', source: 'https://b' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].fullDescription, 'a much longer description');
});

test('normalizeEvents keeps distinct installments', () => {
  const out = normalizeEvents([
    ev('Lubuski Armagedon 2', '24-10-2026'),
    ev('Lubuski Armagedon 3', '24-10-2026'),
  ]);
  assert.equal(out.length, 2);
});

test('normalizeEvents migrates legacy unknown locations', () => {
  const [migrated] = normalizeEvents([ev('X', '1-11-2026', { location: 'Nieznana', distanceKm: 0 })]);
  assert.equal(migrated.locationType, 'unknown');
  assert.equal(migrated.distanceKm, null);
});

// Review Focus #4
test('loadJson falls back for a corrupt star set', () => {
  assert.deepEqual(loadJson('{oops', []), []);
});

test('eventCategoryKey maps subcategories to accent keys', () => {
  assert.equal(eventCategoryKey({ subCategory: 'Rajd Przeprawowy / Trophy' }), 'rajd');
  assert.equal(eventCategoryKey({ subCategory: 'Wyprawa Turystyczna / 4x4' }), 'wyprawa');
  assert.equal(eventCategoryKey({ subCategory: 'Szkolenie / Trening' }), 'szkolenie');
  assert.equal(eventCategoryKey({ subCategory: 'Tor / Wyścig / Time Attack' }), 'tor');
  assert.equal(eventCategoryKey({ subCategory: 'Zlot / Spot / Spotkanie' }), 'zlot');
  assert.equal(eventCategoryKey({}), 'zlot');
});

// Review Focus #5
test('matchesQuery is diacritic-insensitive across fields', () => {
  const e = ev('Wyprawa w Bieszczady', '1-11-2026', { location: 'Łódź', fullDescription: 'weekend 4x4' });
  assert.equal(matchesQuery(e, 'lodz'), true);
  assert.equal(matchesQuery(e, 'WROC'), false);
  assert.equal(matchesQuery(e, 'bieszcz'), true);
  assert.equal(matchesQuery(e, ''), true);
  assert.equal(matchesQuery(e, '   '), true);
});

// Review Focus #2
test('filterEvents never hides unknown-location events', () => {
  const events = [
    ev('Blisko', '1-11-2026', { distanceKm: 20, locationType: 'exact' }),
    ev('Daleko', '1-11-2026', { distanceKm: 400, locationType: 'exact' }),
    ev('Nieznana', '1-11-2026', { distanceKm: null, locationType: 'unknown' }),
  ];
  const out = filterEvents(events, { maxDist: 50 });
  assert.deepEqual(out.map(e => e.title), ['Blisko', 'Nieznana']);
});

test('filterEvents combines query, category and starred', () => {
  const events = [
    ev('Rajd A', '1-11-2026', { subCategory: 'Rajd Przeprawowy / Trophy', distanceKm: 10 }),
    ev('Zlot B', '2-11-2026', { subCategory: 'Zlot / Spot / Spotkanie', distanceKm: 10 }),
  ];
  const starred = new Set([starKey(events[1])]);
  assert.deepEqual(filterEvents(events, { category: 'rajd' }).map(e => e.title), ['Rajd A']);
  assert.deepEqual(filterEvents(events, { starredOnly: true, starredKeys: starred }).map(e => e.title), ['Zlot B']);
  assert.deepEqual(filterEvents(events, { query: 'zlot' }).map(e => e.title), ['Zlot B']);
});

// Review Focus #3
test('sortEvents orders by date, undated last, distance then title', () => {
  const now = NOW;
  const events = [
    ev('Późny', '30-10-2026', { distanceKm: 10 }),
    ev('Bez daty', 'Wkrótce', { distanceKm: 10 }),
    ev('Wcześniejszy', '22-10-2026', { distanceKm: 300 }),
    ev('Ten sam dzień daleko', '22-10-2026', { distanceKm: 20 }),
  ];
  const out = sortEvents(events, now);
  assert.deepEqual(out.map(e => e.title), [
    'Ten sam dzień daleko', 'Wcześniejszy', 'Późny', 'Bez daty',
  ]);
  assert.equal(events[0].title, 'Późny', 'sortEvents must not mutate its input');
});

test('formatDistance distinguishes exact, approximate and unknown', () => {
  assert.equal(formatDistance({ distanceKm: 42, locationType: 'exact' }), '42 km');
  assert.equal(formatDistance({ distanceKm: 120, locationType: 'approximate' }), '~120 km');
  assert.equal(formatDistance({ distanceKm: null, locationType: 'unknown' }), 'Lokalizacja nieznana');
});
