import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTH_CONFIG } from '../assets/auth-config.js';
import { createAuth, isConfigured, isRedirectCallback, safeReturnTo, managementAudience, isAdmin, ROLES_CLAIM, ADMIN_ROLE } from '../js/modules/auth.js';
import { greetingName, statusText, RESETS } from '../js/modules/account.js';
import { SYNCED_KEYS } from '../js/modules/user-data.js';
import { VISITED_KEY } from '../js/modules/visited.js';
import { parseVisited } from '../js/modules/visited.js';
import { FAVORITES_STORAGE_KEY } from '../js/modules/phrases.js';
import { DISH_FAVORITES_KEY } from '../js/modules/dishes.js';

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

test('the individual resets target the real storage keys and store an empty value of the right shape', () => {
  assert.deepEqual(RESETS.map((item) => item.key), [VISITED_KEY, FAVORITES_STORAGE_KEY, DISH_FAVORITES_KEY]);
  for (const item of RESETS) assert.ok(SYNCED_KEYS.includes(item.key));
  assert.equal(parseVisited(RESETS[0].empty).size, 0);
  assert.deepEqual(JSON.parse(RESETS[1].empty), []);
  assert.deepEqual(JSON.parse(RESETS[2].empty), []);
});

test('the administrator role is read only from the roles claim in the ID token', () => {
  assert.equal(ROLES_CLAIM, 'https://japan-trip-2026/roles');
  assert.equal(ADMIN_ROLE, 'administrador');
  assert.equal(isAdmin({ [ROLES_CLAIM]: ['administrador'] }), true);
  assert.equal(isAdmin({ [ROLES_CLAIM]: ['otro', 'administrador'] }), true);
  assert.equal(isAdmin({ [ROLES_CLAIM]: [] }), false);
  assert.equal(isAdmin({ [ROLES_CLAIM]: ['Administrador'] }), false);
  assert.equal(isAdmin({ [ROLES_CLAIM]: 'administrador' }), false);
  assert.equal(isAdmin({ roles: ['administrador'] }), false);
  assert.equal(isAdmin({ user_metadata: { roles: ['administrador'] } }), false);
  assert.equal(isAdmin({}), false);
  assert.equal(isAdmin(null), false);
});

test('«Entrar con Google» sends the Google connection; «Entrar» sends none, so Auth0 shows its normal login page', async () => {
  const calls = [];
  class Auth0Client { async loginWithRedirect(options) { calls.push(options); } }
  const win = { document: { baseURI: 'https://garridovic.github.io/Japan-trip-2026/' }, location: { pathname: '/Japan-trip-2026/', search: '?view=mapa' } };
  const auth = await createAuth({ enabled: true, domain: 't.eu.auth0.com', clientId: 'x' }, { loadSdk: async () => ({ Auth0Client }), win });
  await auth.login();
  await auth.loginWithPrompt();
  assert.deepEqual(calls[0].authorizationParams, { connection: 'google-oauth2' });
  assert.equal(calls[1].authorizationParams, undefined);
  assert.deepEqual(calls[1].appState, { returnTo: '/Japan-trip-2026/?view=mapa' });
});
