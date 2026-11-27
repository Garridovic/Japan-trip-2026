import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, selectCity, citySelect } from './helpers.js';

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
  page.on('request', (request) => { const url = new URL(request.url()); if (!['127.0.0.1', 'tile.openstreetmap.org', 'api.open-meteo.com'].includes(url.hostname)) external.push(url.hostname); });
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  expect(external).toEqual([]);
});

test('the service worker is versioned: a new version installs a fresh cache and removes the old one', async ({ page, context }) => {
  await firstVisit(page, context);
  const before = (await page.evaluate(() => caches.keys())).filter((name) => name.startsWith('japan-guide-'));
  expect(before).toHaveLength(1);
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // someone is using the page, so it does not reload by itself onto the new worker
  // Publish "a new version": the worker file changes, as build:offline does on every deploy.
  await page.evaluate(() => navigator.serviceWorker.register('sw.js?v=testv2'));
  // The idle page reloads onto the new version by itself, which may interrupt a poll: just retry.
  await expect.poll(() => page.evaluate(() => caches.keys().then((keys) => keys.filter((key) => key.startsWith('japan-guide-')))).catch(() => null), { timeout: 30_000 }).toEqual(['japan-guide-testv2']);
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
    await expect(chip(page)).toContainText('Sin fotos grandes');
    await expect(popover(page)).toContainText('Guía guardada para usarla sin internet. Faltan las fotos grandes');
    await expect(popover(page).locator('#offline-facts')).toContainText('Copia guardada');
    await expect(popover(page).locator('#offline-facts')).toContainText('V');
    await expect(popover(page).locator('#offline-facts')).toContainText('Espacio usado');
    await expect(popover(page).locator('#offline-download-all')).toContainText(/Descargar fotos grandes \(≈ \d+ MB\)/);
    await popover(page).locator('#offline-download-all').click();
    await expect.poll(() => stateOf(page), { timeout: 60_000 }).toBe('ready');
    await expect(chip(page)).toHaveAttribute('data-tone', 'ok');
    await expect(chip(page)).toContainText('Funciona sin internet');
    await expect(popover(page)).toContainText('Todo guardado para usar sin internet');
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
    await expect(chip(page)).toContainText('Descarga incompleta');
    await expect(popover(page)).toContainText('La copia guardada está incompleta');
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
      expect(box.width).toBeLessThanOrEqual(170);
      expect(box.height).toBeGreaterThanOrEqual(36);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    }
    await expect(page.locator('#top-bar-title')).toBeVisible(); // Platos has no city tabs: the header shows the app name
    await expect(chip(page)).toContainText('Sin fotos HD'); // short text on a 320 px phone
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
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('favoritos y tus datos privados del viaje no se borran'); dialog.dismiss(); });
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
    await page.mouse.click(160, 20); // the dimmed background above the sheet
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

test.describe('chip text and layout', () => {
  test('the chip is a 44 px round cloud button that never overlaps the city selector at 320 px, and says its state in its accessible name', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await firstVisit(page, context);
    await expect(page.locator('#offline-chip')).toBeVisible();
    await expect.poll(() => page.locator('#offline-chip').getAttribute('data-state')).toBe('essentials');
    await expect(page.locator('.offline-chip-short')).toBeHidden();
    await expect(page.locator('.offline-chip-label')).toBeHidden();
    await expect(page.locator('#offline-chip')).toHaveAttribute('aria-label', /faltan las fotos grandes/);
    const tabs = await page.locator('#city-select').boundingBox();
    const chip = await page.locator('#offline-chip').boundingBox();
    expect(chip.width).toBe(44);
    expect(chip.height).toBe(44);
    expect(tabs.x + tabs.width).toBeLessThanOrEqual(chip.x + 1); // side by side, no overlap
    expect(chip.x + chip.width).toBeLessThanOrEqual(320);
    await expect(citySelect(page)).toContainText('Kioto');
    for (const id of ['#search-button', '#theme-button']) {
      const box = await page.locator(id).boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.width).toBe(44);
    }
  });

  test('the word "Básico" no longer appears anywhere in the interface', async ({ page, context }) => {
    await firstVisit(page, context);
    await page.locator('#offline-chip').click();
    expect(await page.locator('body').innerText()).not.toMatch(/básico/i);
  });
});

test('optional datasets that do not exist (a city without events.json) are skipped offline instead of breaking the city', async ({ page, context }) => {
  await firstVisit(page, context);
  await context.setOffline(true);
  const status = await page.evaluate(async () => (await fetch('data/cities/osaka/events.json')).status);
  expect(status).toBe(404);
  await page.goto('/?city=osaka');
  await expect(page.locator('#hero-title')).toHaveText('Osaka');
  await expect(page.locator('.quick-card')).toHaveCount(3);
});

