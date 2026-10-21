import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderEventCard } from '../js/app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const IDS = ['appHeader','statCount','btnSettings','Input','filterChips','eventsList',
  'emptyState','fabAdd','sheetSettings','sheetAdd','toastHost','distSlider','distValue',
  'groqKeyInput','aiBtn','notifStatus','notifToggleBtn','notifTestBtn','installBtn','addForm','addInput'];

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

// Review Focus #1
test('renderEventCard escapes scraped text', () => {
  const htmlOut = renderEventCard({
    title: `<img src=x onerror="alert(1)">Rajd`,
    date: '23-10-2026', location: 'Łódź', locationType: 'exact',
    distanceKm: 5, subCategory: 'Rajd Przeprawowy / Trophy',
    fullDescription: `"quoted" & <b>bold</b>`, source: 'https://example.com/?a=1&b=2',
  }, { starred: false, open: false });
  assert.equal(htmlOut.includes('<img'), false);
  assert.match(htmlOut, /&lt;img/);
  assert.match(htmlOut, /&quot;quoted&quot;/);
  assert.match(htmlOut, /data-cat="rajd"/);
  assert.match(htmlOut, /aria-pressed="false"/);
  assert.match(htmlOut, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(htmlOut, /rel="noopener noreferrer"/);
});
