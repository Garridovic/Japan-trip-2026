import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, freshVersionUrl, describeCheck, FRESH_PARAM } from '../js/modules/updates.js';

test('a different deployed version is "new"; the same one is "current"; missing data is "unknown"', () => {
  assert.equal(compareVersions('V12.1.0', 'V12.2.0'), 'new');
  assert.equal(compareVersions('V12.2.0', 'V12.2.0'), 'current');
  assert.equal(compareVersions('V12.2.0', null), 'unknown');
  assert.equal(compareVersions(null, 'V12.2.0'), 'unknown');
});

test('the fresh check uses a URL the service worker never answers from its saved copy', () => {
  assert.equal(freshVersionUrl('data/version.json', 123), `data/version.json?${FRESH_PARAM}=123`);
});

test('every outcome has a plain-language message', () => {
  for (const result of ['new', 'current', 'offline', 'checking', 'error']) assert.ok(describeCheck(result).length > 10, result);
  assert.match(describeCheck('offline'), /sigue funcionando/);
});

import { waitForTakeover, forceFreshStart, reloadFresh, settle, HARD_PARAM } from '../js/modules/updates.js';
import { readFileSync } from 'node:fs';

function fakeWin({ onUpdate } = {}) {
  const listeners = {};
  const container = {
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
    emit: (type) => (listeners[type] ?? []).slice().forEach((fn) => fn())
  };
  return { container, win: { navigator: { serviceWorker: container }, setTimeout, clearTimeout } , onUpdate };
}
const fakeWorker = (state = 'installing') => {
  const handlers = [];
  return { state, messages: [], postMessage(m) { this.messages.push(m); }, addEventListener: (_t, fn) => handlers.push(fn), set(next) { this.state = next; handlers.forEach((fn) => fn()); } };
};
const fakeRegistration = (worker) => ({ installing: worker, waiting: null, addEventListener() {}, update: async () => {} });

test('waitForTakeover resolves when the new worker takes control of the page', async () => {
  const { container, win } = fakeWin();
  const worker = fakeWorker();
  const pending = waitForTakeover({ win, registration: fakeRegistration(worker), timeoutMs: 2000 });
  worker.set('installed');
  assert.deepEqual(worker.messages, [{ type: 'skip-waiting' }], 'an installed worker is asked to take over');
  container.emit('controllerchange');
  assert.equal(await pending, 'took-over');
});

test('waitForTakeover reports a worker that could not install, and a timeout', async () => {
  const { win } = fakeWin();
  const worker = fakeWorker();
  const failed = waitForTakeover({ win, registration: fakeRegistration(worker), timeoutMs: 2000 });
  worker.set('redundant');
  assert.equal(await failed, 'failed');
  assert.equal(await waitForTakeover({ win: fakeWin().win, registration: fakeRegistration(fakeWorker()), timeoutMs: 20 }), 'timeout');
  assert.equal(await waitForTakeover({ win: fakeWin().win, registration: null, timeoutMs: 50 }), 'failed');
});

test('forceFreshStart unregisters every worker and deletes only the guide caches', async () => {
  const removed = [];
  const deleted = [];
  const fetched = [];
  const win = {
    setTimeout, clearTimeout,
    fetch: async (url, options) => { fetched.push([url, options?.cache]); return url === 'offline-manifest.json' ? { json: async () => ({ required: ['index.html', 'js/main.js'] }) } : { arrayBuffer: async () => new ArrayBuffer(0) }; },
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => removed.push('a') }, { unregister: async () => removed.push('b') }] } },
    caches: { keys: async () => ['japan-guide-x', 'japan-tiles-v1', 'japan-guide-y'], delete: async (name) => deleted.push(name) }
  };
  await forceFreshStart(win);
  assert.deepEqual(removed, ['a', 'b']);
  assert.deepEqual(deleted, ['japan-guide-x', 'japan-guide-y'], 'saved map tiles are kept');
  assert.deepEqual(fetched.map(([url]) => url), ['offline-manifest.json', 'index.html', 'js/main.js'], 'the browser copies of the app are refreshed too');
  assert.ok(fetched.every(([, cache]) => cache === 'reload'));
});

test('the worker takes over once the app is saved and fetches the small photos only afterwards', () => {
  const worker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const install = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf("addEventListener('activate'"));
  assert.match(install, /skipWaiting/);
  assert.doesNotMatch(install, /manifest\.optional/, 'photos must not delay the install');
  assert.match(worker, /type === 'skip-waiting'/);
  assert.match(worker, /fillInBackground\(\)/);
});

test('forceFreshStart never hangs or throws, even if the browser calls do', async () => {
  const win = {
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 20)), clearTimeout,
    navigator: { serviceWorker: { getRegistrations: () => new Promise(() => {}) } }, // never answers
    caches: { keys: async () => { throw new Error('boom'); } },
    fetch: () => new Promise(() => {})
  };
  await forceFreshStart(win); // resolves once every step has used up its (shortened) time limit
});

test('reloadFresh loads the same page on an address no cache has seen, and keeps the rest of the query', () => {
  let replaced = null;
  reloadFresh({ location: { href: 'https://example.com/Japan/?view=mapa&city=osaka', replace: (url) => { replaced = url; } } }, 123);
  const url = new URL(replaced);
  assert.equal(url.searchParams.get(HARD_PARAM), '123');
  assert.equal(url.searchParams.get('view'), 'mapa');
  assert.equal(url.searchParams.get('city'), 'osaka');
});

test('settle gives the fallback when a promise hangs or fails', async () => {
  const win = { setTimeout: (fn) => setTimeout(fn, 10), clearTimeout };
  assert.equal(await settle(new Promise(() => {}), 1000, 'late', win), 'late');
  assert.equal(await settle(Promise.reject(new Error('x')), 1000, 'failed', win), 'failed');
  assert.equal(await settle(Promise.resolve(7), 1000, 'no', win), 7);
});

import { formatChecked } from '../js/modules/update-settings.js';
test('the settings block says when the last check was', () => {
  const now = Date.UTC(2026, 10, 27, 12, 0);
  assert.equal(formatChecked(0, now), 'todavía no');
  assert.equal(formatChecked(now - 20_000, now), 'ahora mismo');
  assert.equal(formatChecked(now - 7 * 60_000, now), 'hace 7 min');
});
