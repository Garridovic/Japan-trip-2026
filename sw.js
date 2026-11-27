// Service worker: makes the guide work without a connection after the first visit.
// VERSION is stamped by scripts/build-offline.js; a new version installs a fresh cache and removes the old one.
const VERSION = '0118f4fd7e';
const APP_CACHE = `japan-guide-${VERSION}`;
const TILE_CACHE = 'japan-tiles-v1';
const MAX_TILES = 700;
const TILE_HOST = 'tile.openstreetmap.org';
const INSTALLED_KEY = '__installed';

const abs = (path) => new URL(path, self.registration.scope).href;
const loadManifest = async () => (await fetch(abs('offline-manifest.json'), { cache: 'reload' })).json();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Downloads one file into the cache; a flaky connection gets three tries before the file counts as missing. */
async function fetchInto(cache, path, { tries = 3 } = {}) {
  try {
    const response = await fetch(abs(path), { cache: 'reload' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await cache.put(abs(path), response);
  } catch (error) {
    if (tries <= 1) throw error;
    await wait(400);
    return fetchInto(cache, path, { tries: tries - 1 });
  }
}

async function inBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) await Promise.allSettled(items.slice(i, i + size).map(task));
}

let replacedAnother = false; // this worker is taking over from an older one (not a first visit)

/**
 * Pages of this version answer 'sw-activated' on the channel they receive. A page that does not (an older version whose
 * update button may be stuck) is reloaded by the worker itself, so it ends up on the files that are now in the cache.
 */
function answered(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 2500);
    channel.port1.onmessage = () => { clearTimeout(timer); resolve(true); };
    try { client.postMessage({ type: 'sw-activated' }, [channel.port2]); } catch { clearTimeout(timer); resolve(true); }
  });
}
async function reloadPagesThatCannotUpdate() {
  for (const client of await self.clients.matchAll({ type: 'window' })) {
    if (!(await answered(client))) await client.navigate?.(client.url).catch(() => {});
  }
}

self.addEventListener('install', (event) => {
  replacedAnother = Boolean(self.registration.active);
  event.waitUntil((async () => {
    const manifest = await loadManifest();
    const cache = await caches.open(APP_CACHE);
    // The app itself must be complete, otherwise the install fails and the previous version keeps working.
    const missing = [];
    await inBatches(manifest.required, 8, (path) => fetchInto(cache, path).catch((error) => { missing.push(error.message); }));
    if (missing.length) throw new Error(`Offline install incomplete: ${missing.join(', ')}`);
    await cache.put(abs(INSTALLED_KEY), new Response(JSON.stringify({ at: Date.now(), version: VERSION }), { headers: { 'content-type': 'application/json' } }));
    await cache.put(abs('offline-manifest.json'), new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } }));
    // The new version takes over as soon as the app itself is saved. The small photos (optional) are NOT downloaded
    // here: an install that waits for them can take longer than the page waits, and the update then looks like it did nothing.
    // They are fetched in the background once the worker is active (see `fillInBackground`).
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('japan-guide-') && name !== APP_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
    // Not awaited on purpose (activation must finish quickly); the page also asks for it ('fill') if the worker is stopped first.
    fillInBackground();
    // The page asks again with a message (which keeps the worker alive until the photos are in): activation itself must finish quickly,
    // so a download started here alone can be cut short when the browser stops the idle worker.
    broadcast({ type: 'offline-resume' });
    if (replacedAnother) reloadPagesThatCannotUpdate();
  })());
});

async function navigationResponse(request) {
  const cache = await caches.open(APP_CACHE);
  return (await cache.match(abs('index.html'))) ?? fetch(request);
}

async function assetResponse(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && /\/(assets|data)\//.test(request.url)) cache.put(request, response.clone());
    return response;
  } catch (error) {
    // A photo that was never stored: show the next smaller copy instead of nothing (1600 -> 960 -> 480).
    const smaller = [['-1600.webp', '-960.webp'], ['-960.webp', '-480.webp']].find(([from]) => request.url.endsWith(from));
    if (smaller) {
      const fallback = await cache.match(request.url.replace(smaller[0], smaller[1])) ?? await cache.match(request.url.replace(smaller[0], '-480.webp'));
      if (fallback) return fallback;
    }
    // A data file that was never saved does not exist (every real dataset is in the precache): answer 404 like the
    // server would, so optional datasets (for example a city without events.json) are simply skipped offline.
    if (/\/data\//.test(request.url)) return new Response('Not found', { status: 404 });
    throw error;
  }
}

