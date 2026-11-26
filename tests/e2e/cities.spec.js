import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, RESTAURANT_MARKERS, addTestCities } from './helpers.js';

// These tests add fictional cities through network interception, so the multi-city behaviour is
// verified without publishing any invented content. The fictional city reuses the place id "fushimi".

const visitCount = kyoto.places.length;

test('city tabs switch the whole context and Kyoto is restored intact', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await addTestCities(page, ['testville']);
  await page.goto('/');

  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveText(['Kioto', 'Testville']);
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });

  await page.getByRole('tab', { name: 'Testville' }).click();
  await expect(page).toHaveURL(/\?city=testville$/);
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'testville');
  await expect(page.locator('#hero-title')).toHaveText('Testville');
  await expect(page).toHaveTitle('Testville · ciudad de prueba');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(2);
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(0);
  await expect(page.locator('#poi-kicker')).toHaveText('GUÍA DE TESTVILLE');
  // Nothing from Kyoto leaks into the other city.
  await expect(page.locator('.food-card')).toHaveCount(0);
  await expect(page.locator('#comer')).toBeHidden();
  await expect(page.locator('#alternativas')).toBeHidden();
  await expect(page.locator('.quick-card')).toHaveCount(1);
  await expect(page.locator('#hero-hotel')).toContainText('Testville Hotel');
  await expect(page.locator('body')).not.toContainText('Nishiki');
  await expect(page.locator('.connection-card')).toHaveCount(0);
  await expect(page.locator('.map-filter')).toHaveText(['Todos los días', '20 dic']);
  // Global content is shown once, in every city.
  await expect(page.locator('#notes-grid .note-card')).toHaveCount(4);

  await page.getByRole('tab', { name: 'Kioto' }).click();
  await expect(page).toHaveURL(/\?city=kyoto$/);
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount);
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(kyoto.restaurants.length);
  await expect(page.locator('.food-card')).toHaveCount(kyoto.restaurants.length);
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
  expect(pageErrors).toEqual([]);
});

test('a shared place id resolves the details of the active city only', async ({ page }) => {
  await addTestCities(page, ['testville']);
  await page.goto('/?city=testville');
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'testville');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(2);

  // Two markers: "fushimi" (shared id) and "second". Open each through its popup.
  await page.locator(SVG_MARKERS).first().dispatchEvent('click');
  await page.getByRole('button', { name: 'Ver ficha del lugar' }).click();
  await expect(page.locator('#poi-title')).toHaveText('Testville Tower');
  await expect(page.locator('#poi-description')).toHaveText('Descripción exclusiva de Testville');
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: 'Kioto' }).click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount);
  const fushimi = kyoto.places.find(({ id }) => id === 'fushimi');
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: fushimi.lat, longitude: fushimi.lng });
  await page.locator('#locate-me').click();
  await page.locator('#nearby-list button', { hasText: fushimi.name }).first().click();
  await expect(page.locator('#poi-title')).toHaveText(fushimi.name);
  await expect(page.locator('#poi-description')).not.toContainText('Testville');
});

test('switching city resets the map filters', async ({ page }) => {
  await addTestCities(page, ['testville']);
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.getByRole('button', { name: 'Solo restaurantes' }).click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Testville' }).click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Todos los puntos' })).toHaveAttribute('aria-pressed', 'true');
});

test('browser back and forward follow the selected city', async ({ page }) => {
  await addTestCities(page, ['testville']);
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.getByRole('tab', { name: 'Testville' }).click();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'testville');
  await page.goBack();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
  await expect(page.getByRole('tab', { name: 'Kioto' })).toHaveAttribute('aria-selected', 'true');
  await page.goForward();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'testville');
});

test('tabs are keyboard accessible', async ({ page }) => {
  await addTestCities(page, ['testville']);
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.getByRole('tab', { name: 'Kioto' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Testville' })).toBeFocused();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'testville');
  await page.keyboard.press('Home');
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
});

for (const [label, url] of [
  ['a disabled city (Osaka)', '/?city=osaka'],
  ['an unknown city', '/?city=atlantis'],
  ['a path-traversal attempt', '/?city=..%2F..%2Fetc']
]) {
  test(`${label} in the URL falls back to a valid city and reports it`, async ({ page }) => {
    const warnings = [];
    page.on('console', (message) => { if (message.type() === 'warning') warnings.push(message.text()); });
    const requested = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto(url);
    await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
    expect(warnings.some((text) => text.includes('[journey]'))).toBe(true);
    expect(requested.some((address) => /data\/cities\/(osaka|atlantis|\.\.)/.test(address))).toBe(false);
  });
}

test('a city whose data fails to load shows an error without breaking the tabs', async ({ page }) => {
  await addTestCities(page, ['testville']);
  await page.route('**/data/cities/testville/places.json', (route) => route.fulfill({ status: 500, body: 'boom' }));
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.getByRole('tab', { name: 'Testville' }).click();
  await expect(page.locator('#app-status')).toContainText('No se han podido cargar');
  await page.getByRole('tab', { name: 'Kioto' }).click();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
  await expect(page.locator('#app-status')).toBeHidden();
});

test('only the active city datasets are downloaded', async ({ page }) => {
  await addTestCities(page, ['testville']);
  const requested = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  expect(requested.some((address) => address.includes('/data/cities/testville/'))).toBe(false);
  expect(requested.some((address) => address.includes('/data/cities/kyoto/places.json'))).toBe(true);
});
