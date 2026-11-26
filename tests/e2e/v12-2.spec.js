import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, selectCity, citySelect } from './helpers.js';

const visitable = [...kyoto.places, ...kyoto.restaurants].filter((point) => point.type !== 'hotel');
const circles = kyoto.places.filter((point) => point.type !== 'hotel');
// markers are drawn in data order; the first place is the hotel, which cannot be ticked off
const firstVisitIndex = kyoto.places.findIndex((point) => point.type !== 'hotel');
const openPopup = (page, index = firstVisitIndex) => page.locator(SVG_MARKERS).nth(index).dispatchEvent('click');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('visited-v1') ?? '{}'));

test.describe('visited places', () => {
  test('mark a place from its marker, see the counter and keep it after reloading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect(page.locator('#visited-summary')).toHaveText(`0 de ${visitable.length} lugares visitados`);
    await openPopup(page);
    const button = page.locator('.popup-visit-button');
    await expect(button).toHaveText('Marcar como visitado');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(button).toContainText('Visitado');
    await expect(page.locator('#visited-summary')).toHaveText(`1 de ${visitable.length} lugares visitados`);
    expect(Object.values(await stored(page)).flat()).toHaveLength(1);
    await page.reload();
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect(page.locator('#visited-summary')).toHaveText(`1 de ${visitable.length} lugares visitados`);
  });

  test('a visited marker is faded and the "Pendientes" filter hides it (and the hotel)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await openPopup(page);
    await page.locator('.popup-visit-button').click();
    const opacities = await page.locator(SVG_MARKERS).evaluateAll((paths) => paths.map((path) => Number(getComputedStyle(path).fillOpacity)));
    expect(opacities.filter((value) => value < 0.5)).toHaveLength(1);
    await page.locator('[data-map-kind="pendientes"]').click();
    await expect(page.locator('#map-filter-status')).toContainText('pendientes de visitar');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(circles.length - 1);
    await page.locator('[data-map-kind="todos"]').click();
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
  });

  test('the place sheet has its own toggle that stays in sync with the marker and the counter', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await openPopup(page);
    await page.locator('.popup-detail-button').click();
    const toggle = page.locator('#poi-visited');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText('✓ Visitado');
    await expect(page.locator('#visited-summary')).toHaveText(`1 de ${visitable.length} lugares visitados`);
    await page.goBack();
    await openPopup(page);
    await expect(page.locator('.popup-visit-button')).toHaveAttribute('aria-pressed', 'true');
  });

  test('marks belong to their city: the same local id in another city is not marked', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('visited-v1', JSON.stringify({ osaka: ['fushimi'], kyoto: ['no-longer-exists'] })));
    await page.goto('/');
    await expect(page.locator('#visited-summary')).toHaveText(`0 de ${visitable.length} lugares visitados`);
  });

  test('corrupt saved data does not break the page', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('visited-v1', '{not json'));
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect(page.locator('#visited-summary')).toHaveText(`0 de ${visitable.length} lugares visitados`);
  });

  test('the full-screen map shows the counter in its title', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect(page.locator('#map-view-title')).toHaveText(`Mapa de Kioto · 0/${visitable.length}`);
  });
});

test.describe('grouped filters on the full-screen map', () => {
  test('active filters appear as chips, the button counts them and a chip removes its filter', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    const button = page.locator('#map-filters-button');
    await expect(button).toHaveText('Filtros');
    await button.click();
    await page.locator('#map-day-filters .map-filter').nth(1).click();
    await page.locator('[data-map-kind="restaurantes"]').click();
    await expect(button).toHaveText('Filtros (2)');
    const chips = page.locator('#map-active-filters .map-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(1)).toContainText('Solo restaurantes');
    await chips.nth(1).click();
    await expect(chips).toHaveCount(1);
    await expect(button).toHaveText('Filtros (1)');
    await chips.first().click();
    await expect(chips).toHaveCount(0);
    await expect(button).toHaveText('Filtros');
  });

  test('each filter group collapses on its own', async ({ page }) => {
    await page.goto('/?view=mapa');
    await page.locator('#map-filters-button').click();
    const groups = page.locator('#map-sheet .map-filter-group');
    await expect(groups).toHaveCount(2);
    await groups.first().locator('summary').click();
    await expect(page.locator('#map-day-filters')).toBeHidden();
    await expect(page.locator('[data-map-kind="restaurantes"]')).toBeVisible();
  });
});

test.describe('city selector', () => {
  test('the selector shows the current city and the list switches city without adding header controls', async ({ page }) => {
    await page.goto('/');
    await expect(citySelect(page)).toContainText('Kioto');
    await selectCity(page, 'Osaka');
    await expect(citySelect(page)).toContainText('Osaka');
    await expect(page).toHaveURL(/city=osaka/);
    await expect(page.locator('#city-menu')).toBeHidden(); // list closed after choosing
  });
});

test.describe('new version notice', () => {
  const newestVersion = (page, version) => page.route('**/data/version.json?fresh=*', (route) => route.fulfill({ json: { version, updated: '2099-01-01' } }));

  test('shows "Hay una versión nueva" when the deployed version is different, and "Más tarde" hides it', async ({ page }) => {
    await newestVersion(page, 'V99.0.0');
    await page.goto('/');
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#update-banner-text')).toContainText('V99.0.0');
    await page.locator('#update-later').click();
    await expect(page.locator('#update-banner')).toBeHidden();
  });

  test('stays quiet when the version is the same', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#update-version')).not.toHaveText('…');
    await page.waitForTimeout(2500);
    await expect(page.locator('#update-banner')).toBeHidden();
  });

  test('"Actualizar" reloads the page', async ({ page }) => {
    await newestVersion(page, 'V99.0.0');
    await page.goto('/');
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 10_000 });
    const reloaded = page.waitForEvent('load');
    await page.locator('#update-reload').click();
    await reloaded;
  });

  test('Viaje shows the version on screen and checks on demand, with plain messages', async ({ page }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('#update-version')).toHaveText(/^V\d+\.\d+\.\d+$/);
    await page.locator('#update-check').click();
    await expect(page.locator('#update-status')).toHaveText('Tienes la última versión.');
    await newestVersion(page, 'V99.0.0');
    await page.locator('#update-check').click();
    await expect(page.locator('#update-status')).toHaveText('Hay una versión nueva de la guía.');
  });

  test('without a connection the check says so and shows no banner', async ({ page, context }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('#update-version')).not.toHaveText('…');
    await context.setOffline(true);
    await page.locator('#update-check').click();
    await expect(page.locator('#update-status')).toContainText('Sin conexión');
    await expect(page.locator('#update-banner')).toBeHidden();
  });

  test('the banner sits above the bottom bar on a 320 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await newestVersion(page, 'V99.0.0');
    await page.goto('/');
    await expect(page.locator('#update-banner')).toBeVisible({ timeout: 10_000 });
    const [banner, bar] = await Promise.all([page.locator('#update-banner').boundingBox(), page.locator('#app-bar').boundingBox()]);
    expect(banner.y + banner.height).toBeLessThanOrEqual(bar.y);
    expect(banner.x).toBeGreaterThanOrEqual(0);
    expect(banner.x + banner.width).toBeLessThanOrEqual(320);
  });
});
