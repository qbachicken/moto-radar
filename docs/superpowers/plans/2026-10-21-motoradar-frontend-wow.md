# MotoRadar Frontend "WOW" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild MotoRadar's single-file frontend into a glassy, neon-accented, mobile-first PWA dashboard with instant search, tactile cards, star persistence and toast feedback — without adding a framework or a build step.

**Architecture:** Split the current 739-line `index.html` into a markup shell (`index.html`), a design-system stylesheet (`styles.css`), a pure logic module (`js/logic.js`) and a DOM module (`js/app.js`), all native ES modules. Pure functions carry the risky behaviour (date parsing, dedupe, filtering, sorting, escaping) and are covered by `node --test`; markup and assets get static contract tests; visuals are verified with headless Edge screenshots.

**Tech Stack:** Vanilla HTML/CSS/ES2022 modules, Node 24 built-in test runner (`node --test`), Pillow for icon generation, Python unittest suite for the unchanged fetcher.

**Spec:** `docs/superpowers/specs/2026-10-21-motoradar-frontend-wow-design.md`

**Path convention:** every path below is relative to the repo root `E:\CloudCLI\moto-radar`; all shell commands assume that directory as cwd.

## Global Constraints

- No new runtime dependencies; no bundler, no framework, no build step.
- `fetcher.py`, `events.json` schema, and `test_moto_radar.py` are unchanged; `python -m pytest test_moto_radar.py -q` must stay green (7 tests).
- All user-facing copy in Polish; keep existing wording where it still fits.
- localStorage keys stay namespaced `motoradar_*`; corrupt stored JSON must never throw.
- `distanceKm === null` or `locationType === "unknown"` events are always visible, regardless of the distance filter.
- Work on a local branch `feat/frontend-wow`; **never push** (user will review before publishing).
- Motion respects `@media (prefers-reduced-motion: reduce)`.

## Review Focus

Five inputs the spec implies but no happy-path test covers; each one has its test pinned in the task named.

1. **Event titles/descriptions containing `'`, `"`, `<`, `&`** (scraped from the open web) — must render as text, never as markup. `escapeHtml` test in Task 1, render path in Task 5.
2. **Events with unknown location (`distanceKm: null`)** — a low distance slider must not erase them; they show "Lokalizacja nieznana" and sort after dated/known events. `filterEvents` test in Task 3.
3. **Unparseable dates** (`"Wkrótce"`, `"Najbliższy termin"`, empty) — must not crash parsing or sorting; sort last, label as raw string. `sortEvents`/`formatDateLabel` tests in Task 3.
4. **Corrupt or legacy localStorage** (`motoradar_starred` = `"{oops"`, an old `motoradar_ai_optimized` blob) — must fall back to empty state silently. `loadStarSet` test in Task 2.
5. **Polish diacritics in search** (`lodz` must find `Łódź`, `wroclaw` must find `Wrocław`) — `matchesQuery` test in Task 3.

---

## File Structure

```
moto-radar/
  index.html            markup shell only (no inline CSS/JS)
  styles.css            design tokens + all component styles
  js/logic.js           pure functions: parse, normalize, dedupe, filter, sort, escape
  js/app.js             DOM wiring: state, render, sheets, toasts, PWA, Groq, notifications
  tests/logic.test.js   node:test suites for js/logic.js
  tests/markup.test.js  static contract for index.html + styles.css
  tests/assets.test.js  service-worker/manifest/icon consistency
  package.json          {"type":"module"} + "test": "node --test tests/"
  tools/make_icons.py   one-off PNG icon generator (Pillow)
  icons/                icon-192.png, icon-512.png, icon-maskable-512.png
  sw.js                 shell cache + network-first events.json
  manifest.json         PNG icons, shortcuts
```

---

### Task 1: ESM scaffold + pure date/text logic

