import { test, expect } from '@playwright/test';
import { mockWeather } from './helpers.js';

const tokyo = (iso) => new Date(`${iso}+09:00`);
test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe('V14.3 "Tu diario del viaje"', () => {
  test('before the trip it is about the preparations', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/?city=kyoto');
    const card = page.locator('#progress-card');
    await expect(card).toHaveAttribute('data-mode', 'before');
    await expect(card.locator('h2')).toHaveText('Preparativos');
    await expect(card).toContainText('días para salir');
    await expect(card.locator('.progress-tile', { hasText: 'Platos probados' })).toHaveClass(/tier-none/);
    await page.locator('#hero-viewport').evaluate((node) => node.scrollTo({ left: node.scrollWidth, behavior: 'instant' }));
    await expect(page.locator('#hero-dots i.on')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('during the trip visited places move the ring and the colour', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-12T10:00:00'));
    await mockWeather(page);
    await page.addInitScript(() => localStorage.setItem('visited-v1', JSON.stringify({ kyoto: ['nijo'] })));
    await page.goto('/?city=kyoto');
    const card = page.locator('#progress-card');
    await expect(card).toHaveAttribute('data-mode', 'during');
    await expect(card.locator('h2')).toHaveText(/^1 lugar en Kioto/);
    await expect(card.locator('.progress-ring')).toHaveClass(/tier-start/);
    await expect(card).toContainText('Día 5 de 15');
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('visited-v1'));
      raw.kyoto.push('fushimi');
      window.japanTripUserData.storage.setItem('visited-v1', JSON.stringify(raw));
    });
    await expect(card.locator('h2')).toHaveText(/^2 lugares en Kioto/);
  });

  test('"Lo probé": mark a dish, undo it, filter by tried, and it counts in the card', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/?view=platos');
    const first = page.locator('.dish-card').first();
    const tried = first.locator('.dish-tried');
    await expect(tried).toHaveText('🍴 Lo probé');
    await tried.click();
    await expect(page.locator('.toast-region')).toContainText('probado · 1 de');
    await expect(page.locator('#dishes-tried')).toContainText('Probados (1)');
    await page.locator('.toast-region').getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.locator('#dishes-tried')).toContainText('Probados (0)');
    await page.locator('.dish-card').first().locator('.dish-tried').click();
    await page.locator('#dishes-tried').click();
    await expect(page.locator('.dish-card')).toHaveCount(1);
    await expect(page.locator('.dish-card .dish-tried')).toHaveText('✓ Probado');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('japan-trip:dish-tried')).length)).toBe(1);
  });
});
