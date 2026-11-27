import { test, expect } from '@playwright/test';
import { mockWeather } from './helpers.js';

const tokyo = (iso) => new Date(`${iso}+09:00`);

test.describe('V14.2 every stop of the route has a page', () => {
  test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const [id, title, range, hotel, zone] of [
    ['hakone', 'Hakone', '10–11 dic · 1 noche', 'Hakone Onsen Yuyado Yamanoshou', 'Sengokuhara'],
    ['nara', 'Nara', '17–18 dic · 1 noche', 'Yuzan apartment Sanjo', 'Sanjo-dori']
  ]) {
    test(`${title} shows dates, hotel, taxi, map and its first-version guide`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
      await mockWeather(page);
      await page.goto(`/?city=${id}`);
      await expect(page.locator('#hero-title')).toHaveText(title);
      await expect(page.locator('#hero-range')).toHaveText(range);
      await expect(page.locator('#hero-hotel')).toContainText(hotel);
      await expect(page.locator('#hero-hotel .taxi-button')).toBeVisible();
      await expect(page.locator('#hero-hotel a')).toHaveText('Cómo llegar');
      await expect(page.locator('#hero-subtitle')).toContainText(zone);
      await expect(page.locator('#city-map')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('Tokio has two stays that never mix: header, countdown and weather follow the chosen one', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/?city=tokyo');
    const chips = page.locator('#hero-stays .stay-chip');
    await expect(chips).toHaveText(['8–10 dic', '18–22 dic']);
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true'); // the next stay is the first one
    await expect(page.locator('#hero-range')).toHaveText('Estancia 1 de 2 · 8–10 dic · 2 noches');
    await expect(page.locator('#hero-status')).toHaveText('Faltan 11 días');
    await chips.nth(1).click();
    await expect(page.locator('#hero-range')).toHaveText('Estancia 2 de 2 · 18–22 dic · 4 noches');
    await expect(page.locator('#hero-status')).toHaveText('Faltan 21 días');
    const dates = await page.locator('#weather-strip .wd, #weather-strip [data-date]').evaluateAll((nodes) => nodes.map((node) => node.dataset.date).filter(Boolean));
    expect(dates.every((date) => date >= '2026-12-18' && date <= '2026-12-22')).toBe(true);
  });

  test('between the two Tokio stays the header already looks at the next one', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-14T10:00:00'));
    await mockWeather(page);
    await page.goto('/?city=tokyo');
    await expect(page.locator('#hero-range')).toContainText('Estancia 2 de 2');
  });
});
