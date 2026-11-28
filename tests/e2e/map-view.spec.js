import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS } from './helpers.js';

const mapButton = (page) => page.locator('[data-view-target="mapa"]');
const inView = (page, selector) => page.locator(`#view-mapa ${selector}`);
const openMap = async (page) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await mapButton(page).click();
  await expect(page.locator('#view-mapa')).toBeVisible();
};

test.describe('full-screen map view', () => {
  test('the centre button opens the map full screen with its own URL and Back returns to the guide', async ({ page }) => {
    await openMap(page);
    await expect(page).toHaveURL(/[?&]view=mapa/);
    await expect(mapButton(page)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#city-view')).toBeHidden();
    const [box, viewport] = [await page.locator('#city-map').boundingBox(), page.viewportSize()];
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
    expect(box.height).toBeGreaterThan(viewport.height * 0.6);
    await expect(inView(page, '#city-map')).toHaveCount(1);
    await expect(page.locator('#map-filters-button')).toHaveAccessibleName('Filtros');
    await expect(page.locator('#map-shown-pill')).toBeHidden(); // nothing filtered: only the round button
    await page.goBack();
    await expect(page.locator('#city-view')).toBeVisible();
    await expect(page.locator('#view-mapa')).toBeHidden();
    await expect(page.locator('#mapa #city-map')).toHaveCount(1); // the map is back inside the guide
    await expect(page.locator('#mapa .nearby-panel')).toHaveCount(1);
    await expect(page.locator('#mapa #map-filters')).toHaveCount(1);
  });

  test('the map shows the same markers and keeps working after a round trip', async ({ page }) => {
    await openMap(page);
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
    await page.locator('[data-view-target="frases"]').click();
    await mapButton(page).click();
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
    await expect(page.locator('#city-map .leaflet-tile-pane')).toBeAttached();
  });

  test('opening ?view=mapa directly works', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator('#view-mapa')).toBeVisible();
    await expect(inView(page, '#city-map')).toHaveCount(1);
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  });

  test('filters open in a bottom sheet, filter the map, and Back closes the sheet before leaving the map', async ({ page }) => {
    await openMap(page);
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const sheet = page.locator('#map-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('#map-filters')).toHaveCount(1);
    await sheet.locator('[data-map-kind="restaurantes"]').click();
    await expect(page.locator('#map-filter-status')).toContainText('Comida');
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page.locator('#view-mapa')).toBeVisible(); // still on the map
    await page.goBack();
    await expect(page.locator('#city-view')).toBeVisible();
  });

  test('Cerca de mí opens the nearby panel and Escape or Cerrar close the sheet', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 35.0116, longitude: 135.7681 });
    await openMap(page);
    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    const sheet = page.locator('#map-sheet');
    await expect(sheet.locator('.nearby-panel')).toBeVisible();
    await expect(page.locator('#nearby-list li').first()).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.locator('#map-sheet-close').click();
    await expect(sheet).toBeHidden();
  });

  test('the offline chip, theme button and "Guardar mapa" are reachable from the full-screen map', async ({ page }) => {
    await openMap(page);
    await expect(page.locator('#theme-button')).toBeVisible();
    await expect(page.locator('#map-offline-button')).toHaveAccessibleName('Mapa sin guardar');
    await page.locator('#map-offline-button').click();
    await expect(page.locator('#map-sheet #save-offline-map')).toBeVisible();
    await expect(page.locator('#map-sheet-title')).toHaveText('Mapa sin conexión');
  });

  test('a place opens as a bottom sheet over the map and closing it keeps you on the map', async ({ page }) => {
    await openMap(page);
    await page.locator(SVG_MARKERS).first().dispatchEvent('click');
    await page.locator('.popup-detail-button').first().click();
    const detail = page.locator('.poi-detail');
    await expect(detail).toBeVisible();
    const box = await detail.boundingBox();
    expect(box.y + box.height).toBeGreaterThanOrEqual(page.viewportSize().height - 2); // docked to the bottom
    expect(box.y).toBeGreaterThan(0); // the map is still visible above it
    await page.goBack();
    await expect(page.locator('.poi-modal')).toBeHidden();
    await expect(page.locator('#view-mapa')).toBeVisible();
  });

  test('the legend lives folded under the filters, each day chip shows its colour, and it goes back to the guide on leaving', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    const sheet = page.locator('#map-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#map-sheet-title')).toHaveText('Filtros');
    await expect(sheet.locator('#map-day-filters .map-filter-dot')).toHaveCount(kyoto.city.map.dayFilters.length + 1); // + Alternativas
    await expect(sheet.locator('#map-legend')).toBeHidden();
    await sheet.locator('#map-legend-summary').click();
    const entries = sheet.locator('#map-legend > span');
    for (const day of kyoto.city.map.dayFilters) await expect(entries.filter({ hasText: day.legend })).toHaveCount(1);
    for (const text of ['Diamante', 'Círculo', 'Hotel', 'ya visitado', 'ruta del día', 'ubicación GPS']) {
      await expect(entries.filter({ hasText: text })).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goBack();
    await expect(sheet).toBeHidden();
    await page.goBack();
    await expect(page.locator('#mapa .map-legend')).toHaveCount(1);
  });

  test('dark theme applies to the full-screen map and its sheet', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openMap(page);
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    expect(await page.locator('#map-sheet').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(22, 37, 46)');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.leaflet-tile-pane')).filter)).toContain('invert');
  });

  test('the bar stays below the map on a 320 px phone and the controls do not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    const [bar, canvas] = await Promise.all([page.locator('#app-bar').boundingBox(), page.locator('#city-map').boundingBox()]);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(bar.y + bar.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.locator('#map-sheet .map-filter').nth(1).click();
    await page.locator('#map-sheet [data-map-kind="restaurantes"]').click();
    await page.locator('#map-sheet [data-map-only="pendientes"]').click();
    await page.locator('#map-sheet-apply').click();
    await expect(page.locator('#map-shown-pill')).toBeVisible();
    for (const button of await page.locator('#view-mapa .map-fab:visible, #view-mapa .map-view-pill:visible, #view-mapa .leaflet-control-zoom a').all()) {
      const b = await button.boundingBox();
      expect(b.x + b.width).toBeLessThanOrEqual(320);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });
});

