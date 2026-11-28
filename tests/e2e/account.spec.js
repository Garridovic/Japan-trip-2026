import { test, expect } from '@playwright/test';

const DOMAIN = 'test.eu.auth0.com';
const CONFIG = `export const AUTH_CONFIG = { enabled: true, domain: '${DOMAIN}', clientId: 'test-client' };`;
// A stand-in for auth0-spa-js: the "session" is a localStorage entry and the redirect is a same-page navigation.
const FAKE_SDK = `
export class Auth0Client {
  constructor(options) { this.options = options; }
  async handleRedirectCallback() { return { appState: JSON.parse(sessionStorage.getItem('fake-app-state') || '{}') }; }
  async isAuthenticated() { return Boolean(localStorage.getItem('fake-session')); }
  async getUser() { return JSON.parse(localStorage.getItem('fake-session') || 'null'); }
  async loginWithRedirect({ appState, authorizationParams }) {
    sessionStorage.setItem('fake-login-params', JSON.stringify(authorizationParams ?? null));
    const roles = JSON.parse(sessionStorage.getItem('fake-roles') || 'null'); // what the Auth0 Action would put in the ID token
    localStorage.setItem('fake-session', JSON.stringify({ sub: 'google-oauth2|123', name: 'Alex García', given_name: 'Alex', email: 'alex@example.com', ...(roles ? { 'https://japan-trip-2026/roles': roles } : {}) }));
    sessionStorage.setItem('fake-app-state', JSON.stringify(appState));
    location.href = this.options.authorizationParams.redirect_uri + '?code=abc&state=xyz';
  }
  async getIdTokenClaims() { return localStorage.getItem('fake-session') ? { __raw: 'fake-id-token' } : null; }
  async getTokenSilently() { if (!localStorage.getItem('fake-session')) throw new Error('login_required'); return 'fake-token'; }
  async logout() { localStorage.removeItem('fake-session'); location.href = this.options.authorizationParams.redirect_uri; }
}
`;

/** Turns the feature on and fakes both the SDK and the Management API. `cloud` is the user_metadata japan_trip.data held "in the cloud". */
async function enableAuth(page, { cloud = null, apiStatus = 200, seed = null } = {}) {
  const api = { requests: [], cloud: cloud ? { v: 1, updatedAt: 1, data: cloud } : null };
  await page.route('**/assets/auth-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  await page.route('**/assets/vendor/auth0-spa-js.production.esm.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.route(`https://${DOMAIN}/api/v2/**`, async (route) => {
    const request = route.request();
    api.requests.push({ method: request.method(), body: request.postData() ? JSON.parse(request.postData()) : null, auth: request.headers().authorization });
    if (apiStatus !== 200) return route.fulfill({ status: apiStatus, contentType: 'application/json', body: '{}' });
    if (request.method() === 'PATCH') { api.cloud = JSON.parse(request.postData()).user_metadata.japan_trip; return route.fulfill({ contentType: 'application/json', body: '{}' }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_metadata: api.cloud ? { japan_trip: api.cloud } : {} }) });
  });
  if (seed) await page.addInitScript((values) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v); } }, seed);
  return api;
}
const signIn = async (page) => {
  await page.locator('#account-button').click();
  await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
  await expect(page.locator('#account-greeting')).toHaveText('Hola, Alex');
};

