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
  async loginWithRedirect({ appState }) {
    localStorage.setItem('fake-session', JSON.stringify({ sub: 'google-oauth2|123', name: 'Alex García', given_name: 'Alex', email: 'alex@example.com' }));
    sessionStorage.setItem('fake-app-state', JSON.stringify(appState));
    location.href = this.options.authorizationParams.redirect_uri + '?code=abc&state=xyz';
  }
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
  test('dormant by default: no account button and no sign-in code is requested', async ({ page }) => {
    const requested = [];
    page.on('request', (request) => { if (/auth0|auth\.js|cloud-sync/.test(request.url())) requested.push(request.url()); });
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await expect(page.locator('#account-button')).toBeHidden();
    expect(requested).toEqual([]);
  });

  test('anonymous: the guide works, the account panel explains and offers Google, the invite can be dismissed', async ({ page }) => {
    await enableAuth(page);
    await page.goto('/');
    await expect(page.locator('#account-button')).toBeVisible();
    await expect(page.locator('#account-greeting')).toBeHidden();
    await expect(page.locator('#account-invite')).toBeVisible();
    await page.locator('#account-button').click();
    await expect(page.locator('#account-popover')).toContainText('sin sesión');
    await expect(page.locator('#account-popover')).toContainText('PINs y las reservas');
    await page.keyboard.press('Escape');
    await page.locator('#account-invite').getByRole('button', { name: 'Ahora no' }).click();
    await expect(page.locator('#account-invite')).toBeHidden();
    await page.reload();
    await expect(page.locator('#account-invite')).toBeHidden();
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
});
