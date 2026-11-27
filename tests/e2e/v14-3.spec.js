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
    await expect(card.locator('.progress-tile', { hasText: 'Platos' })).toHaveClass(/tier-none/);
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

test.describe('V14.3.1 fixes', () => {
  test('the stamp goal is the same when a city is opened directly, and tile labels are never cut at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.clock.setFixedTime(tokyo('2026-12-08T12:00:00'));
    await mockWeather(page);
    const goals = [];
    for (const city of ['nara', 'hakone', 'kyoto', 'tokyo']) {
      await page.goto(`/?city=${city}`);
      const tile = page.locator('#progress-card .progress-tile', { hasText: 'Sellos' });
      await expect(tile).toBeVisible();
      goals.push(await tile.locator('b small').textContent());
    }
    expect(new Set(goals).size).toBe(1);
    expect(goals[0]).toBe('/18');
    await page.waitForTimeout(300);
    const cut = await page.locator('#progress-card .progress-tile span').evaluateAll((nodes) => nodes.filter((node) => { const probe = Object.assign(document.createElement('em'), { textContent: node.textContent }); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;display:inline-block'; node.append(probe); const full = probe.getBoundingClientRect().width; probe.remove(); return full > node.getBoundingClientRect().width; }).map((node) => node.textContent)) // measures the whole word, since ellipsis hides the overflow from scrollWidth;
    expect(cut).toEqual([]);
  });
});
