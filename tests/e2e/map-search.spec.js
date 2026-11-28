import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS } from './helpers.js';

const DIM = '#city-map .is-search-dim';
const input = (page) => page.locator('#map-search-input');
const rows = (page) => page.locator('#map-search-drop .map-search-row-item');
const openMap = async (page) => {
  await page.goto('/?view=mapa');
  await expect(page.locator('#view-mapa')).toBeVisible();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
};
const total = () => kyoto.places.length + kyoto.restaurants.length; // every point of the map without filters

test.describe('map search', () => {
  test('typing a category lists the best matches, highlights them on the map and fades the rest', async ({ page }) => {
    await openMap(page);
    await input(page).fill('templo');
    await expect(page.locator('#map-search-drop')).toBeVisible();
    expect(await rows(page).count()).toBeLessThanOrEqual(4);
    await expect(page.locator('#map-search-drop .map-search-foot')).toContainText('en el mapa');
    await expect(page.locator('#map-search-count')).toContainText(/\d+ de \d+ lugares/);
    await expect(page.locator(DIM).first()).toBeAttached();
    const dimmed = await page.locator(DIM).count();
    const [hits, shown] = (await page.locator('#map-search-count').innerText()).match(/(\d+) de (\d+)/).slice(1).map(Number);
    expect(shown).toBe(total());
    expect(dimmed).toBe(shown - hits); // every shown point that does not match is faded, none is removed
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
  });

  test('a misspelled Japanese name still finds the place and Enter opens its card', async ({ page }) => {
    await openMap(page);
    await input(page).fill('ryouanji');
    await expect(rows(page).first()).toContainText('Ryoan-ji');
    await input(page).press('Enter');
    await expect(page.locator('#map-card')).toBeVisible();
    await expect(page.locator('#map-card-body')).toContainText('Ryoan-ji');
    await expect(page.locator('#map-search-drop')).toBeHidden();
    await expect(page.locator('#map-search-count')).toContainText('1 de');
  });

  test('a row of the list opens its place; the ✕, the pill and Escape clear the search', async ({ page }) => {
    await openMap(page);
    await input(page).fill('kinkakugi');
    await rows(page).first().click();
    await expect(page.locator('#map-card-body')).toContainText('Kinkaku-ji');
    await page.locator('#map-search-count').click();
    await expect(page.locator('#map-search-count')).toBeHidden();
    await expect(input(page)).toHaveValue('');
    await expect(page.locator(DIM)).toHaveCount(0);
    await input(page).fill('templo');
    await expect(page.locator('#map-search-clear')).toBeVisible();
    await input(page).press('Escape'); // first closes the list…
    await expect(page.locator('#map-search-drop')).toBeHidden();
    await expect(input(page)).toHaveValue('templo');
    await input(page).press('Escape'); // …then clears
    await expect(input(page)).toHaveValue('');
    await expect(page.locator(DIM)).toHaveCount(0);
  });

  test('no results: the map keeps its normal look and a message offers to clear', async ({ page }) => {
    await openMap(page);
    await input(page).fill('xqzjkwv');
    await expect(page.locator('#map-search-drop')).toContainText('Nada para «xqzjkwv»');
    await expect(page.locator(DIM)).toHaveCount(0);
    await expect(page.locator('#map-search-count')).toBeHidden();
    await page.getByRole('button', { name: 'Quitar búsqueda' }).first().click();
    await expect(input(page)).toHaveValue('');
    await expect(page.locator('#map-search-drop')).toBeHidden();
  });

  test('the search only covers the points the filters show and says what the filters hide', async ({ page }) => {
    await openMap(page);
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.locator('#map-sheet [data-map-kind="restaurantes"]').click();
    await page.locator('#map-sheet-close').click();
    await input(page).fill('kinkakuji');
    await expect(page.locator('#map-search-drop')).toContainText('Nada para');
    await expect(page.locator('#map-search-drop')).toContainText('ocultos por tus filtros');
    await page.getByRole('button', { name: 'Incluirlos' }).click();
    await expect(rows(page).first()).toContainText('Kinkaku-ji');
  });

  test('leaving the map clears the search so the guide map is never left faded', async ({ page }) => {
    await openMap(page);
    await input(page).fill('templo');
    await expect(page.locator(DIM).first()).toBeAttached();
    await page.locator('[data-view-target="frases"]').click();
    await page.locator('[data-view-target="mapa"]').click();
    await expect(input(page)).toHaveValue('');
    await expect(page.locator(DIM)).toHaveCount(0);
  });

  test('touch targets and margins hold at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openMap(page);
    await input(page).fill('templo');
    await expect(page.locator('#map-search-count')).toBeVisible();
    for (const selector of ['#map-search-field', '#map-filters-button', '#map-search-clear', '#map-search-drop .map-search-row-item', '#map-search-drop .map-search-foot', '#map-search-count']) {
      const box = await page.locator(selector).first().boundingBox();
      expect(box.height, selector).toBeGreaterThanOrEqual(43.5);
    }
    const field = await page.locator('#map-search-field').boundingBox();
    expect(field.x).toBeGreaterThanOrEqual(9.5);
    expect(field.width).toBeGreaterThan(180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await input(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
});

test.describe('map search with a notice banner', () => {
  const withNotice = async (page, width) => {
    await page.setViewportSize({ width, height: 700 });
    await page.addInitScript(() => { localStorage.setItem('notices-enabled', '1'); localStorage.setItem('notices-cache', JSON.stringify([{ id: 'n1', tipo: 'aviso', titulo: 'Aviso de prueba', texto: 'Texto del aviso para comprobar que no tapa el buscador.', caduca: 0 }])); });
    await page.route('https://japon-avisos.garridovic.workers.dev/avisos', (route) => route.abort());
    await openMap(page);
    await expect(page.locator('#app-notice')).toBeVisible();
  };
  for (const width of [390, 320]) {
    test(`the banner and the search field never overlap at ${width} px, and the map moves back when the notice is closed`, async ({ page }) => {
      await withNotice(page, width);
      const notice = await page.locator('#app-notice').boundingBox();
      await expect.poll(async () => (await page.locator('#view-mapa').boundingBox()).y).toBeGreaterThanOrEqual(notice.y + notice.height - 1);
      const field = await page.locator('#map-search-field').boundingBox();
      expect(field.y).toBeGreaterThanOrEqual(notice.y + notice.height);
      // Nothing of the banner is under the field at the field's centre.
      const onTop = await page.locator('#map-search-input').evaluate((el) => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
      expect(onTop).toBe(true);
      await input(page).fill('kinkakuji');
      await expect(page.locator('#map-search-drop .map-search-foot')).toHaveText('Ver en el mapa'); // singular
      await page.locator('#app-notice').getByRole('button', { name: 'Entendido' }).click();
      await expect(page.locator('#app-notice')).toBeHidden();
      await expect.poll(async () => (await page.locator('#view-mapa').boundingBox()).y).toBeLessThan(notice.y + 2);
    });
  }
});
