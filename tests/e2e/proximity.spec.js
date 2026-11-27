import { test, expect } from '@playwright/test';
import { kyoto } from './helpers.js';

const CONFIG = "export const AUTH_CONFIG = { enabled: true, domain: 'test.eu.auth0.com', clientId: 'test-client' };";
const FAKE_SDK = `export class Auth0Client {
  constructor(options) { this.options = options; }
  async handleRedirectCallback() { return { appState: {} }; }
  async isAuthenticated() { return false; }
  async getUser() { return null; }
  async loginWithRedirect() {}
  async getTokenSilently() { throw new Error('login_required'); }
  async logout() {}
}`;

const place = (id) => kyoto.places.find((p) => p.id === id);
const kodaiji = place('kodaiji');
const hotel = place('hotel');
const nishikiFood = kyoto.restaurants.find((r) => r.id === 'food-01');

async function open(page, context, { granted = true, at = null, query = '' } = {}) {
  if (granted) await context.grantPermissions(['geolocation']);
  if (at) await context.setGeolocation(at);
  await page.addInitScript(() => { window.__JT_PROXIMITY_POLL_MS = 250; });
  await page.route('**/assets/auth-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG }));
  await page.route('**/assets/vendor/auth0-spa-js.production.esm.js', (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_SDK }));
  await page.goto(`/${query}`);
  await expect(page.locator('#account-button')).toBeVisible();
}
const turnOn = async (page) => {
  await page.locator('#account-button').click();
  await page.getByRole('switch', { name: /Avisos de lugares cercanos/ }).click();
  await expect(page.locator('#proximity-consent')).toContainText('no puede avisarte con la app cerrada ni con el móvil bloqueado');
  await page.getByRole('button', { name: 'Activar avisos' }).click();
  await page.keyboard.press('Escape'); // the account screen stays open behind the consent sheet
};
const near = (p, metres = 20, accuracy = 15) => ({ latitude: p.lat + metres / 111195, longitude: p.lng, accuracy });
const card = (page) => page.locator('.proximity-card');
const visitedKyoto = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('visited-v1') || '{}').kyoto ?? []);

test('off by default: standing at a temple suggests nothing until the user accepts the consent sheet', async ({ page, context }) => {
  await open(page, context, { at: near(kodaiji) });
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  await page.locator('#account-button').click();
  await expect(page.getByRole('switch', { name: /desactivados/ })).toBeVisible();
  await expect(page.locator('.proximity-note')).toContainText('En iPhone no puede avisarte con la app cerrada');
  await page.getByRole('switch').click();
  await page.getByRole('button', { name: 'Ahora no' }).last().click(); // refuses the consent sheet
  await page.waitForTimeout(700);
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('japan-trip:proximity-enabled'))).toBeNull();
});

test('after consent the card shows on any screen and "Marcar visitado" marks like by hand, once', async ({ page, context }) => {
  await open(page, context, { at: near(kodaiji), query: '?view=frases' });
  await turnOn(page);
  await expect(card(page)).toContainText('¿Estás en Kōdai-ji?');
  await expect(page.locator('#phrases-search')).toBeVisible(); // still on Frases: the card is global
  await card(page).getByRole('button', { name: 'Marcar visitado' }).click();
  await expect(card(page)).toHaveCount(0);
  expect(await visitedKyoto(page)).toContain('kodaiji');
  await expect(page.locator('.toast', { hasText: 'Marcado como visitado' })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(card(page)).toHaveCount(0); // visited: never offered again
});

test('"Ahora no" silences the place for the rest of the day and nothing is marked', async ({ page, context }) => {
  await open(page, context, { at: near(kodaiji) });
  await turnOn(page);
  await card(page).getByRole('button', { name: 'Ahora no' }).click();
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  expect(await visitedKyoto(page)).not.toContain('kodaiji');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('japan-trip:proximity-prompted')));
  expect(Object.keys(stored)).toEqual(['kyoto:kodaiji']);
  await page.reload();
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0); // still silent after a reload
});

test('the position is never written to storage', async ({ page, context }) => {
  await open(page, context, { at: near(kodaiji) });
  await turnOn(page);
  await expect(card(page)).toBeVisible();
  const dump = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(dump).not.toContain(String(kodaiji.lat).slice(0, 7));
  expect(dump).not.toContain(String(kodaiji.lng).slice(0, 8));
});

test('restaurants, the hotel and a poor GPS fix never trigger a card', async ({ page, context }) => {
  await open(page, context, { at: near(nishikiFood) });
  await turnOn(page);
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  await context.setGeolocation(near(hotel));
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  await context.setGeolocation(near(kodaiji, 10, 500)); // 500 m of uncertainty
  await page.waitForTimeout(900);
  await expect(card(page)).toHaveCount(0);
  await context.setGeolocation(near(kodaiji, 10, 15));
  await expect(card(page)).toContainText('Kōdai-ji');
});

test('with several places near, only the nearest is offered', async ({ page, context }) => {
  const sanjusangen = place('sanjusangen');
  const between = { latitude: sanjusangen.lat + 30 / 111195, longitude: sanjusangen.lng, accuracy: 10 };
  await open(page, context, { at: between });
  await turnOn(page);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toContainText('Sanjūsangen-dō');
});

test('a switch in the account panel turns it off again, and a blocked location is explained', async ({ page, context }) => {
  await open(page, context, { at: near(kodaiji) });
  await turnOn(page);
  await expect(card(page)).toBeVisible();
  await page.locator('#account-button').click();
  await page.getByRole('switch', { name: /activados/ }).click();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('japan-trip:proximity-enabled'))).toBe('0');
});

test('blocked location permission shows an explanation in the panel', async ({ page, context }) => {
  await open(page, context, { granted: false });
  await turnOn(page);
  await page.waitForTimeout(600);
  await page.locator('#account-button').click();
  await expect(page.locator('.proximity-note')).toContainText('bloqueada la ubicación');
});
