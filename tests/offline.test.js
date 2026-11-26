import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, buildOffline } from '../scripts/build-offline.js';
import { shouldWarm, describe } from '../js/modules/offline.js';
import { tileX, tileY, tilesForBox, boxAround, planCityTiles, tileUrl, MAX_SAVED_TILES, TILE_URL } from '../js/modules/tiles.js';
import { enabledCities } from '../js/modules/journey.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const readJson = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const exists = (file) => access(path.join(root, file)).then(() => true, () => false);

test('classify splits the app, the small photos and the background photos, and skips 1600 px photos and catalogs', () => {
  const result = classify([
    'index.html', 'js/main.js', 'data/cities/kyoto/image-catalog.json', 'data/global/dish-catalog.json', 'data/global/dishes.json',
    'assets/images/fushimi-1-480.webp', 'assets/images/fushimi-1-960.webp', 'assets/images/fushimi-1-1600.webp', 'assets/images/dishes/ramen-480.webp'
  ]);
  assert.deepEqual(result.required, ['data/global/dishes.json', 'index.html', 'js/main.js']);
  assert.deepEqual(result.optional, ['assets/images/dishes/ramen-480.webp', 'assets/images/fushimi-1-480.webp']);
  assert.deepEqual(result.warm, ['assets/images/fushimi-1-960.webp']);
});

test('the committed offline manifest lists the whole app and every listed file exists', async () => {
  const manifest = await readJson('offline-manifest.json');
  assert.match(manifest.version, /^[0-9a-f]{10}$/);
  for (const needed of ['index.html', 'js/main.js', 'assets/styles.css', 'assets/vendor/leaflet/leaflet.js', 'assets/vendor/leaflet/leaflet.css',
    'data/journey.json', 'data/version.json', 'data/global/phrases.json', 'data/global/dishes.json', 'manifest.webmanifest']) {
    assert.ok(manifest.required.includes(needed), `${needed} must be cached for offline use`);
  }
  for (const file of [...manifest.required, ...manifest.optional, ...manifest.warm]) assert.ok(await exists(file), `${file} is listed but missing`);
  assert.ok([...manifest.optional, ...manifest.warm].every((file) => !file.endsWith('-1600.webp')), '1600 px photos are not stored in advance');
});

test('every JavaScript module and every enabled city dataset is in the offline manifest', async () => {
  const manifest = await readJson('offline-manifest.json');
  const journey = await readJson('data/journey.json');
  for (const { id } of enabledCities(journey)) {
    for (const dataset of ['city', 'places', 'restaurants', 'details', 'itinerary']) {
      assert.ok(manifest.required.includes(`data/cities/${id}/${dataset}.json`), `${id}/${dataset} missing`);
    }
  }
  const { readdir } = await import('node:fs/promises');
  for (const file of await readdir(path.join(root, 'js/modules'))) assert.ok(manifest.required.includes(`js/modules/${file}`), `${file} missing`);
});

test('the service worker version matches the manifest, so a content change always ships a new worker', async () => {
  const manifest = await readJson('offline-manifest.json');
  const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
  assert.match(worker, new RegExp(`const VERSION = '${manifest.version}';`));
});

test('buildOffline gives a different version when any cached file changes and stamps sw.js', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'offline-'));
  for (const sub of ['assets', 'js', 'data']) await mkdir(path.join(dir, sub), { recursive: true });
  await writeFile(path.join(dir, 'index.html'), '<html></html>');
  await writeFile(path.join(dir, 'js/main.js'), 'a');
  await writeFile(path.join(dir, 'sw.js'), "const VERSION = 'dev';\n");
  const first = await buildOffline(dir);
  assert.equal((await readFile(path.join(dir, 'sw.js'), 'utf8')).trim(), `const VERSION = '${first.version}';`);
  assert.equal((await buildOffline(dir)).version, first.version, 'same content, same version');
  await writeFile(path.join(dir, 'js/main.js'), 'b');
  assert.notEqual((await buildOffline(dir)).version, first.version);
});

test('the web app manifest is installable: name, display, start url and real icons', async () => {
  const manifest = await readJson('manifest.webmanifest');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url);
  const sizes = manifest.icons.map(({ sizes }) => sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some(({ purpose }) => purpose === 'maskable'));
  for (const { src } of manifest.icons) assert.ok(await exists(src), src);
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('the page no longer depends on a CDN for Leaflet', async () => {
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /unpkg\.com|cdn\./);
  assert.match(html, /assets\/vendor\/leaflet\/leaflet\.js/);
});

test('tile maths and the small, capped tile plan', () => {
  assert.equal(tileX(0, 1), 1);
  assert.equal(tileX(-180, 3), 0);
  assert.equal(tileY(0, 1), 1);
  assert.ok(tileX(135.7681, 13) > 7000 && tileX(135.7681, 13) < 7300);
  assert.equal(tileUrl(14, 3, 4), TILE_URL.replace('{z}', 14).replace('{x}', 3).replace('{y}', 4));
  assert.ok(tilesForBox(boxAround([35.0116, 135.7681], 1), 15).length >= 4);
  const kyoto = { center: [35.0116, 135.7681], points: [{ lat: 35.0, lng: 135.67 }, { lat: 35.04, lng: 135.80 }, { lat: 34.96, lng: 135.77 }] };
  const plan = planCityTiles(kyoto);
  assert.ok(plan.length > 10 && plan.length <= MAX_SAVED_TILES, `${plan.length} tiles`);
  assert.deepEqual([...new Set(plan.map(({ z }) => z))].sort(), [13, 14, 15]);
  assert.equal(new Set(plan.map(({ z, x, y }) => `${z}/${x}/${y}`)).size, plan.length, 'no duplicates');
  const huge = planCityTiles({ center: [35, 135.7], points: [{ lat: 30, lng: 130 }, { lat: 40, lng: 141 }] });
  assert.equal(huge.length, MAX_SAVED_TILES, 'a huge area is capped, never a bulk download');
});

test('background download is polite: not on data saver or slow links', () => {
  assert.equal(shouldWarm({}), true);
  assert.equal(shouldWarm({ connection: { effectiveType: '4g' } }), true);
  assert.equal(shouldWarm({ connection: { effectiveType: '4g', saveData: true } }), false);
  assert.equal(shouldWarm({ connection: { effectiveType: '3g' } }), false);
  assert.equal(shouldWarm({ connection: { effectiveType: 'slow-2g' } }), false);
});

test('offline status texts', () => {
  assert.match(describe({ kind: 'saving', done: 3, total: 10 }), /3\/10/);
  assert.match(describe({ kind: 'ready' }), /disponible sin conexión/i);
  assert.match(describe({ kind: 'offline' }), /Sin conexión/);
  assert.equal(describe({ kind: 'none' }), '');
});