**Files:**
- Create: `package.json`
- Create: `js/logic.js`
- Create: `tests/logic.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `foldPl(s: string): string`, `normalizeTitle(title: string): string`, `parseEventDate(dateStr: string, now?: Date): Date | null`, `dateKey(dateStr: string, now?: Date): string | null` (`"YYYY-MM-DD"`), `formatDateLabel(dateStr: string, now?: Date): { text: string, days: number | null, isSoon: boolean }`, `escapeHtml(value: string): string`.

- [ ] **Step 1: Create the branch and ESM manifest**

```bash
git checkout -b feat/frontend-wow
```

`package.json`:

```json
{
  "name": "motoradar",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/logic.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  foldPl, normalizeTitle, parseEventDate, dateKey, formatDateLabel, escapeHtml,
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/logic.js'`.

- [ ] **Step 4: Implement `js/logic.js`**

Export the seven functions above. Implementation notes:
- `MONTHS_PL` maps genitive month names to 0-based indexes; reuse the same regex shapes the old inline script used (`(\d{1,2})\s+(month)` and `(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})`).
- `parseEventDate` builds a local-midnight `Date`; after parsing, if the result is more than 30 days before `now`, add one year (so a December event seen in January lands next December).
- `formatDateLabel` compares calendar midnights (not 24h deltas) and never throws on `null` days.
- `foldPl` maps `ł/Ł` manually before `normalize('NFKD')` + strip combining marks, mirroring `fetcher.fold_pl`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json js/logic.js tests/logic.test.js
git commit -m "feat(frontend): extract pure date/text logic into ESM module with tests"
```

---

### Task 2: Event normalization, dedupe and star persistence

**Files:**
- Modify: `js/logic.js`
- Modify: `tests/logic.test.js`

**Interfaces:**
- Consumes: `normalizeTitle`, `parseEventDate`, `dateKey` from Task 1.
- Produces:
  - `starKey(ev: Event): string` — `normalizeTitle(ev.title) + '|' + (ev.date || '').trim().toLowerCase()`
  - `starSetFromEvents(events: Event[], alreadySeeded: boolean): Set<string>`
  - `toggleStar(set: Set<string>, key: string): Set<string>` (returns a new Set)
  - `isStarred(ev: Event, set: Set<string>): boolean`
  - `loadJson(raw: string | null, fallback: T): T`
  - `normalizeEvents(rawEvents: Event[]): Event[]` — canonicalises `subCategory`, migrates legacy `distanceKm: 0 + location "Nieznana"` to `null`/`unknown`, derives `locationType`, dedupes by same date + equal/contained normalized title, keeping the longer description and any real source.

- [ ] **Step 1: Write the failing tests**

Append to `tests/logic.test.js`:

```js
import {
  starKey, starSetFromEvents, toggleStar, isStarred, loadJson, normalizeEvents,
} from '../js/logic.js';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — missing exports.

- [ ] **Step 3: Implement the exports in `js/logic.js`**

`normalizeEvents` mirrors the old inline dedupe loop but stays pure (no localStorage, no DOM). Installment guard: if both titles match `/(\d{1,2}|i{1,3}|iv|v)\s*(tura|runda|edycja|etap)/` after `foldPl` and the captured numbers differ, keep both.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat(frontend): dedupe, star persistence and safe storage helpers"
```

---

### Task 3: Search, filtering and ordering

**Files:**
- Modify: `js/logic.js`
- Modify: `tests/logic.test.js`

**Interfaces:**
- Consumes: `foldPl`, `parseEventDate`, `starKey`, `formatDateLabel`.
- Produces:
  - `eventCategoryKey(ev): 'rajd' | 'wyprawa' | 'szkolenie' | 'tor' | 'zlot'`
  - `matchesQuery(ev: Event, query: string): boolean`
  - `filterEvents(events, opts: { query?, category?, starredOnly?, maxDist?, starredKeys? }): Event[]`
  - `sortEvents(events: Event[]): Event[]` (returns a new array)
  - `formatDistance(ev): string` (`"42 km"`, `"~120 km"` for `approximate`, `"Lokalizacja nieznana"` for unknown)
  - `CATEGORY_LABELS: Record<string, string>` used by the chips.

- [ ] **Step 1: Write the failing tests**

```js
import {
  eventCategoryKey, matchesQuery, filterEvents, sortEvents, formatDistance,
} from '../js/logic.js';

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
```

- [ ] **Step 2: Run to verify failure** — `npm test`; expected FAIL on missing exports.

- [ ] **Step 3: Implement**

`sortEvents(events, now)` computes `days` once per event via `formatDateLabel`, sorts `null` days last, then `(distanceKm ?? Infinity)`, then `localeCompare(b.title, 'pl')`. `filterEvents` applies distance first (skipping `null`), then category, then starred set, then query.

- [ ] **Step 4: Run tests** — `npm test`; expected PASS, 21 tests.

- [ ] **Step 5: Commit**

```bash
git add js/logic.js tests/logic.test.js
git commit -m "feat(frontend): search, filtering and date-ordered sorting logic"
```

---

### Task 4: Markup shell and the WOW design system

**Files:**
- Rewrite: `index.html`
- Create: `styles.css`
- Create: `tests/markup.test.js`

**Interfaces:**
- Produces (ids/classes `js/app.js` will bind to, each appearing exactly once):
  `#appHeader`, `#statCount`, `#btnSettings`, `#Input`, `#filterChips`, `#eventsList`, `#emptyState`, `#fabAdd`, `#sheetSettings`, `#sheetAdd`, `#toastHost`, `#distSlider`, `#distValue`, `#groqKeyInput`, `#aiBtn`, `#installBtn`, `#addForm`, `#addInput`.
  Chip buttons carry `data-category` in `all | starred | rajd | wyprawa | szkolenie | tor | zlot`.
  Root element carries `data-theme="dark"`; sheets use `hidden` + `role="dialog" aria-modal="true"`.

- [ ] **Step 1: Write the failing contract test**

`tests/markup.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const IDS = ['appHeader','statCount','btnSettings','Input','filterChips','eventsList',
  'emptyState','fabAdd','sheetSettings','sheetAdd','toastHost','distSlider','distValue',
  'groqKeyInput','aiBtn','installBtn','addForm','addInput'];

test('every required id appears exactly once', () => {
  for (const id of IDS) {
    const hits = html.match(new RegExp(`id="${id}"`, 'g')) || [];
    assert.equal(hits.length, 1, `id ${id} found ${hits.length} times`);
  }
});

test('markup has no inline handlers, styles or scripts', () => {
  assert.equal(/\son[a-z]+=/i.test(html), false, 'inline on* handler found');
  assert.equal(/<style/i.test(html), false, 'inline <style> found');
  assert.equal(/<script(?![^>]*type="module")/i.test(html), false, 'non-module script found');
});

test('markup links the stylesheet and a single module entrypoint', () => {
  assert.match(html, /<link rel="stylesheet" href="styles\.css"/);
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.match(html, /<script type="module" src="js\/app\.js"><\/script>/);
  assert.match(html, /lang="pl"/);
});

test('filter chips cover every category', () => {
  for (const cat of ['all','starred','rajd','wyprawa','szkolenie','tor','zlot']) {
    assert.match(html, new RegExp(`data-category="${cat}"`));
  }
});

test('stylesheet defines the design tokens and motion guard', () => {
  for (const token of ['--crimson','--cyan','--amber','--emerald','--violet','--surface','--hairline']) {
    assert.match(css, new RegExp(token.replace('-', '\\-')));
  }
  assert.match(css, /backdrop-filter:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`; expected FAIL (`styles.css` missing, ids absent).

- [ ] **Step 3: Write `styles.css`**

Implement the spec's tokens and these components: page aurora (two fixed radial gradients, `pointer-events:none`), `header` (sticky, `backdrop-filter: blur(18px)`, hairline), `.count-pill`, `.`, `.chips` + `.chip[aria-pressed="true"]` glow, `.event-card` (glass, 20px radius, `--accent` var set from `data-cat`, 3px leading accent bar via `::before`, hover lift), `.event-card.is-open` details reveal with `grid-template-rows: 0fr → 1fr`, `.badge`, `.star-btn[aria-pressed="true"]` amber glow, `.date-chip.is-soon` pulsing dot (`@keyframes pulse`), `.skeleton` shimmer, `.fab` (fixed bottom-right, above safe-area), `.sheet` + `.sheet[hidden]`, `.toast-host`/`.toast`, `.empty-state`, `@media (prefers-reduced-motion: reduce)` killing transforms/animations. Use the exact token values from spec §6.

- [ ] **Step 4: Write `index.html`**

Structure: `<header id="appHeader">` with gradient `Moto<span>Radar</span>`, `#statCount` pill, `#btnSettings` icon button; `<main>` with `#Input` (type ``, `aria-label="Szukaj wydarzenia"`), `#filterChips` (7 chips, first `aria-pressed="true"`), `#eventsList` (`aria-live="polite"`) pre-filled with three `.skeleton` cards, `#emptyState` hidden; `#fabAdd` button; two `<section class="sheet" id="sheetSettings" hidden role="dialog" aria-modal="true" aria-labelledby="settingsTitle">` / `#sheetAdd` with a `<form id="addForm">` + `#addInput` textarea; `#toastHost` (`aria-live="assertive"`); `<link rel="manifest">`, theme-color `#05070d`, module script. Keep all Polish copy from the old file (`Ustawienia`, `Dodaj wydarzenie`, `Zainstaluj aplikację`, install instructions) where it still applies.

- [ ] **Step 5: Run tests** — `npm test`; expected PASS, 26 tests.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css tests/markup.test.js
git commit -m "feat(frontend): glassy dark dashboard markup and design system"
```

---

### Task 5: Application wiring

**Files:**
- Create: `js/app.js`
- Modify: `tests/markup.test.js` (render-path assertion)

**Interfaces:**
- Consumes: everything from Tasks 1–3 plus the ids from Task 4.
- Produces: `renderEventCard(ev, { starred, open }) : string` (exported for testability), and a module that self-initialises on import. localStorage keys: `motoradar_settings`, `motoradar_groq_key`, `motoradar_custom`, `motoradar_starred`, `motoradar_starred_seeded`, `motoradar_notified_<date>`, `motoradar_open`.

- [ ] **Step 1: Write the failing render test**

Append to `tests/markup.test.js`:

```js
import { renderEventCard } from '../js/app.js';

// Review Focus #1
test('renderEventCard escapes scraped text', () => {
  const html = renderEventCard({
    title: `<img src=x onerror="alert(1)">Rajd`,
    date: '23-10-2026', location: 'Łódź', locationType: 'exact',
    distanceKm: 5, subCategory: 'Rajd Przeprawowy / Trophy',
    fullDescription: `"quoted" & <b>bold</b>`, source: 'https://example.com/?a=1&b=2',
  }, { starred: false, open: false });
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;img/);
  assert.match(html, /&amp;quot;quoted&amp;quot;/);
  assert.match(html, /data-cat="rajd"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
```

Note: `js/app.js` must guard its DOM bootstrap behind `if (typeof document !== 'undefined')` so importing it under Node does not touch the DOM.

- [ ] **Step 2: Run to verify failure** — `npm test`; expected FAIL (missing module).

- [ ] **Step 3: Implement `js/app.js`**

Responsibilities, in order:
1. `state = { events: [], starred: loadJson(localStorage.getItem('motoradar_starred'), []), settings, query: '', category: 'all', openKeys: new Set() }`.
2. `loadEvents()`: fetch `events.json?_=` timestamp, `normalizeEvents([...custom, ...data])`, seed stars once via `starSetFromEvents`, drop the legacy `motoradar_ai_optimized` key, render, then `checkEventNotifications()` (moved verbatim from the old script, still once per event per day).
3. `render()`: `filterEvents` → `sortEvents` → `renderEventCard` join; update `#statCount` (`N wydarzeń`), toggle `#emptyState`, hide skeletons.
4. Event delegation on `#eventsList`: click/Enter/Space toggles `is-open` + `aria-expanded`; star button calls `toggleStar`, persists `motoradar_starred`, plays the WebAudio blip and `navigator.vibrate?.(10)`, re-renders only that card's star state; source anchor is left alone.
5. Search input: debounce 120 ms via `setTimeout`, then `render()`.
6. Chips: click sets `aria-pressed` across the group and `state.category`.
7. Sheets: `openSheet(id)`/`closeSheet()` with Escape, backdrop click, focus restore; `#distSlider` updates `#distValue` live and persists on `change`.
8. `#aiBtn`: keep the Groq call and prompt from the old file verbatim, but replace `alert()` with `toast()` and show a spinner state (`aria-busy`, label `⏳ Groq AI porządkuje...`).
9. `#addForm`: unchanged parsing rules, `toast('Dodano wydarzenie')` instead of `alert`.
10. PWA: `beforeinstallprompt` → show `#installBtn`; register `./sw.js` on load.

- [ ] **Step 4: Run tests** — `npm test`; expected PASS, 27 tests.

- [ ] **Step 5: Serve and sanity-check in a browser**

Run: `python -m http.server 8765` in the repo root, open `http://localhost:8765/`.
Expected: events render, search narrows the list, chips filter, star survives F5, settings sheet opens/closes with Escape.

- [ ] **Step 6: Commit**

```bash
git add js/app.js tests/markup.test.js
git commit -m "feat(frontend): wire dashboard interactions, star persistence and toasts"
```

---

### Task 6: PWA assets — icons, manifest and service worker

**Files:**
- Create: `tools/make_icons.py`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`
- Modify: `manifest.json`, `sw.js`
- Create: `tests/assets.test.js`

**Interfaces:**
- Produces: manifest `icons[]` with `192x192`, `512x512`, and a `maskable` 512 entry; `shortcuts` to `./?action=add`; `sw.js` `CACHE_NAME = 'motoradar-v2'` whose `ASSETS` list is read by the test.

- [ ] **Step 1: Write the failing asset test**

`tests/assets.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const sw = readFileSync(new URL('sw.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));

test('every precached asset exists on disk', () => {
  const list = [...sw.matchAll(/'(\.\/[^']*)'/g)].map(m => m[1]);
  assert.ok(list.length >= 8, 'precache list looks truncated');
  for (const rel of list) {
    const path = rel === './' ? new URL('index.html', root) : new URL(rel.slice(2), root);
    assert.equal(existsSync(path), true, `missing precached asset ${rel}`);
  }
});

test('service worker uses a versioned shell cache and network-first events', () => {
  assert.match(sw, /motoradar-v2/);
  assert.match(sw, /networkFirst|fetch\(e\.request\)[\s\S]*events\.json/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
});

test('manifest declares PNG icons at the right sizes', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#05070d');
  const sizes = manifest.icons.map(i => `${i.sizes}:${i.type}`);
  assert.ok(sizes.includes('192x192:image/png'));
  assert.ok(sizes.includes('512x512:image/png'));
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    assert.equal(existsSync(new URL(icon.src.replace(/^\.\//, ''), root)), true, `missing ${icon.src}`);
  }
});
```

- [ ] **Step 2: Run to verify failure** — `npm test`; expected FAIL (no icons, old manifest).

- [ ] **Step 3: Implement `tools/make_icons.py`**

Pillow, no text: rounded dark square (`#05070d`), three concentric radar arcs in `#22d3ee` at 40% alpha, one crimson (`#ff3b5c`) sweep wedge, amber blip dot. Generate 192, 512, and a maskable 512 with 20% safe padding. Run it: `python tools/make_icons.py` → writes the three PNGs.

- [ ] **Step 4: Update `manifest.json` and `sw.js`**

Manifest: `background_color`/`theme_color` `#05070d`, `start_url` `./`, PNG icons, `shortcuts: [{ name: "Dodaj wydarzenie", url: "./?action=add" }]`. SW: bump to `motoradar-v2`, precache the full shell (`./`, `./index.html`, `./styles.css`, `./js/logic.js`, `./js/app.js`, `./manifest.json`, `./icons/*.png`), cache-first for shell, network-first (falling back to cache) for `events.json`, keep `skipWaiting()` + `clients.claim()`.

- [ ] **Step 5: Run tests** — `npm test`; expected PASS, 30 tests.

- [ ] **Step 6: Commit**

```bash
git add tools/make_icons.py icons manifest.json sw.js tests/assets.test.js
git commit -m "feat(pwa): generated icons, manifest shortcuts and versioned shell cache"
```

---

### Task 7: Full verification, screenshots and change notes

**Files:**
- Create: `docs/CHANGELOG-frontend-wow.md`

**Interfaces:**
- Consumes: the whole app.
- Produces: a verified build and a written summary the user can read before publishing.

- [ ] **Step 1: Run both suites**

```bash
npm test
python -m pytest test_moto_radar.py -q
```
Expected: Node — 30 passing; pytest — 7 passing.

- [ ] **Step 2: Capture screenshots with headless Edge**

```bash
python -m http.server 8765 &
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=430,932 --screenshot=../tmp/motoradar-mobile.png http://localhost:8765/
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --window-size=1280,900 --screenshot=../tmp/motoradar-desktop.png http://localhost:8765/
```
Expected: both PNGs show the glass header, search field, chips, and lit event cards — no unstyled text. Read both images back to confirm.

- [ ] **Step 3: Walk the manual checklist in the served app**

- Search `lodz` finds Łódź events; clearing restores the full list.
- Distance slider at 20 km still shows `Lokalizacja nieznana` cards.
- Star a card, reload — still starred; starring sounds and vibrates on mobile.
- Expand a card with keyboard (`Tab`, `Enter`) — details reveal, `aria-expanded` flips.
- Settings sheet closes on Escape and on backdrop click; focus returns to the gear.
- DevTools → Application → Service Worker shows `motoradar-v2` activated; offline reload still renders cached events.
- With `prefers-reduced-motion: reduce` emulated, no card lift/pulse animations run.

- [ ] **Step 4: Write `docs/CHANGELOG-frontend-wow.md`**

Sections: What changed (visual system, cards, search, star persistence, feedback, PWA assets), What did not change (fetcher, data schema, Groq behaviour, notifications), How to verify (the three commands above), and Known limits (no map view, star state is per-device).

- [ ] **Step 5: Commit and stop**

```bash
git add docs/CHANGELOG-frontend-wow.md
git commit -m "docs: frontend WOW change notes and verification steps"
git log --oneline -8
```

Do **not** push and do **not** open a PR — the user reviews locally first.
