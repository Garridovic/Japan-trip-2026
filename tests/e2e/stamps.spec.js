import { test, expect } from '@playwright/test';

test.describe('sellos (V14)', () => {
  test('the book starts empty and lists only places with a real stamp', async ({ page }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('#sellos h2')).toHaveText('Mis sellos');
    await expect(page.locator('#stamps-total')).toHaveText('0 sellos');
    await expect(page.locator('#stamps-verified')).toContainText('Aquí hay sello real en 18 lugares');
    const options = page.locator('#stamp-place option');
    await expect(options).toHaveCount(19); // "Sin lugar" + 18
    await expect(page.locator('#stamp-place option', { hasText: 'Castillo Nijō' })).toHaveCount(0);
    await expect(page.locator('#stamp-place option', { hasText: 'Kinkaku-ji' })).toHaveText(/Aquí hay sello real/);
  });

  test('add a stamp with a label and a place, undo removing it, and it survives a reload', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('#stamp-label').fill('Dorado');
    await page.locator('#stamp-place').selectOption({ label: 'Kinkaku-ji · Aquí hay sello real' });
    await page.locator('#stamp-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#stamps-total')).toHaveText('1 sello');
    await expect(page.locator('.stamp .stamp-name')).toHaveText('Dorado');
    await page.reload();
    await expect(page.locator('.stamp')).toHaveCount(1);
    await page.locator('.stamp-remove').click();
    await expect(page.locator('.stamp')).toHaveCount(0);
    await page.locator('.toast button', { hasText: 'Deshacer' }).click();
    await expect(page.locator('.stamp')).toHaveCount(1);
  });

  test('"Ver dónde hay sellos en el mapa" opens the map filtered to «Sellos»', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('#stamps-map').click();
    await expect(page.locator('[data-map-only="sellos"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#map-filters-button')).toHaveAccessibleName('Filtros, 1 activo');
  });

  test('works in dark mode on a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/?view=viaje');
    await page.locator('#stamp-label').fill('Un sello con un nombre bastante largo para probar');
    await page.locator('#stamp-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('.stamp')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
