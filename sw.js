// Service worker: makes the guide work without a connection after the first visit.
// VERSION is stamped by scripts/build-offline.js; a new version installs a fresh cache and removes the old one.
const VERSION = 'a4885e9caf';
const APP_CACHE = `japan-guide-${VERSION}`;
const TILE_CACHE = 'japan-tiles-v1';
const MAX_TILES = 700;
const TILE_HOST = 'tile.openstreetmap.org';
const READY_KEY = '__offline-ready';

const abs = (path) => new URL(path, self.registration.scope).href;
const loadManifest = async () => (await fetch(abs('offline-manifest.json'), { cache: 'reload' })).json();

async function fetchInto(cache, path, { retry = true } = {}) {
  const response = await fetch(abs(path), { cache: 'reload' });
  if (!response.ok) {
    if (retry) return fetchInto(cache, path, { retry: false });
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  await cache.put(abs(path), response);
}

async function inBatches(items, size, task) {
  for (let i = 0; i < items.length; i += size) await Promise.allSettled(items.slice(i, i + size).map(task));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const manifest = await loadManifest();
    const cache = await caches.open(APP_CACHE);
    // The app itself must be complete, otherwise the install fails and the previous version keeps working.
    const missing = [];
    await inBatches(manifest.required, 8, (path) => fetchInto(cache, path).catch((error) => { missing.push(error.message); }));
    if (missing.length) throw new Error(`Offline install incomplete: ${missing.join(', ')}`);
    await inBatches(manifest.optional, 8, (path) => fetchInto(cache, path).catch(() => {}));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('japan-guide-') && name !== APP_CACHE) await caches.delete(name);
    }
    await self.clients.claim();
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
    // A large photo that was never stored: show the 960 px copy instead of nothing.
    if (/-1600\.webp$/.test(request.url)) {
      const smaller = await cache.match(request.url.replace(/-1600\.webp$/, '-960.webp'));
      if (smaller) return smaller;
    }
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === TILE_HOST) event.respondWith(tileResponse(request));
  else if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.respondWith(request.mode === 'navigate' ? navigationResponse(request) : assetResponse(request));
  }
});

async function broadcast(message) {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) client.postMessage(message);
}

async function warmUp() {
  const cache = await caches.open(APP_CACHE);
  if (await cache.match(abs(READY_KEY))) return broadcast({ type: 'offline-ready', version: VERSION });
  const manifest = await loadManifest();
  const pending = [];
  for (const path of manifest.warm) if (!(await cache.match(abs(path)))) pending.push(path);
  let done = 0;
  await inBatches(pending, 4, async (path) => {
    await fetchInto(cache, path).catch(() => {});
    done += 1;
    if (done % 8 === 0 || done === pending.length) await broadcast({ type: 'offline-progress', done, total: pending.length });
  });
  const complete = [];
  for (const path of manifest.warm) if (await cache.match(abs(path))) complete.push(path);
  if (complete.length === manifest.warm.length) {
    await cache.put(abs(READY_KEY), new Response('ok'));
    await broadcast({ type: 'offline-ready', version: VERSION });
  } else {
    await broadcast({ type: 'offline-partial', missing: manifest.warm.length - complete.length });
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'warm') event.waitUntil(warmUp());
  else if (event.data?.type === 'status') {
    event.waitUntil((async () => {
      const cache = await caches.open(APP_CACHE);
      event.source?.postMessage((await cache.match(abs(READY_KEY))) ? { type: 'offline-ready', version: VERSION } : { type: 'offline-installed', version: VERSION });
    })());
  }
});
