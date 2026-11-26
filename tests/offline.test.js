import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdtemp, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, buildOffline } from '../scripts/build-offline.js';
import { canAutoDownloadAll, describe, stateFromReport, chipView, facts, formatDate, formatMegabytes } from '../js/modules/offline.js';
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

test('the manifest records how many bytes each download step weighs', async () => {
  const manifest = await readJson('offline-manifest.json');
  const { stat } = await import('node:fs/promises');
  const sum = async (list) => (await Promise.all(list.map(async (file) => (await stat(path.join(root, file))).size))).reduce((a, b) => a + b, 0);
  assert.deepEqual(manifest.sizes, { required: await sum(manifest.required), optional: await sum(manifest.optional), warm: await sum(manifest.warm) });
  assert.ok(manifest.sizes.required < 2 * 1024 * 1024, 'the app itself stays small');
});

test('big photos are only downloaded by themselves on wifi or ethernet, never on data saver', () => {
  assert.equal(canAutoDownloadAll({}), false, 'unknown connection type (iPhone): ask first');
  assert.equal(canAutoDownloadAll({ connection: { type: 'wifi' } }), true);
  assert.equal(canAutoDownloadAll({ connection: { type: 'ethernet' } }), true);
  assert.equal(canAutoDownloadAll({ connection: { type: 'cellular' } }), false);
  assert.equal(canAutoDownloadAll({ connection: { type: 'wifi', saveData: true } }), false);
});

const report = (missing = {}, extra = {}) => ({
  type: 'offline-report', version: 'abc', installedAt: Date.UTC(2026, 10, 26, 13, 4),
  missing: { required: 0, optional: 0, warm: 0, ...missing }, totals: { required: 56, optional: 107, warm: 107 },
  sizes: { required: 800000, optional: 4000000, warm: 14000000 }, tiles: 12, ...extra
});

test('the saved copy is judged file by file: incomplete, essentials or ready', () => {
  assert.deepEqual(stateFromReport(report()), { kind: 'ready' });
  assert.deepEqual(stateFromReport(report({ warm: 40 })), { kind: 'essentials' });
  assert.deepEqual(stateFromReport(report({ required: 1 })), { kind: 'incomplete', missing: 1 });
  assert.deepEqual(stateFromReport(report({ optional: 3, warm: 107 })), { kind: 'incomplete', missing: 3 });
  assert.equal(stateFromReport(report({ required: 2, optional: 3 })).missing, 5);
});

test('the header chip says in plain words what is saved, with a short version for narrow phones', () => {
  const states = [{ kind: 'ready' }, { kind: 'essentials' }, { kind: 'saving', done: 5, total: 10 }, { kind: 'installing' }, { kind: 'incomplete', missing: 2 }, { kind: 'none' }];
  for (const state of states) {
    const view = chipView(state);
    assert.ok(view.label.length <= 34, `${state.kind}: label too long`);
    assert.ok(view.short.length <= 17, `${state.kind}: short label must fit a 320 px header`);
    assert.ok(view.tone && view.aria.length > 20);
    assert.doesNotMatch(`${view.label} ${view.short} ${view.aria}`, /básico/i, 'the confusing word "Básico" is gone');
  }
  assert.deepEqual([chipView({ kind: 'ready' }).label, chipView({ kind: 'ready' }).tone], ['Lista sin conexión', 'ok']);
  assert.deepEqual([chipView({ kind: 'essentials' }).label, chipView({ kind: 'essentials' }).tone], ['Sin conexión · fotos pendientes', 'partial']);
  assert.equal(chipView({ kind: 'saving', done: 5, total: 10 }).label, 'Guardando… 50%');
  assert.equal(chipView({ kind: 'saving', done: 5, total: 10 }).short, '50%');
  assert.equal(chipView({ kind: 'incomplete', missing: 1 }).label, 'Copia incompleta · tocar');
  assert.equal(chipView({ kind: 'incomplete', missing: 1 }).tone, 'error');
  assert.equal(chipView({ kind: 'none' }).label, 'Sin copia · descargar');
  assert.equal(chipView({ kind: 'ready' }).short, 'Sin conexión');
  assert.equal(chipView({ kind: 'essentials' }).short, 'Fotos pendientes');
  assert.equal(chipView({ kind: 'unsupported' }), null, 'no chip where nothing can be saved');
});

test('the popover offers the right actions for each state', () => {
  assert.equal(describe({ kind: 'essentials' }, report({ warm: 5 })).download, true);
  assert.match(describe({ kind: 'essentials' }, report({ warm: 5 })).summary, /^Guía guardada para usarla sin internet\. Faltan las fotos grandes \(≈ 13 MB\)\.$/);
  assert.equal(describe({ kind: 'incomplete', missing: 4 }).retry, true);
  assert.match(describe({ kind: 'incomplete', missing: 4 }).detail, /4 archivos/);
  assert.equal(describe({ kind: 'saving', done: 3, total: 9 }).summary, 'Descargando fotos grandes… 3/9');
  assert.equal(describe({ kind: 'ready' }).download, false);
});

test('the popover facts show the copy date, the space used and a real file count', () => {
  const rows = Object.fromEntries(facts({ kind: 'ready' }, report(), 'V11.5.0'));
  assert.match(rows['Copia guardada'], /^V11\.5\.0 · /);
  assert.equal(rows['Archivos'], '270 de 270');
  assert.equal(rows['Espacio usado'], '≈ 18 MB');
  assert.equal(rows['Mapa guardado'], '12 teselas');
  const partial = Object.fromEntries(facts({ kind: 'essentials' }, report({ warm: 107 }), 'V11.5.0'));
  assert.equal(partial['Archivos'], '163 de 270');
  assert.equal(partial['Espacio usado'], '≈ 5 MB');
  assert.deepEqual(facts({ kind: 'none' }, null), []);
  assert.equal(formatDate(null), '—');
  assert.match(formatDate(Date.UTC(2026, 10, 26, 13, 4)), /26/);
  assert.equal(formatMegabytes(1), '1 MB');
});