test.describe('optional account (Auth0, Google)', () => {
  test('when disabled in the config: no account button and no sign-in code is requested', async ({ page }) => {
    await page.route('**/assets/auth-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const AUTH_CONFIG = { enabled: false, domain: '', clientId: '' };" }));
    const requested = [];
    page.on('request', (request) => { if (/auth0-spa|auth\.js|cloud-sync/.test(request.url())) requested.push(request.url()); });
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await expect(page.locator('#account-button')).toBeHidden();
    expect(requested).toEqual([]);
  });

  test('anonymous: the guide works, the account panel explains and offers Google, the invite can be dismissed', async ({ page }) => {
    await enableAuth(page);
    await page.goto('/?view=viaje'); // the invite lives at the top of Viaje
    await expect(page.locator('#account-button')).toBeVisible();
    await expect(page.locator('#account-greeting')).toBeHidden();
    await expect(page.locator('#account-invite')).toBeVisible();
    await page.locator('#account-button').click();
    await expect(page.locator('#account-popover')).toContainText('Entra con Google para ver');
    await expect(page.locator('#account-popover')).toContainText('PINs y las reservas');
    await page.keyboard.press('Escape');
    await page.locator('#account-invite').getByRole('button', { name: 'Ahora no' }).click();
    await expect(page.locator('#account-invite')).toBeHidden();
    await page.reload();
    await expect(page.locator('#account-invite')).toBeHidden();
  });

  test('«Entrar con Google» goes straight to Google; «Entrar» asks Auth0 for its normal login page (no connection)', async ({ page }) => {
    await enableAuth(page);
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.locator('#account-button').click();
    const buttons = page.locator('#account-popover .account-actions button');
    await expect(buttons.filter({ hasText: 'Entrar con Google' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    expect((await page.getByRole('button', { name: 'Entrar', exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.locator('#account-greeting')).toHaveText('Hola, Alex');
    expect(await page.evaluate(() => sessionStorage.getItem('fake-login-params'))).toBe('null'); // no `connection` was sent
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click();
    await expect(page.locator('#account-greeting')).toBeHidden();
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
    await expect(page.locator('#account-greeting')).toHaveText('Hola, Alex');
    expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem('fake-login-params')))).toEqual({ connection: 'google-oauth2' });
  });

  test('first login unions this device with the account, greets by name and never uploads private notes', async ({ page }) => {
    const api = await enableAuth(page, {
      cloud: { 'visited-v1': JSON.stringify({ kyoto: ['nishiki'] }) },
      seed: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi'] }), 'japan-trip:lodging-private': 'PIN 4321' }
    });
    await page.goto('/');
    await signIn(page);
    const visited = await page.evaluate(() => JSON.parse(localStorage.getItem('visited-v1')));
    expect(visited.kyoto.sort()).toEqual(['fushimi', 'nishiki']);
    expect(await page.evaluate(() => localStorage.getItem('user-data-backup'))).toContain('fushimi');
    const patch = api.requests.find((request) => request.method === 'PATCH');
    expect(patch.auth).toBe('Bearer fake-token');
    expect(JSON.parse(patch.body.user_metadata.japan_trip.data['visited-v1']).kyoto.sort()).toEqual(['fushimi', 'nishiki']);
    expect(JSON.stringify(api.requests)).not.toContain('4321');
    await page.locator('#account-button').click();
    await expect(page.locator('#account-popover')).toContainText('alex@example.com');
    await expect(page.locator('#account-popover')).toContainText('Sincronizado');
    await expect(page.locator('#account-invite')).toBeHidden();
  });

  test('a change made while signed in is saved after the debounce, once', async ({ page }) => {
    const api = await enableAuth(page, { cloud: {} });
    await page.goto('/?view=viaje');
    await signIn(page);
    await page.goto('/?view=viaje');
    await expect(page.locator('#account-greeting')).toHaveText('Hola, Alex');
    const before = api.requests.filter((request) => request.method === 'PATCH').length;
    await page.locator('#checklist-groups details[data-group="documentos"]').evaluate((el) => { el.open = true; });
    await page.getByRole('checkbox', { name: 'Pasaporte en vigor' }).check();
    await page.getByRole('checkbox', { name: 'Pasaporte en vigor' }).uncheck();
    await page.getByRole('checkbox', { name: 'Pasaporte en vigor' }).check();
    await expect.poll(() => api.requests.filter((request) => request.method === 'PATCH').length, { timeout: 12000 }).toBe(before + 1);
    expect(JSON.parse(api.cloud.data['checklist-v1']).checked).toContain('pasaporte');
  });

  test('when the account cannot be reached the guide keeps working and says changes are pending', async ({ page }) => {
    await enableAuth(page, { apiStatus: 503, seed: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi'] }) } });
    await page.goto('/');
    await signIn(page);
    await page.locator('#account-button').click();
    await expect(page.locator('#account-popover .account-status')).toContainText('cambios sin enviar');
    expect(await page.evaluate(() => localStorage.getItem('visited-v1'))).toContain('fushimi');
  });

  test('the account panel shows the app version, signed in and signed out', async ({ page }) => {
    const { version } = JSON.parse((await import('node:fs')).readFileSync(new URL('../../data/version.json', import.meta.url), 'utf8'));
    await enableAuth(page, { cloud: {} });
    await page.goto('/');
    await page.locator('#account-button').click();
    await expect(page.locator('#settings-version-installed')).toHaveText(version);
    await page.keyboard.press('Escape'); // close it (the sheet's dimmed background covers the header); signIn opens it again
    await signIn(page);
    await page.locator('#account-button').click();
    await expect(page.locator('#settings-version-installed')).toHaveText(version);
  });

  test('the «Administración» section appears only with the administrator role in the token', async ({ page }) => {
    await enableAuth(page);
    await page.addInitScript(() => { if (!sessionStorage.getItem('roles-set')) { sessionStorage.setItem('roles-set', '1'); sessionStorage.setItem('fake-roles', '["Administrador"]'); } }); // the role is typed by hand in Auth0: capital letter included
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.locator('#account-button').click();
    await expect(page.locator('.account-admin')).toHaveCount(0); // anonymous
    await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
    await expect(page.locator('#account-greeting')).toHaveText('Hola, Alex');
    await page.locator('#account-button').click();
    await expect(page.locator('.account-admin')).toBeVisible();
    await expect(page.locator('.account-admin')).toContainText('Administración');
  });

  test('notices: everyone sees the published notice and can close it; the administrator publishes and withdraws it', async ({ page, browser }) => {
    const WORKER = 'https://japon-avisos.garridovic.workers.dev/avisos';
    let stored = { avisos: [] };
    const puts = [];
    const handler = async (route) => {
      const request = route.request();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() === 'PUT') { puts.push({ auth: request.headers().authorization, body: request.postDataJSON() }); stored = request.postDataJSON(); return route.fulfill({ status: 200, headers, contentType: 'application/json', body: '{"ok":true}' }); }
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(stored) });
    };
    await page.route(WORKER, handler);
    await page.addInitScript(() => localStorage.setItem('notices-enabled', '1'));
    await enableAuth(page);
    await page.addInitScript(() => { if (!sessionStorage.getItem('roles-set')) { sessionStorage.setItem('roles-set', '1'); sessionStorage.setItem('fake-roles', '["Administrador"]'); } });
    await page.goto('/');
    await expect(page.locator('#app-notice')).toBeHidden(); // nothing published yet
    await signIn(page);
    await page.locator('#account-button').click();
    await page.getByLabel('Título').fill('Novedad de prueba');
    await page.getByLabel('Texto').fill('Ahora puedes filtrar el mapa.');
    await page.locator('#admin-publish').click();
    await expect(page.getByText('Aviso publicado.')).toBeVisible();
    expect(puts).toHaveLength(1);
    expect(puts[0].auth).toBe('Bearer fake-id-token');
    expect(puts[0].body.avisos[0]).toMatchObject({ titulo: 'Novedad de prueba', texto: 'Ahora puedes filtrar el mapa.' });
    expect(puts[0].body.avisos[0].caduca).toBeGreaterThan(Date.now());

    // Another person, another device: no role, no session. They see it and can close it for good.
    const other = await browser.newContext();
    const page2 = await other.newPage();
    await page2.route(WORKER, handler);
    await page2.addInitScript(() => localStorage.setItem('notices-enabled', '1'));
    await page2.goto('/');
    await expect(page2.locator('#app-notice')).toContainText('Novedad de prueba');
    await page2.locator('#app-notice').getByRole('button', { name: 'Entendido' }).click();
    await expect(page2.locator('#app-notice')).toBeHidden();
    await page2.reload();
    await expect(page2.locator('#hero-title')).not.toHaveText('…');
    await expect(page2.locator('#app-notice')).toBeHidden();
    await other.close();

    await page.locator('#admin-withdraw').click();
    await expect(page.getByText('Aviso retirado.')).toBeVisible();
    expect(puts[1].body).toEqual({ avisos: [] });
  });

  test('notices: offline the last copy is still shown', async ({ page }) => {
    const WORKER = 'https://japon-avisos.garridovic.workers.dev/avisos';
    await page.addInitScript(() => { if (!localStorage.getItem('notices-cache')) { localStorage.setItem('notices-enabled', '1'); localStorage.setItem('notices-cache', JSON.stringify([{ id: 'x1', tipo: 'aviso', titulo: 'Aviso guardado', texto: '', caduca: 0 }])); } });
    await page.route(WORKER, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#app-notice')).toContainText('Aviso guardado');
  });

  test('a signed-in user without the role, or with another role, never sees «Administración»', async ({ page }) => {
    await enableAuth(page);
    await page.addInitScript(() => { if (!sessionStorage.getItem('roles-set')) { sessionStorage.setItem('roles-set', '1'); sessionStorage.setItem('fake-roles', '["editor"]'); } });
    await page.goto('/');
    await signIn(page);
    await page.locator('#account-button').click();
    await expect(page.locator('.account-back')).toBeVisible();
    await expect(page.locator('.account-admin')).toHaveCount(0);
    await expect(page.getByText('Administración')).toHaveCount(0);
  });

  test('sign out keeps the data on this device; "cerrar y borrar" removes it', async ({ page }) => {
    await enableAuth(page, { cloud: {}, seed: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi'] }) } });
    await page.goto('/');
    await signIn(page);
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.locator('#account-popover')).toContainText('¿Cerrar sesión?');
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(page.locator('#account-greeting')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('visited-v1'))).toContain('fushimi');
    expect(await page.evaluate(() => localStorage.getItem('user-data-synced-base'))).toBeNull();

    await signIn(page);
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('button', { name: 'Cerrar y borrar los datos de este dispositivo' }).click();
    await expect(page.locator('#account-greeting')).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('visited-v1'))).toBeNull();
  });

  test('the sign-in return keeps the view that was open', async ({ page }) => {
    await enableAuth(page, { cloud: {} });
    await page.goto('/?view=frases');
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Entrar con Google' }).first().click();
    await expect(page).toHaveURL(/view=frases/);
    await expect(page).not.toHaveURL(/code=/);
  });

  test('anonymous: each reset clears only its own list on this device, after a confirmation', async ({ page }) => {
    await enableAuth(page, { seed: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi'] }), 'japan-trip:phrase-favorites': JSON.stringify(['konichiwa']), 'japan-trip:dish-favorites': JSON.stringify(['gohan']), 'japan-trip:lodging-private': 'PIN 4321' } });
    await page.goto('/');
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Restablecer frases favoritas' }).click();
    await expect(page.locator('#account-popover')).toContainText('¿Restablecer las frases favoritas?');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect(await page.evaluate(() => localStorage.getItem('japan-trip:phrase-favorites'))).toBe('["konichiwa"]');
    await page.getByRole('button', { name: 'Restablecer frases favoritas' }).click();
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Frases favoritas restablecidas');
    expect(await page.evaluate(() => localStorage.getItem('japan-trip:phrase-favorites'))).toBe('[]');
    expect(await page.evaluate(() => localStorage.getItem('visited-v1'))).toContain('fushimi');
    expect(await page.evaluate(() => localStorage.getItem('japan-trip:dish-favorites'))).toBe('["gohan"]');
    expect(await page.evaluate(() => localStorage.getItem('japan-trip:lodging-private'))).toBe('PIN 4321');
  });

  test('signed in: resetting visited places also clears them in the account and keeps the rest', async ({ page }) => {
    const api = await enableAuth(page, {
      cloud: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi', 'nishiki'] }), 'japan-trip:phrase-favorites': JSON.stringify(['konichiwa']) },
      seed: { 'visited-v1': JSON.stringify({ kyoto: ['fushimi'] }) }
    });
    await page.goto('/');
    await signIn(page);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('visited-v1'))).kyoto.sort()).toEqual(['fushimi', 'nishiki']);
    await page.locator('#account-button').click();
    await page.getByRole('button', { name: 'Restablecer lugares visitados' }).click();
    await expect(page.locator('#account-popover')).toContainText('también en tu cuenta');
    await page.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('Lugares visitados restablecidos');
    expect(await page.evaluate(() => localStorage.getItem('visited-v1'))).toBe('{}');
    expect(JSON.parse(api.cloud.data['visited-v1'])).toEqual({});
    expect(JSON.parse(api.cloud.data['japan-trip:phrase-favorites'])).toEqual(['konichiwa']);
  });

  test('the account panel is a screen of its own: back arrow, Back button and Escape close it, and it scrolls to the end on a short phone', async ({ page }) => {
    await enableAuth(page, { cloud: {} });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    await signIn(page);
    await page.locator('#account-button').click();
    const screen = page.locator('#account-popover');
    await expect(screen.getByRole('heading', { name: 'Cuenta y ajustes' })).toBeVisible();
    expect(await screen.evaluate((el) => { const r = el.getBoundingClientRect(); return [r.width, r.height]; })).toEqual([320, 568]);
    const logout = screen.getByRole('button', { name: 'Cerrar sesión' });
    await logout.scrollIntoViewIfNeeded();
    await expect(logout).toBeInViewport();
    await expect(screen.locator('#settings-version')).toBeAttached();
    await screen.getByRole('button', { name: 'Volver' }).click();
    await expect(screen).toBeHidden();
    await page.locator('#account-button').click();
    await page.evaluate(() => history.back()); // the phone's Back gesture
    await expect(screen).toBeHidden();
    await expect(page.locator('#city-view')).toBeVisible();
    await page.locator('#account-button').click();
    await screen.getByRole('button', { name: 'Restablecer lugares visitados' }).click();
    await screen.getByRole('button', { name: 'Volver' }).click(); // from a confirmation, the arrow returns to the list
    await expect(screen.getByRole('button', { name: 'Restablecer platos favoritos' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(screen).toBeHidden();
  });
});
