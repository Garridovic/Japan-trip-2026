import { test, expect } from '@playwright/test';
import { journey } from './helpers.js';

const watch = (page) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`); });
  return problems;
};

test.describe('no uncaught JS errors or 404s', () => {
  test('scrolling and section tabs raise no errors', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/');
    const tabs = page.locator('.nav-inner a[href^="#"]:visible');
    await expect(tabs.first()).toBeVisible();
    for (let i = 0; i < Math.min(4, await tabs.count()); i += 1) {
      await tabs.nth(i).click();
      await page.waitForTimeout(500);
    }
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(400);
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(400);
    expect(problems.filter((problem) => !problem.includes('tile.openstreetmap')), problems.join('\n')).toEqual([]);
  });

  for (const city of journey.cities.filter((item) => item.enabled)) {
    test(`loading ${city.id} and opening Viaje requests no missing files`, async ({ page }) => {
      const problems = watch(page);
      await page.goto(`/?city=${city.id}`);
      await expect(page.locator('#hero-title')).not.toBeEmpty();
      await page.locator('[data-view-target="viaje"]').click();
      await expect(page.locator('#consejos')).toBeVisible();
      expect(problems.filter((problem) => !problem.includes('tile.openstreetmap')), problems.join('\n')).toEqual([]);
    });
  }
});

test.describe('map legend sheet', () => {
  test('on a 320 px phone the whole legend is reachable and the hotel dot has an outline', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/?view=mapa');
    await page.getByRole('button', { name: 'Leyenda', exact: true }).click();
    const last = page.locator('#map-sheet #map-legend > span').last();
    await last.scrollIntoViewIfNeeded();
    const [box, sheet] = [await last.boundingBox(), await page.locator('#map-sheet').boundingBox()];
    expect(box.y + box.height).toBeLessThanOrEqual(sheet.y + sheet.height);
    const border = await page.locator('#map-legend .hotel-shape').evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).toBe('2px');
  });
});
