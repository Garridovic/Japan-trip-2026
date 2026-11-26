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
  await expect(page.locator('#offline-banner')).toBeVisible();
  await expect(page.locator('#offline-banner')).toContainText('Sin conexión');
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

test.describe('offline indicator in the header', () => {
  const chip = (page) => page.locator('#offline-chip');
  const popover = (page) => page.locator('#offline-popover');
  const stateOf = (page) => chip(page).getAttribute('data-state');

  test('the chip verifies the real cache and moves from installing to the essentials, then to everything', async ({ page, context }) => {
    await firstVisit(page, context);
    await expect(chip(page)).toBeVisible();
    // wifi cannot be detected here, so only the essentials are saved by themselves
    await expect.poll(() => stateOf(page)).toBe('essentials');
    await expect(chip(page)).toHaveAttribute('data-tone', 'partial');
    await chip(page).click();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page)).toContainText('Lo esencial está guardado');
    await expect(popover(page).locator('#offline-facts')).toContainText('Copia guardada');
    await expect(popover(page).locator('#offline-facts')).toContainText('V');
    await expect(popover(page).locator('#offline-facts')).toContainText('Espacio usado');
    await expect(popover(page).locator('#offline-download-all')).toContainText(/Descargar todo \(≈ \d+ MB\)/);
    await popover(page).locator('#offline-download-all').click();
    await expect.poll(() => stateOf(page), { timeout: 60_000 }).toBe('ready');
    await expect(chip(page)).toHaveAttribute('data-tone', 'ok');
    await expect(chip(page)).toContainText('Offline');
    await expect(popover(page)).toContainText('Todo guardado');
    await expect(popover(page).locator('#offline-download-all')).toBeHidden();
    const files = await popover(page).locator('#offline-facts').textContent();
    const [, have, total] = files.match(/Archivos(\d+) de (\d+)/);
    expect(have).toBe(total);
  });

  test('it notices an incomplete copy (not just an active worker) and the retry repairs it', async ({ page, context }) => {
    await firstVisit(page, context);
    await expect.poll(() => stateOf(page)).toBe('essentials');
    // Damage the saved copy: remove an app file and a small photo.
    await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith('japan-guide-'));
      const cache = await caches.open(name);
      for (const path of ['js/modules/phrases.js', 'assets/images/dishes/ramen-480.webp']) await cache.delete(new URL(path, location.href).href);
    });
    await chip(page).click(); // opening the popover re-checks the cache
    await expect.poll(() => stateOf(page)).toBe('incomplete');
    await expect(chip(page)).toHaveAttribute('data-tone', 'error');
    await expect(popover(page)).toContainText('Copia incompleta');
    await expect(popover(page)).toContainText('Faltan 2 archivos');
    await popover(page).locator('#offline-retry').click();
    await expect.poll(() => stateOf(page), { timeout: 30_000 }).toBe('essentials');
    expect(await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith('japan-guide-'));
      return Boolean(await (await caches.open(name)).match(new URL('js/modules/phrases.js', location.href).href));
    })).toBe(true);
  });

  test('"Comprobar ahora" re-checks the copy', async ({ page, context }) => {
    await firstVisit(page, context);
    await expect.poll(() => stateOf(page)).toBe('essentials');
    await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys()).find((key) => key.startsWith('japan-guide-')));
      await cache.delete(new URL('data/global/dishes.json', location.href).href);
    });
    await chip(page).click();
    await expect.poll(() => stateOf(page)).toBe('incomplete');
    await page.evaluate(async () => {
      const cache = await caches.open((await caches.keys()).find((key) => key.startsWith('japan-guide-')));
      await cache.put(new URL('data/global/dishes.json', location.href).href, await fetch('data/global/dishes.json'));
    });
    await popover(page).locator('#offline-verify').click();
    await expect.poll(() => stateOf(page)).toBe('essentials');
  });

  test('the chip is in the header of every view, small, and the banner coexists with it offline', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await firstVisit(page, context);
    for (const view of ['guia', 'frases', 'platos']) {
      await page.locator(`[data-view-target="${view}"]`).click();
      await expect(chip(page)).toBeVisible();
      const box = await chip(page).boundingBox();
      expect(box.y).toBeLessThan(60);
      expect(box.width).toBeLessThanOrEqual(120);
      expect(box.height).toBeGreaterThanOrEqual(36);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
    await expect(page.locator('#top-bar-title')).toBeVisible(); // Platos has no city tabs: the header shows the app name
    await context.setOffline(true);
    await expect(page.locator('#offline-banner')).toBeVisible();
    await expect(chip(page)).toBeVisible();
    const banner = await page.locator('#offline-banner').boundingBox();
    const bar = await page.locator('#app-bar').boundingBox();
    expect(banner.y + banner.height).toBeLessThanOrEqual(bar.y + 1);
    await context.setOffline(false);
    await expect(page.locator('#offline-banner')).toBeHidden(); // gone as soon as the network is back
  });

  test('the delete button asks for confirmation, then clears the offline data and reloads', async ({ page, context }) => {
    await firstVisit(page, context);
    await expect.poll(() => stateOf(page)).toBe('essentials');
    await page.evaluate(() => caches.open('zz-test-cache').then((cache) => cache.put('/x', new Response('x'))));
    await page.evaluate(() => { window.__sameDocument = true; });
    await chip(page).click();

    // Cancel: nothing is deleted.
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('favoritos no se borran'); dialog.dismiss(); });
    await popover(page).locator('#offline-reset').click();
    expect(await page.evaluate(() => caches.keys())).toContain('zz-test-cache');
    expect(await page.evaluate(() => window.__sameDocument)).toBe(true);

    // Accept: everything is deleted and the page reloads.
    page.once('dialog', (dialog) => dialog.accept());
    await Promise.all([page.waitForNavigation(), popover(page).locator('#offline-reset').click()]);
    expect(await page.evaluate(() => window.__sameDocument ?? false)).toBe(false);
    expect(await page.evaluate(() => caches.keys())).not.toContain('zz-test-cache');
    // The guide installs itself again afterwards (the full cycle: online, offline, reset, online).
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    await expect.poll(() => stateOf(page), { timeout: 30_000 }).toBe('essentials');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
  });

  test('the popover closes with Escape, Cerrar and a tap outside', async ({ page, context }) => {
    await firstVisit(page, context);
    await chip(page).click();
    await expect(popover(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toBeHidden();
    await chip(page).click();
    await popover(page).locator('#offline-close').click();
    await expect(popover(page)).toBeHidden();
    await chip(page).click();
    await page.locator('.app-bar').click({ position: { x: 5, y: 5 } });
    await expect(popover(page)).toBeHidden();
  });

  test('the chip stays hidden when the browser has no service worker support', async ({ page }) => {
    await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await page.goto('/');
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    expect(await page.evaluate(() => 'serviceWorker' in navigator)).toBe(false);
    await expect(page.locator('#offline-chip')).toBeHidden();
  });
});