test.describe('"Guardar mapa" control', () => {
  test.beforeEach(() => { test.setTimeout(90_000); }); // saving ~100 tiles one by one, politely, takes a while
  const save = (page) => page.locator('#save-offline-map');
  const statusText = (page) => page.locator('#save-offline-status');
  const loadedTiles = (page) => page.evaluate(() => [...document.querySelectorAll('#city-map img.leaflet-tile')].filter((img) => img.complete && img.naturalWidth > 0).length);

  /** Tile server stand-in: refuses everything until `state.up`, can fail some tiles, and can be slow. */
  async function tileServer(context, { up = false, delay = 0, failing = () => false } = {}) {
    const state = { up, delay, failing, requests: 0 };
    await context.route('**/tile.openstreetmap.org/**', async (route) => {
      state.requests += 1;
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (!state.up || state.failing(route.request().url())) return route.fulfill({ status: 503, body: 'down' });
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } });
    });
    return state;
  }
  async function ready(page) {
    // Tests-only hook (see pauseScale in map-offline.js): no polite 120 ms pause between tiles, the tile server stand-in has its own delay.
    await page.addInitScript(() => { window.__tilePauseScale = 0; });
    await page.goto('/?city=kyoto');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => cacheSize(page, 'japan-guide-'), { timeout: 30_000 }).toBeGreaterThan(100);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(save(page)).toBeVisible();
  }

  test('before saving it says how big the map is; saving shows progress and ends with what was stored', async ({ page, context }) => {
    const server = await tileServer(context, { up: true, delay: 40 });
    await ready(page);
    // The tiles the map happens to show are cached while browsing (and, on a slow CI machine, before the first check),
    // which would turn "sin guardar" into "a medias". Start from a really empty tile cache.
    // Tiles still in flight can land in the cache right after it is emptied, so empty it again until the status settles.
    await expect.poll(async () => {
      await page.evaluate(async () => { await caches.delete('japan-tiles-v1'); window.dispatchEvent(new Event('online')); });
      return (await statusText(page).textContent()) || '';
    }, { timeout: 15_000 }).toContain('Mapa sin guardar');
    await expect(statusText(page)).toContainText(/unas \d+ teselas \(≈ \d+ MB\) alrededor de Kioto/);
    await expect(save(page)).toHaveText(/⬇ Guardar mapa \(≈ \d+ MB\)/);
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    await expect(page.locator('#save-offline-progress')).toBeVisible();
    await expect(statusText(page)).toContainText(/Guardando el mapa… \d+\/\d+/);
    await expect(statusText(page)).toContainText('✓ Mapa guardado:', { timeout: 60_000 });
    await expect(statusText(page)).toContainText(/\(zoom 11–15, ≈ \d+ MB\)/);
    await expect(statusText(page)).toContainText('alrededor de Kioto');
    await expect(save(page)).toHaveAttribute('data-state', 'complete');
    await expect(page.locator('#save-offline-progress')).toBeHidden();
    expect(server.requests).toBeGreaterThan(20);
  });

  test('the saved map really shows offline at the default view, even though those tiles were never seen online', async ({ page, context }) => {
    const server = await tileServer(context, { up: false }); // the map first opens while the tile server refuses everything
    await ready(page);
    expect(await loadedTiles(page)).toBe(0);
    server.up = true;
    await save(page).click();
    await expect(statusText(page)).toContainText('✓ Mapa guardado:', { timeout: 60_000 });
    await context.setOffline(true);
    await page.goto('/?city=kyoto');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect.poll(() => loadedTiles(page), { timeout: 10_000 }).toBeGreaterThan(2);
    // The saved state is remembered after a reload and shown again.
    await expect(statusText(page)).toContainText('✓ Mapa guardado:');
  });

  test('failed tiles are reported, the rest is kept, and pressing again completes the map', async ({ page, context }) => {
    const server = await tileServer(context, { up: true, failing: (url) => /\/13\//.test(url) });
    await ready(page);
    await save(page).click();
    await expect(statusText(page)).toContainText(/No se pudieron guardar \d+ de \d+ teselas/, { timeout: 60_000 });
    await expect(statusText(page)).toContainText(/Guardadas: \d+/);
    await expect(save(page)).toHaveText('↻ Completar mapa');
    await expect(save(page)).toHaveAttribute('data-state', 'error');
    server.failing = () => false;
    await save(page).click();
    await expect(statusText(page)).toContainText('✓ Mapa guardado:', { timeout: 60_000 });
  });

  test('offline the button explains it needs a connection and does nothing', async ({ page, context }) => {
    const server = await tileServer(context, { up: true });
    await ready(page);
    await context.setOffline(true);
    await expect(save(page)).toBeDisabled();
    await expect(statusText(page)).toContainText(/Sin conexión: el mapa se podrá guardar|Con conexión podrás completarlo/);
    const before = server.requests;
    await save(page).click({ force: true }).catch(() => {});
    expect(server.requests).toBe(before);
    await context.setOffline(false);
    await expect(save(page)).toBeEnabled();
  });

  test('each city saves its own area (Osaka too), and on a 320 px phone the control, progress and result fit', async ({ page, context }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await tileServer(context, { up: true });
    await ready(page);
    const box = await save(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await selectCity(page, 'Osaka');
    await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'osaka');
    // the tiles seen while browsing are kept, but the city is not saved until you ask
    await expect(save(page)).not.toHaveAttribute('data-state', 'complete');
    await save(page).click();
    await expect(statusText(page)).toContainText('✓ Mapa guardado:', { timeout: 60_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await selectCity(page, 'Kioto');
    await expect(save(page)).not.toHaveAttribute('data-state', 'complete'); // Kioto was not saved: the control does not claim it was
  });
});