for (const width of [390, 320]) {
  for (const scheme of ['light', 'dark']) {
    test(`the zoom buttons are reachable, bottom right and clear of the filter controls, at ${width} px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.emulateMedia({ colorScheme: scheme });
      await openMap(page);
      for (const selector of ['.leaflet-control-zoom-in', '.leaflet-control-zoom-out']) {
        const button = page.locator(`#view-mapa ${selector}`);
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(40);
        expect(box.height).toBeGreaterThanOrEqual(40);
        // The element on top at the button's centre is the button itself, not a chip or the title.
        const topIsButton = await button.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return el === top || el.contains(top);
        });
        expect(topIsButton, `${selector} is covered`).toBe(true);
      }
      // A real click zooms the map: the tiles move to the next zoom level.
      // Highest tile level on the map: the old level's tiles can linger while the new ones load.
      const level = () => page.locator('#city-map .leaflet-tile-container').evaluateAll((containers) => {
        const levels = containers.map((el) => Number(el.querySelector('img')?.src.match(/\/tile\.openstreetmap\.org\/(\d+)\//)?.[1])).filter(Number.isFinite);
        return levels.length ? Math.max(...levels) : null;
      }).catch(() => null);
      // Zoom sits bottom right, under the cloud and «Cerca de mí», clear of the Filtros button and the pill.
      const [zoom, tools, filters] = await Promise.all([page.locator('#view-mapa .leaflet-control-zoom').boundingBox(), page.locator('#view-mapa .map-view-tools').boundingBox(), page.locator('#map-filters-button').boundingBox()]);
      expect(zoom.y).toBeGreaterThanOrEqual(tools.y + tools.height - 1);
      expect(zoom.y).toBeGreaterThan(filters.y + filters.height);
      expect(zoom.x + zoom.width).toBeLessThanOrEqual(width);
      // Leaflet ignores a zoom tap while the map is still fitting the city after opening: wait until it stands still.
      await expect(page.locator('#city-map')).not.toHaveClass(/leaflet-zoom-anim/);
      await expect.poll(async () => { const first = await level(); await page.waitForTimeout(300); return first !== null && first === await level(); }).toBe(true);
      const before = await level();
      await page.locator('#view-mapa .leaflet-control-zoom-in').click();
      if (before) await expect.poll(level).not.toBe(before);
    });
  }
}

test('"Guardar mapa" works from the full-screen map and keeps working after leaving it', async ({ page, context }) => {
  test.setTimeout(90_000);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await context.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/?view=mapa&tab=mapa');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await page.locator('#map-offline-button').click();
  const save = page.locator('#map-sheet #save-offline-map');
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(page.locator('#map-sheet #save-offline-status')).not.toBeEmpty();
  await page.keyboard.press('Escape');
  await page.locator('[data-view-target="guia"]').click();
  await expect(page.locator('#mapa #save-offline-map')).toBeVisible(); // the control is back in the guide
});
