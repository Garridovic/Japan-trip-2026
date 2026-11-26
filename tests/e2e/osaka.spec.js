import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { SVG_MARKERS, RESTAURANT_MARKERS, selectCity, citySelect } from './helpers.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../../data/cities/osaka/${file}.json`, import.meta.url), 'utf8'));
const places = read('places');
const restaurants = read('restaurants');
const visits = places.length;

test('Osaka is a real city tab, selected by ?city=osaka, with its own hero, hotel and map', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/?city=osaka');
  await expect(citySelect(page)).toContainText('Osaka');
  await expect(page.locator('#hero-title')).toHaveText('Osaka');
  await expect(page).toHaveTitle('Osaka · 15–17 diciembre 2026');
  await expect(page.locator('#hero-hotel')).toContainText('The Bridge Hotel Shinsaibashi');
  await expect(page.locator('#hero-hotel a')).toHaveAttribute('href', 'https://maps.app.goo.gl/ohmM1sY272qXbuhj7');
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'osaka');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visits, { timeout: 20_000 });
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(restaurants.length);
  await expect(page.locator('#poi-kicker')).toHaveText('GUÍA DE OSAKA');
  await expect(page.locator('body')).not.toContainText('Nishiki');
  expect(pageErrors).toEqual([]);
});

test('switching between Kioto and Osaka keeps both complete and isolated', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
  await selectCity(page, 'Osaka');
  await expect(page).toHaveURL(/\?city=osaka$/);
  await expect(page.locator('#hero-title')).toHaveText('Osaka');
  await expect(page.locator('.quick-card')).toHaveCount(3);
  await expect(page.locator('.food-card')).toHaveCount(restaurants.length);
  await expect(page.locator('.sources li').first()).toBeAttached();
  await selectCity(page, 'Kioto');
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
  await expect(page.locator('#hero-hotel')).toContainText('Agora Kyoto Karasuma');
  await expect(page.locator('body')).not.toContainText('Dotonbori');
});

test("Victor's two Osaka days are rendered with their times, and suggestions are visible", async ({ page }) => {
  await page.goto('/?city=osaka');
  await expect(page.locator('.day-detail')).toHaveCount(3);
  const day15 = page.locator('#dia15');
  await expect(day15.locator('.stop .time')).toHaveText(['15:00–17:00', '17:00–17:30', '17:30–18:15', '18:15–18:45', '18:45–19:30', '19:30–21:00']);
  const day16 = page.locator('#dia16');
  await expect(day16.locator('.stop')).toHaveCount(12);
  await expect(day16.locator('.stop .time').first()).toHaveText('08:30–09:00');
  await expect(day16.locator('.stop .time').nth(11)).toHaveText('19:00 en adelante');
  await expect(day16.locator('.stop-suggestion').first()).toContainText('Sugerencia');
  await expect(day16.locator('.stop-suggestion', { hasText: 'Orden alternativo (no aplicado)' })).toHaveCount(1);
  await expect(day16.locator('.stop-suggestion', { hasText: 'Nakanoshima' })).toHaveCount(1);
  await expect(page.locator('#quick-note')).toContainText('plan de Victor');
});

test('the Kioto → Osaka connection is shown at the end of the Kioto itinerary', async ({ page }) => {
  await page.goto('/?city=kyoto');
  await expect(page.locator('.connection-card')).toContainText('Kioto → Osaka');
  await expect(page.locator('.connection-card')).toContainText('JR Special Rapid');
  await expect(page.locator('.connection-card')).toContainText('The Bridge Hotel Shinsaibashi');
});

test('a place sheet shows description, photos with credit data, sources and what is unverified', async ({ page }) => {
  await page.goto('/?city=osaka');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visits, { timeout: 20_000 });
  // Open the castle through the day-16 map filter and its marker popup.
  await page.getByRole('button', { name: '16 dic', exact: true }).first().click();
  const popupOpener = page.locator(SVG_MARKERS).first();
  await popupOpener.dispatchEvent('click');
  await page.locator('.popup-detail-button').first().click();
  await expect(page.locator('#poi-modal')).toBeVisible();
  await expect(page.locator('#poi-sources-section')).toBeVisible();
  await expect(page.locator('#poi-sources a').first()).toHaveAttribute('href', /^https:\/\//);
  await expect(page.locator('#poi-verification')).toBeVisible();
  await expect(page.locator('#poi-photo')).toHaveAttribute('src', /assets\/images\/osaka\//);
});

test('the extra visits are listed as optional with a clear verdict', async ({ page }) => {
  await page.goto('/?city=osaka');
  await expect(page.locator('.extra-card')).toHaveCount(2);
  await expect(page.locator('.extra-card', { hasText: 'Sumiyoshi Taisha' })).toContainText('No cabe el día 16');
  await expect(page.locator('.extra-card', { hasText: 'Nakanoshima' })).toContainText('Cabe');
  await expect(page.locator('#dia17')).toContainText('Borrador');
});

test('restaurant cards link to Google Maps, cite a source and flag approximate pins', async ({ page }) => {
  await page.goto('/?city=osaka');
  await expect(page.locator('.food-card')).toHaveCount(restaurants.length);
  const mizuno = page.locator('.food-card', { hasText: 'Okonomiyaki Mizuno' });
  await expect(mizuno.getByRole('link', { name: /Google Maps/ })).toHaveAttribute('href', /google\.com\/maps/);
  await expect(mizuno.getByRole('link', { name: /Global Labels Japan/ })).toBeVisible();
  await page.locator('.food-type-filter', { hasText: 'Oden' }).click();
  await expect(page.locator('.food-card:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.food-card:not([hidden])')).toContainText('Takoume');
});

test('Osaka works offline after the first visit', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  await page.goto('/?city=osaka');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visits, { timeout: 20_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => {
    const name = (await caches.keys()).find((key) => key.startsWith('japan-guide-'));
    return name ? (await (await caches.open(name)).keys()).length : 0;
  }), { timeout: 30_000 }).toBeGreaterThan(100);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.goto('/?city=osaka');
  await expect(page.locator('#hero-title')).toHaveText('Osaka');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visits, { timeout: 20_000 });
  await context.close();
});