async function trimTiles(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(key);
}

async function tileResponse(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type !== 'opaque') {
    await cache.put(request.url, response.clone());
    trimTiles(cache);
  }
  return response;
}

/** version.json?fresh=...: the newest deployed version, straight from the network; the saved copy only when there is no network. */
async function freshResponse(request) {
  try {
    return await fetch(request.url, { cache: 'no-store' });
  } catch (error) {
    const cache = await caches.open(APP_CACHE);
    return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.endsWith('/data/version.json') && url.searchParams.has('fresh')) {
    event.respondWith(freshResponse(request));
    return;
  }
  if (url.hostname === TILE_HOST) event.respondWith(tileResponse(request));
  else if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.respondWith(request.mode === 'navigate' ? navigationResponse(request) : assetResponse(request));
  }
});

async function broadcast(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

async function cachedManifest(cache) {
  const stored = await cache.match(abs('offline-manifest.json'));
  return stored ? stored.json() : loadManifest();
}

/** Checks the cache against the manifest, file by file: "installed" is not the same as "complete". */
async function buildReport() {
  const cache = await caches.open(APP_CACHE);
  const manifest = await cachedManifest(cache);
  const have = new Set((await cache.keys()).map((request) => request.url));
  const missing = (list) => list.filter((path) => !have.has(abs(path)));
  // A copy that is complete but has no «saved on» stamp (an interrupted install, an older version) gets one now, so the date is never «—».
  if (!have.has(abs(INSTALLED_KEY)) && missing(manifest.required).length === 0) {
    await cache.put(abs(INSTALLED_KEY), new Response(JSON.stringify({ at: Date.now(), version: VERSION }), { headers: { 'content-type': 'application/json' } }));
  }
  const installed = await cache.match(abs(INSTALLED_KEY));
  const tiles = (await (await caches.open(TILE_CACHE)).keys()).length;
  return {
    type: 'offline-report',
    version: VERSION,
    installedAt: installed ? (await installed.json()).at : null,
    missing: { required: missing(manifest.required).length, optional: missing(manifest.optional).length, warm: missing(manifest.warm).length },
    totals: { required: manifest.required.length, optional: manifest.optional.length, warm: manifest.warm.length },
    sizes: manifest.sizes,
    tiles
  };
}

async function fetchMissing(lists) {
  const cache = await caches.open(APP_CACHE);
  const manifest = await cachedManifest(cache);
  const pending = [];
  for (const name of lists) for (const path of manifest[name]) if (!(await cache.match(abs(path)))) pending.push(path);
  let done = 0;
  await inBatches(pending, 4, async (path) => {
    await fetchInto(cache, path).catch(() => {});
    done += 1;
    if (done % 8 === 0 || done === pending.length) await broadcast({ type: 'offline-progress', done, total: pending.length });
  });
}

let filling = null;
/** Downloads the optional photos of the active version; safe to call several times at once. */
function fillInBackground() {
  if (!filling) filling = fetchMissing(['optional']).catch(() => {}).finally(() => { filling = null; });
  return filling;
}

async function reply(source) {
  const report = await buildReport();
  if (source) source.postMessage(report);
  else await broadcast(report);
}

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'skip-waiting') self.skipWaiting();
  else if (type === 'warm') event.waitUntil(fetchMissing(['required', 'optional', 'warm']).then(() => reply(null)));
  else if (type === 'fill') event.waitUntil(fillInBackground().then(() => reply(null)));
  else if (type === 'repair') event.waitUntil(fetchMissing(['required', 'optional']).then(() => reply(null)));
  else if (type === 'verify' || type === 'status') event.waitUntil(reply(event.source));
});
