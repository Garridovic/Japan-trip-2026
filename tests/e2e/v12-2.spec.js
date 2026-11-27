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
    await page.locator('[data-map-only="pendientes"]').click();
    await expect(page.locator('#map-filter-status')).toContainText('Pendientes');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(circles.length - 1);
    await page.locator('[data-map-only="pendientes"]').click(); // a switch: the second tap turns it off
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



  test('the full-screen filters sheet shows the visited counter under its title', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await page.locator('#map-filters-button').click();
    await expect(page.locator('#map-sheet-sub')).toHaveText(`${kyoto.places.length + kyoto.restaurants.length} lugares · 0/${visitable.length} visitados`);
  });
});

test.describe('grouped filters on the full-screen map', () => {
  test('several filters at once only change the badge and one fixed pill; Restablecer clears them all', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    const total = kyoto.places.length + kyoto.restaurants.length;
    const button = page.locator('#map-filters-button');
    const badge = page.locator('#map-filters-count');
    const pill = page.locator('#map-shown-pill');
    await expect(button).toHaveAccessibleName('Filtros');
    await expect(badge).toBeHidden();
    await button.click();
    const days = page.locator('#map-day-filters .map-filter');
    await days.nth(1).click();
    await days.nth(2).click();
    await expect(days.nth(1)).toHaveAttribute('aria-pressed', 'true'); // several days stay chosen together
    await expect(days.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(days.first()).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-map-kind="visitas"]').click();
    await page.locator('[data-map-kind="restaurantes"]').click();
    await page.locator('[data-map-only="sellos"]').click();
    await expect(button).toHaveAccessibleName('Filtros, 5 activos');
    await expect(badge).toHaveText('5');
    await expect(button).toHaveClass(/is-filtered/);
    await expect(pill).toHaveText(new RegExp(`^\\d+ de ${total} lugares$`));
    const pillBox = await pill.boundingBox();
    expect(pillBox.height).toBeLessThanOrEqual(48); // one line, however many filters
    await expect(page.locator('#map-sheet-reset')).toBeVisible();
    await page.locator('#map-sheet-reset').click();
    await expect(button).toHaveAccessibleName('Filtros');
    await expect(pill).toBeHidden();
    await expect(days.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
    await expect(page.locator('#map-sheet-apply')).toHaveText(`Ver ${total} lugares`);
    await page.locator('#map-sheet-apply').click();
    await expect(page.locator('#map-sheet')).toBeHidden();
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
