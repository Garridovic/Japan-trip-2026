import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS } from './helpers.js';

// This is the only spec that lets the service worker run (see playwright.config.js).
test.use({ serviceWorkers: 'allow' });

// 1x1 transparent PNG used instead of real OpenStreetMap tiles.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const mockTiles = (context) => context.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }));

const cacheSize = (page, prefix) => page.evaluate(async (prefix) => {
  const name = (await caches.keys()).find((key) => key.startsWith(prefix));
  return name ? (await (await caches.open(name)).keys()).length : 0;
}, prefix);

async function firstVisit(page, context) {
  await mockTiles(context);
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => cacheSize(page, 'japan-guide-'), { timeout: 30_000 }).toBeGreaterThan(100);
  // The worker takes control of the page after the first load.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test('after the first visit the whole guide opens with no network at all', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await firstVisit(page, context);

  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await expect(page.locator('#offline-indicator')).toContainText('Sin conexión');
  await expect(page.locator('.quick-card')).toHaveCount(4);
  await expect(page.locator('#version-indicator')).toContainText('GUÍA · V');

  // Frases: search and show mode.
  await page.locator('[data-view-target="frases"]').click();
  await page.locator('#phrases-search').fill('gracias');
  await expect(page.locator('.phrase-card[data-phrase-id="arigato"]')).toBeVisible();
  await page.locator('.phrase-card[data-phrase-id="arigato"]').getByRole('button', { name: /Mostrar/ }).click();
  await expect(page.locator('.phrase-show-ja')).toHaveText('ありがとう');
  await page.keyboard.press('Escape');

  // Platos: data and photos come from the cache.
  await page.locator('[data-view-target="platos"]').click();
  await expect(page.locator('.dish-card')).toHaveCount(65);
  const photo = page.locator('.dish-card[data-dish-id="ramen"] img');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);

  // The place sheet and the map still work (Leaflet is served locally).
  await page.locator('[data-view-target="guia"]').click();
  await page.locator(SVG_MARKERS).first().dispatchEvent('click');
  await page.locator('.popup-detail-button').first().click();
  await expect(page.locator('#poi-modal')).toBeVisible();
  expect(errors).toEqual([]);
});

test('deep links and other views also load offline', async ({ page, context }) => {
  await firstVisit(page, context);
  await context.setOffline(true);
  await page.goto('/?view=platos');
  await expect(page.locator('.dish-card').first()).toBeVisible();
  await page.goto('/?view=frases&city=kyoto');
  await expect(page.locator('.phrase-card').first()).toBeVisible();
});

test('Leaflet is served from the site, not from a CDN', async ({ page, context }) => {
  const external = [];
  await mockTiles(context);
  page.on('request', (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'tile.openstreetmap.org'].includes(url.hostname)) external.push(url.hostname); });
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  expect(external).toEqual([]);
});

test('map tiles you have seen are kept for offline use, and the save button stores a small area', async ({ page, context }) => {
  await firstVisit(page, context);
  await expect.poll(() => cacheSize(page, 'japan-tiles-')).toBeGreaterThan(0);
  const before = await cacheSize(page, 'japan-tiles-');
  await page.locator('#save-offline-map').click();
  await expect(page.locator('#save-offline-status')).toContainText('Mapa guardado', { timeout: 60_000 });
  const after = await cacheSize(page, 'japan-tiles-');
  expect(after).toBeGreaterThan(before);
  expect(after).toBeLessThanOrEqual(700);
  // Offline, those tiles are served from the cache.
  await context.setOffline(true);
  const ok = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((key) => key.startsWith('japan-tiles-')));
    const [first] = await cache.keys();
    return (await fetch(first.url, { mode: 'cors' })).ok;
  });
  expect(ok).toBe(true);
});

test('the service worker is versioned: a new version installs a fresh cache and removes the old one', async ({ page, context }) => {
  await firstVisit(page, context);
  const before = (await page.evaluate(() => caches.keys())).filter((name) => name.startsWith('japan-guide-'));
  expect(before).toHaveLength(1);
  // Publish "a new version": the worker file changes, as build:offline does on every deploy.
  await page.evaluate(() => navigator.serviceWorker.register('sw.js?v=testv2'));
  await expect.poll(() => page.evaluate(() => caches.keys().then((keys) => keys.filter((key) => key.startsWith('japan-guide-')))), { timeout: 30_000 }).toEqual(['japan-guide-testv2']);
  // The page keeps working from the new cache.
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
});

test('?reset-offline unregisters the worker and clears the caches (recovery switch)', async ({ page, context }) => {
  await firstVisit(page, context);
  await page.goto('/?reset-offline');
  await expect(page).not.toHaveURL(/reset-offline/);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBeLessThanOrEqual(1);
  // After the reset a normal load registers it again and the guide still works online.
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
});

test('the manifest and icons are served so the guide can be installed', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await page.request.get(href)).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
});
