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
  assert.match(sw, /events\.json/);
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
