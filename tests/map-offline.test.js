import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { planCityTiles, describeSaveState, estimateMegabytes, zoomRange, tileX, tileY, tileUrl, MAX_SAVED_TILES, TILE_CACHE_NAME } from '../js/modules/tiles.js';
import { initMapOffline, pauseScale } from '../js/modules/map-offline.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const load = async (city) => {
  const [info, places] = await Promise.all(['city', 'places'].map(async (name) => JSON.parse(await readFile(`${root}data/cities/${city}/${name}.json`, 'utf8'))));
  return { center: info.map.center, zoom: info.map.zoom, points: places };
};

test('the plan covers the zoom levels the map really opens at, for every city', async () => {
  for (const city of ['kyoto', 'osaka']) {
    const { center, points } = await load(city);
    const plan = planCityTiles({ center, points });
    const keys = new Set(plan.map(({ z, x, y }) => `${z}/${x}/${y}`));
    assert.ok(plan.length > 20 && plan.length <= MAX_SAVED_TILES, `${city}: ${plan.length} tiles`);
    assert.deepEqual(zoomRange(plan), [11, 15], `${city}: zoom levels`);
    // The tile under the city centre exists at every level (the default view of the map is made of these).
    for (const z of [11, 12, 13, 14, 15]) assert.ok(keys.has(`${z}/${tileX(center[1], z)}/${tileY(center[0], z)}`), `${city}: centre tile at zoom ${z}`);
    // And the tile of every visit at the overview levels.
    for (const point of points) for (const z of [11, 12, 13, 14]) assert.ok(keys.has(`${z}/${tileX(point.lng, z)}/${tileY(point.lat, z)}`), `${city}/${point.id} at zoom ${z}`);
    assert.deepEqual(plan.map(({ z }) => z), [...plan.map(({ z }) => z)].sort((a, b) => a - b), 'overview tiles come first, so a cap drops the detail');
  }
});

test('texts say what is saved, how big it is and what to do next', () => {
  const opts = { city: 'Osaka', range: [11, 15] };
  assert.match(describeSaveState({ kind: 'none', total: 100 }, opts).text, /Mapa sin guardar.*100 teselas \(≈ 2 MB\).*Osaka/);
  assert.equal(describeSaveState({ kind: 'none', total: 100 }, opts).button, '⬇ Guardar mapa (≈ 2 MB)');
  assert.equal(describeSaveState({ kind: 'saving', done: 5, total: 100 }, opts).text, 'Guardando el mapa… 5/100');
  assert.equal(describeSaveState({ kind: 'saving', done: 5, total: 100 }, opts).disabled, true);
  const done = describeSaveState({ kind: 'complete', total: 100 }, opts);
  assert.match(done.text, /^✓ Mapa guardado: 100 teselas \(zoom 11–15, ≈ 2 MB\)\. Se ve sin conexión alrededor de Osaka/);
  assert.equal(done.tone, 'ok');
  assert.match(describeSaveState({ kind: 'partial', saved: 40, total: 100 }, opts).text, /40 de 100 teselas.*Completar mapa/);
  const failed = describeSaveState({ kind: 'error', saved: 90, failed: 10, total: 100 }, opts);
  assert.match(failed.text, /No se pudieron guardar 10 de 100 teselas/);
  assert.equal(failed.button, '↻ Completar mapa');
  const offline = describeSaveState({ kind: 'none', total: 100 }, { ...opts, online: false });
  assert.match(offline.text, /Sin conexión: el mapa se podrá guardar/);
  assert.equal(offline.disabled, true);
  assert.equal(estimateMegabytes(1), 1);
});

