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
    await expect(page.locator('#map-view-title')).toHaveText(/Mapa de Kioto/);
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
    await expect(page.locator('#map-filter-status')).toContainText('restaurantes');
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
    await page.getByRole('button', { name: 'Sin conexión' }).click();
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
    for (const button of await page.locator('.map-view-button').all()) {
      const b = await button.boundingBox();
      expect(b.x + b.width).toBeLessThanOrEqual(320);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });
});
