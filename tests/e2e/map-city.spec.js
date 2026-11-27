import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kyoto, SVG_MARKERS } from './helpers.js';

const osakaPlaces = JSON.parse(readFileSync(new URL('../../data/cities/osaka/places.json', import.meta.url), 'utf8'));
const chip = (page) => page.locator('#map-city-button');
const openMap = async (page) => {
  await page.goto('/?view=mapa');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await expect(page.locator('#view-mapa')).toBeVisible();
};
const pick = async (page, name) => {
  await chip(page).click();
  await page.locator('#map-sheet .map-city-card', { hasText: name }).click();
};

test.describe('city switcher in the full-screen map', () => {
  test('a red chip with the current city sits under the search field and opens the «Ciudad» sheet', async ({ page }) => {
    await openMap(page);
    await expect(chip(page)).toBeVisible();
    await expect(chip(page)).toHaveAccessibleName('Ciudad: Kioto. Cambiar');
    await expect(page.locator('#map-search-input')).toHaveAttribute('placeholder', 'Buscar en Kioto…');
    const [field, box] = await Promise.all([page.locator('#map-search-field').boundingBox(), chip(page).boundingBox()]);
    expect(box.y).toBeGreaterThanOrEqual(field.y + field.height);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await chip(page).click();
    await expect(page.locator('#map-sheet-title')).toHaveText('Ciudad');
    const cards = page.locator('#map-sheet .map-city-card');
    await expect(cards).toHaveCount(5);
    await expect(cards.filter({ hasText: 'Kioto' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cards.filter({ hasText: 'Tokio' })).toContainText('8–10 dic · 18–22 dic · 2 estancias');
    await expect(cards.filter({ hasText: 'Kioto' })).toContainText('11–15 dic · 4 noches');
    for (const card of await cards.all()) expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(56);
    await expect(page.locator('#map-sheet-footer')).toBeHidden();
  });

  test('choosing a city changes the map and the guide without leaving the map, and Back returns to the previous city', async ({ page }) => {
    await openMap(page);
    await pick(page, 'Osaka');
    await expect(page).toHaveURL(/[?&]city=osaka/);
    await expect(page).toHaveURL(/[?&]view=mapa/);
    await expect(page.locator('#view-mapa')).toBeVisible();
    await expect(page.locator('#map-sheet')).toBeHidden();
    await expect(chip(page)).toHaveAccessibleName('Ciudad: Osaka. Cambiar');
    await expect(page.locator('#map-city-live')).toHaveText('Mapa de Osaka');
    await expect(page.locator('#map-search-input')).toHaveAttribute('placeholder', 'Buscar en Osaka…');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(osakaPlaces.length, { timeout: 20_000 });
    await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'osaka');
    await page.goBack(); // closes nothing: the sheet is already shut, so this is the city history entry
    await expect(page).toHaveURL(/[?&]city=kyoto|^(?!.*city=)/);
    await expect(chip(page)).toHaveAccessibleName('Ciudad: Kioto. Cambiar');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await expect(page.locator('#view-mapa')).toBeVisible();
  });

  test('search, filters, route and the open card are cleared when the city changes', async ({ page }) => {
    await openMap(page);
    await page.locator('#map-search-input').fill('fushimi');
    await expect(page.locator('#map-search-clear')).toBeVisible();
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.locator('#map-sheet .map-filter').nth(1).click();
    await expect(page.locator('#map-filters-count')).toBeVisible();
    await page.locator('#map-sheet-apply').click();
    await pick(page, 'Osaka');
    await expect(page.locator('#map-city-live')).toHaveText('Mapa de Osaka');
    await expect(page.locator('#map-search-input')).toHaveValue('');
    await expect(page.locator('#map-filters-count')).toBeHidden();
    await expect(page.locator('#map-card')).toBeHidden();
    await expect(page.locator('#map-route-button')).toHaveAttribute('aria-pressed', 'false');
  });

  test('picking the current city only closes the sheet', async ({ page }) => {
    await openMap(page);
    const url = page.url();
    await pick(page, 'Kioto');
    await expect(page.locator('#map-sheet')).toBeHidden();
    expect(page.url()).toBe(url);
  });

  test('if the city does not load, the map keeps its city, tells the user and the chip goes back', async ({ page }) => {
    await openMap(page);
    await page.route('**/data/cities/osaka/**', (route) => route.fulfill({ status: 500, body: 'no' }));
    await pick(page, 'Osaka');
    await expect(page.locator('.toast')).toContainText('No se ha podido abrir Osaka');
    await expect(chip(page)).toHaveAccessibleName('Ciudad: Kioto. Cambiar');
    await expect(page.locator('#view-mapa')).toBeVisible();
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
  });

  for (const width of [390, 320]) {
    for (const scheme of ['light', 'dark']) {
      test(`the chip and the sheet fit at ${width} px (${scheme}) with 44 px targets`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 700 });
        await page.emulateMedia({ colorScheme: scheme });
        await openMap(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const box = await chip(page).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(10 - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 10 + 1);
        expect(box.height).toBeGreaterThanOrEqual(44);
        const onTop = await chip(page).evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
        expect(onTop).toBe(true);
        await chip(page).click();
        const sheet = page.locator('#map-sheet');
        await expect(sheet).toBeVisible();
        expect(await sheet.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(scheme === 'dark' ? 'rgb(22, 37, 46)' : 'rgb(255, 255, 255)');
        const sheetBox = await sheet.boundingBox();
        expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(width + 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        for (const card of await page.locator('#map-sheet .map-city-card').all()) {
          await card.scrollIntoViewIfNeeded();
          const b = await card.boundingBox();
          expect(b.height).toBeGreaterThanOrEqual(56);
          expect(b.x + b.width).toBeLessThanOrEqual(width);
        }
      });
    }
  }
});
