import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_CONFIG } from '../assets/auth-config.js';
import { isConfigured, isRedirectCallback, safeReturnTo, managementAudience } from '../js/modules/auth.js';
import { greetingName, statusText } from '../js/modules/account.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the public sign-in config holds only domain and client id (no secrets)', () => {
  assert.equal(AUTH_CONFIG.enabled, true);
  assert.deepEqual(Object.keys(AUTH_CONFIG).sort(), ['clientId', 'domain', 'enabled']);
  assert.equal(isConfigured(AUTH_CONFIG), true);
  assert.equal(isConfigured({ enabled: true, domain: 'a.eu.auth0.com', clientId: 'x' }), true);
  assert.equal(isConfigured({ enabled: true, domain: '', clientId: 'x' }), false);
});

test('the service worker never touches Auth0 or Google (it only handles its own scope and map tiles)', () => {
  const worker = read('sw.js');
  assert.ok(!/auth0|accounts\.google/i.test(worker));
  assert.ok(worker.includes('url.href.startsWith(self.registration.scope)'));
});

test('the offline manifest carries the sign-in modules and the vendored SDK', () => {
  const manifest = JSON.parse(read('offline-manifest.json'));
  for (const file of ['assets/auth-config.js', 'assets/vendor/auth0-spa-js.production.esm.js', 'js/modules/account.js', 'js/modules/auth.js', 'js/modules/cloud-sync.js', 'js/modules/sync-merge.js']) {
    assert.ok(manifest.required.includes(file), `${file} is cached for offline use`);
  }
});

test('redirect detection and safe return paths', () => {
  assert.ok(isRedirectCallback('?code=a&state=b'));
  assert.ok(isRedirectCallback('?error=access_denied&state=b'));
  assert.ok(!isRedirectCallback('?view=mapa'));
  const base = 'https://garridovic.github.io/Japan-trip-2026/';
  assert.equal(safeReturnTo('/Japan-trip-2026/?view=mapa', base), '/Japan-trip-2026/?view=mapa');
  assert.equal(safeReturnTo('https://evil.example/x', base), '/Japan-trip-2026/');
  assert.equal(safeReturnTo('/other/', base), '/Japan-trip-2026/');
  assert.equal(managementAudience('t.eu.auth0.com'), 'https://t.eu.auth0.com/api/v2/');
});

test('greeting and status texts', () => {
  assert.equal(greetingName({ given_name: 'Alex', name: 'Alex García' }), 'Alex');
  assert.equal(greetingName({ name: 'José Luis Pérez' }), 'José');
  assert.equal(greetingName(null), '');
  assert.match(statusText('pending', { online: false }), /Sin internet/);
  assert.equal(statusText('synced', { lastSyncAt: 1000, now: 1000 + 5 * 60000 }), 'Sincronizado · hace 5 min');
});
