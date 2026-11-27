import { test, expect } from '@playwright/test';
import { mockWeather } from './helpers.js';

const tokyo = (iso) => new Date(`${iso}+09:00`);

test.describe('V14.1 header carousel and weather', () => {
  test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

  test('before the trip the header is compact: city, dates, countdown, hotel and the weather card', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    await expect(page.locator('#hero-range')).toHaveText('11–15 dic · 4 noches');
    await expect(page.locator('#hero-status')).toHaveText('Faltan 14 días');
    await expect(page.locator('#hero-hotel')).toContainText('Agora Kyoto Karasuma');
    await expect(page.locator('#hero-hotel .taxi-button')).toBeVisible();
    await expect(page.locator('#hero-hotel a')).toHaveText('Cómo llegar');
    await expect(page.locator('#today-card')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Abrir mapa interactivo' })).toHaveCount(0);
    await expect(page.locator('#hero-dots i')).toHaveCount(2);
    expect((await page.locator('.hero').boundingBox()).height).toBeLessThan(360);
  });

  test('the weather card lists the trip days and keeps working with the forecast stored when offline', async ({ page, context }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    const days = page.locator('#weather-strip .wd');
    await expect(days).toHaveCount(5);
    await expect(days.first()).toContainText('Vie 11');
    await expect(days.nth(1)).toContainText('11°');
    await expect(page.locator('#weather-note')).toContainText('actualizado');
    expect(await page.evaluate(() => Boolean(localStorage.getItem('weather-v1:kyoto')))).toBe(true);
    expect(await page.evaluate(() => (window.japanTripUserData.snapshot().data['weather-v1:kyoto'] ?? null))).toBeNull();
    await mockWeather(page, { fail: true }); // the service is unreachable now
    await page.reload();
    await expect(page.locator('#weather-strip .wd').nth(1)).toContainText('11°');
  });

  test('tapping a day opens the hourly sheet; days change with the chips and the sheet closes with Esc and Back', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await page.locator('#weather-strip .wd[data-date="2026-12-12"]').click();
    const sheet = page.locator('#weather-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#weather-sheet-title')).toHaveText('Sábado 12 dic · Kioto');
    await expect(page.locator('#weather-hours .wh')).toHaveCount(6);
    await expect(page.locator('#weather-facts')).toContainText('Amanece 06:56');
    await page.locator('.wchip', { hasText: 'Lun 14' }).click();
    await expect(page.locator('#weather-sheet-title')).toHaveText('Lunes 14 dic · Kioto');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.locator('#weather-strip .wd[data-date="2026-12-12"]').click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/$|\/\?/);
  });

  test('days beyond the forecast say so instead of showing invented numbers', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":true}' }));
    await page.goto('/');
    await expect(page.locator('#weather-strip .wd.is-empty')).toHaveCount(5);
    await expect(page.locator('#weather-strip .wd.is-empty').first()).toContainText('aún no');
    await expect(page.locator('#weather-strip .wd button, #weather-strip button.wd')).toHaveCount(0);
  });

  test('during the trip the header opens on "Ahora" and the weather highlights today', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-12T10:40:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#hero-status')).toHaveText('Día 2 de 4');
    await expect(page.locator('#today-card')).toBeVisible();
    await expect(page.locator('#today-card')).toContainText('Kiyomizu-dera');
    await expect(page.locator('#hero-dots i')).toHaveCount(3);
    await expect(page.locator('#weather-strip .wd.is-today')).toContainText('Sáb 12');
    await page.locator('#hero-viewport').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#hero-dots i').nth(1)).toHaveClass('on');
  });

  test('works on 320 px phones in dark mode with no horizontal scroll, and the sign-in invite lives in Viaje', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#weather-strip .wd')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#weather-strip .wd').first().click();
    const box = await page.locator('#weather-sheet').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await expect(page.locator('#hero .account-invite, .hero .account-invite')).toHaveCount(0);
  });
});