// A fake browser for the saver: Cache API, fetch and a button/status/progress trio.
function harness({ failing = new Set(), online = true } = {}) {
  const store = new Map();
  const cache = { match: async (url) => store.get(url) ?? undefined, put: async (url, response) => { store.set(url, response); } };
  const fakeWindow = { navigator: { onLine: online }, _listeners: {}, addEventListener(type, fn) { this._listeners[type] = fn; }, fetch: null };
  const button = { hidden: false, disabled: false, textContent: '', dataset: {}, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  const status = { textContent: '' };
  const progress = { hidden: true, max: 1, value: 0 };
  const calls = [];
  const fetchFn = async (url) => { calls.push(url); return failing.has(url) ? { ok: false, status: 500 } : { ok: true, status: 200, body: url }; };
  const saver = initMapOffline({ button, status, progress, win: fakeWindow, cacheStorage: { open: async (name) => { assert.equal(name, TILE_CACHE_NAME); return cache; } }, fetchFn, pause: async () => {} });
  return { saver, store, button, status, progress, calls, fakeWindow };
}
const smallPlan = [{ z: 11, x: 1, y: 1 }, { z: 12, x: 2, y: 2 }, { z: 13, x: 3, y: 3 }, { z: 14, x: 4, y: 4 }];

test('saving the map stores every tile, reports progress and finishes with a clear result', async () => {
  const { saver, store, button, status, progress } = harness();
  await saver.setPlan(smallPlan, 'Kioto');
  assert.match(status.textContent, /Mapa sin guardar/);
  assert.equal(button.dataset.state, 'none');
  await button.listeners.click();
  assert.equal(store.size, 4);
  assert.equal(button.dataset.state, 'complete');
  assert.match(status.textContent, /✓ Mapa guardado: 4 teselas \(zoom 11–14/);
  assert.equal(progress.hidden, true);
});

test('a later visit recognises what is already saved (complete, or partial) without downloading again', async () => {
  const first = harness();
  await first.saver.setPlan(smallPlan, 'Kioto');
  await first.button.listeners.click();
  const again = harness();
  for (const [url, value] of first.store) again.store.set(url, value);
  await again.saver.setPlan(smallPlan, 'Kioto');
  assert.equal(again.button.dataset.state, 'complete');
  const half = harness();
  half.store.set(tileUrl(11, 1, 1), {});
  half.store.set(tileUrl(12, 2, 2), {});
  await half.saver.setPlan(smallPlan, 'Kioto');
  assert.equal(half.button.dataset.state, 'partial');
  assert.match(half.status.textContent, /2 de 4 teselas/);
  await half.button.listeners.click();
  assert.equal(half.calls.length, 2, 'only the missing tiles are requested');
  assert.equal(half.button.dataset.state, 'complete');
});

test('failed tiles are retried once, then reported honestly and can be completed later', async () => {
  const bad = tileUrl(13, 3, 3);
  const { saver, button, status, calls } = harness({ failing: new Set([bad]) });
  await saver.setPlan(smallPlan, 'Kioto');
  await button.listeners.click();
  assert.equal(calls.filter((url) => url === bad).length, 2, 'one retry');
  assert.equal(button.dataset.state, 'error');
  assert.match(status.textContent, /No se pudieron guardar 1 de 4 teselas.*Guardadas: 3/);
  assert.equal(button.textContent, '↻ Completar mapa');
});

test('offline, the button is disabled with an explanation, and nothing is requested', async () => {
  const { saver, button, status, calls } = harness({ online: false });
  await saver.setPlan(smallPlan, 'Kioto');
  assert.equal(button.disabled, true);
  assert.match(status.textContent, /Sin conexión/);
  await saver.save();
  assert.equal(calls.length, 0);
});

test('the control is hidden where the Cache API does not exist', () => {
  const button = { hidden: false, textContent: '', dataset: {}, addEventListener() {} };
  initMapOffline({ button, status: { textContent: '' }, win: { navigator: { onLine: true }, addEventListener() {} }, cacheStorage: undefined, fetchFn: async () => ({}) });
  assert.equal(button.hidden, true);
});

test('the test-only pause scale defaults to 1 and only accepts non-negative numbers', () => {
  assert.equal(pauseScale({}), 1);
  assert.equal(pauseScale({ __tilePauseScale: 0 }), 0);
  assert.equal(pauseScale({ __tilePauseScale: 0.25 }), 0.25);
  assert.equal(pauseScale({ __tilePauseScale: -1 }), 1);
  assert.equal(pauseScale({ __tilePauseScale: '0' }), 1);
});
