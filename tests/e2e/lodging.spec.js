import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const lodging = JSON.parse(readFileSync(new URL('../../data/global/lodging.json', import.meta.url), 'utf8'));

test('the Viaje tab sits in the bottom bar and opens its own screen outside the city tabs', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('[data-view-target="viaje"]');
  await expect(button).toBeVisible();
  await expect(button).toContainText('Viaje');
  await button.click();
  await expect(page.locator('#view-viaje')).toBeVisible();
  await expect(page.locator('#city-view')).toBeHidden();
  await expect(page.locator('#city-tabs')).toBeHidden();
  await expect(page).toHaveURL(/view=viaje/);
  await expect(button).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#top-bar-title')).toBeVisible();
});

test('every stay is listed in chronological order with dates, nights, address and a maps link', async ({ page }) => {
  await page.goto('/?view=viaje');
  const cards = page.locator('.lodging-card');
  await expect(cards).toHaveCount(lodging.stays.length);
  await expect(cards.locator('h3')).toHaveText(lodging.stays.map(({ name }) => name));
  await expect(cards.locator('.lodging-city')).toHaveText(['Tokio', 'Hakone', 'Kioto', 'Osaka', 'Nara', 'Tokio']);
  const osaka = page.locator('.lodging-card[data-stay-id="osaka"]');
  await expect(osaka.locator('.lodging-dates')).toContainText('Mar 15 → Jue 17 dic');
  await expect(osaka.locator('.lodging-dates')).toContainText('2 noches');
  await expect(osaka.locator('.lodging-address')).toHaveText('Chuo-ku Nishi Shinsaibashi 1-10-24, Osaka 542-0086');
  await expect(osaka.locator('.lodging-note', { hasText: 'Cancelación' })).toContainText('Cancelación gratuita hasta el 8 de diciembre');
  await expect(osaka.getByRole('link', { name: /Google Maps/ })).toHaveAttribute('href', 'https://maps.app.goo.gl/ohmM1sY272qXbuhj7');
  await expect(page.locator('.lodging-card[data-stay-id="tokyo-1"] .lodging-dates')).toContainText('Mar 8 → Jue 10 dic');
  await expect(page.locator('#lodging-count')).toHaveText('6 alojamientos · 14 noches');
});

test('copy address puts the hotel name and address on the clipboard', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto('/?view=viaje');
  const button = page.locator('.lodging-card[data-stay-id="osaka"] .lodging-copy');
  await button.click();
  await expect(button).toHaveText('Dirección copiada ✓');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('The Bridge Hotel Shinsaibashi, Chuo-ku Nishi Shinsaibashi 1-10-24, Osaka 542-0086');
  await expect(button).toHaveText('Copiar dirección', { timeout: 5000 });
  await context.close();
});

test('the page says why there are no PINs or reservation numbers, and none is anywhere in the page data', async ({ page }) => {
  await page.goto('/?view=viaje');
  await expect(page.locator('#lodging-privacy')).toContainText('no incluye códigos de acceso, números de reserva ni pagos');
  const text = await page.locator('#view-viaje').innerText();
  expect(text).not.toMatch(/\bPIN\b|€|¥/);
});

test('the current stay is highlighted by Japan date', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-12-12T09:00:00+09:00') });
  await page.goto('/?view=viaje');
  await expect(page.locator('.lodging-card[data-stay-id="kyoto"]')).toHaveClass(/is-current/);
  await expect(page.locator('.lodging-card[data-stay-id="kyoto"] .lodging-status')).toHaveText('Ahora');
  await expect(page.locator('.lodging-card[data-stay-id="osaka"] .lodging-status')).toHaveText('Próximo');
  await expect(page.locator('.lodging-card[data-stay-id="tokyo-1"]')).toHaveClass(/is-past/);
});

test.describe('on a 320 px phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('cards fit, tap targets are 44 px and the five-button bar fits', async ({ page }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('.lodging-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const selector of ['.lodging-map', '.lodging-copy']) expect((await page.locator(selector).first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    const bar = await page.locator('#app-bar').boundingBox();
    expect(bar.width).toBeLessThanOrEqual(320);
    for (const button of await page.locator('.app-bar-button').all()) expect((await button.boundingBox()).width).toBeGreaterThanOrEqual(56);
    // the bar does not cover the last card
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = await page.locator('#lodging-privacy').boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
  });
});
