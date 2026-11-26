import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, addTestCities } from './helpers.js';

// CSS viewport size, pixel density and touch are validated separately: a hi-res phone still has a
// narrow CSS viewport.
const devices = [
  { name: 'narrow phone', viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'hi-res phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }
];

for (const { name, viewport, deviceScaleFactor, isMobile, hasTouch } of devices) {
  test.describe(name, () => {
    test.use({ viewport, deviceScaleFactor, isMobile, hasTouch });

    test('layout, density and city tabs fit the screen', async ({ page }) => {
      await addTestCities(page, ['testville', 'second-city', 'third-city', 'fourth-city', 'fifth-city', 'sixth-city']);
      await page.goto('/');
      await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });

      expect(await page.evaluate(() => window.innerWidth)).toBe(viewport.width);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(deviceScaleFactor);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveCount(8); // Kioto, Osaka and the six fictional test cities
      const tablist = page.locator('#city-tabs');
      const first = await tabs.first().boundingBox();
      expect(first.height).toBeGreaterThanOrEqual(36);
      // Tabs scroll horizontally when they do not fit; the page itself never overflows.
      const { scrollWidth, clientWidth } = await tablist.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
      if (viewport.width < 700) expect(scrollWidth).toBeGreaterThan(clientWidth);
      await tabs.last().click();
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
      await expect(tabs.last()).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

      const mapBox = await page.locator('#city-map').boundingBox();
      expect(mapBox.width).toBeGreaterThan(0);
      expect(mapBox.width).toBeLessThanOrEqual(viewport.width);
      expect(mapBox.height).toBeGreaterThanOrEqual(300);
    });

    test('the detail sheet fits the viewport', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
      await page.locator(SVG_MARKERS).first().dispatchEvent('click');
      await page.getByRole('button', { name: 'Ver ficha del lugar' }).click();
      const sheet = await page.locator('.poi-detail').boundingBox();
      expect(sheet.x).toBeGreaterThanOrEqual(0);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(viewport.width);
      expect(sheet.y + sheet.height).toBeLessThanOrEqual(viewport.height);
    });
  });
}
