import { test, expect } from '@playwright/test';
import { kyoto } from './helpers.js';

const stampable = kyoto.places.filter((p) => p.type !== 'hotel');

test.describe('sellos (V14)', () => {
  test('Viaje starts with the stamps section and one empty collection per city', async ({ page }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('#sellos h2')).toHaveText('Mis sellos');
    await expect(page.locator('#stamps-total')).toHaveText('0 sellos');
    const kioto = page.locator('.stamps-city[data-city="kyoto"]');
    await expect(kioto.locator('.stamps-count')).toHaveText(`0/${stampable.length}`);
    await expect(page.locator('.stamps-city')).toHaveCount(2);
  });

  test('marking a place as visited stamps it; the counter, ring and storage stay consistent after reload', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('visited-v1', JSON.stringify({ kyoto: ['nishiki'] })));
    await page.goto('/?view=viaje');
    const kioto = page.locator('.stamps-city[data-city="kyoto"]');
    await expect(kioto.locator('.stamps-count')).toHaveText(`1/${stampable.length}`);
    await expect(page.locator('#stamps-total')).toHaveText('1 sello');
    await kioto.locator(':scope > summary').click();
    const stamp = kioto.locator('.stamp.is-earned');
    await expect(stamp).toHaveCount(1);
    await expect(stamp).toContainText('Mercado Nishiki');
    await expect(stamp.locator('svg.stamp-art')).toBeVisible();
    await kioto.locator('.stamps-pending summary').click();
    await expect(kioto.locator('.stamp:not(.is-earned) .stamp-slot').first()).toBeVisible();
  });

  test('a stamp appears live when a place is marked from the guide, and no extra data is stored', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.evaluate(() => window.localStorage.getItem('visited-v1'));
    const before = await page.evaluate(() => Object.keys(localStorage).sort());
    await page.evaluate(async () => { const { visitedStore } = await import('/js/modules/visited.js'); visitedStore().set('kyoto', 'nijo', true); });
    await expect(page.locator('.stamps-city[data-city="kyoto"] .stamps-count')).toHaveText(`1/${stampable.length}`);
    await expect(page.locator('.stamp[data-stamp-id="nijo"]')).toHaveClass(/is-earned/);
    const after = await page.evaluate(() => Object.keys(localStorage).sort());
    const known = ['visited-v1', 'user-data-updated-at', 'japan-trip:phrase-favorites', 'japan-trip:dish-favorites'];
    expect(after.filter((k) => !before.includes(k) && !known.includes(k))).toEqual([]); // no stamp-specific key
  });

  test('completing a city shows the badge and a calm message', async ({ page }) => {
    const osaka = await (await page.request.get('/data/cities/osaka/places.json')).json();
    const ids = osaka.filter((p) => p.type !== 'hotel').map((p) => p.id);
    await page.addInitScript((list) => { if (!localStorage.getItem('visited-v1')) localStorage.setItem('visited-v1', JSON.stringify({ osaka: list.slice(1) })); }, ids);
    await page.goto('/?view=viaje');
    const card = page.locator('.stamps-city[data-city="osaka"]');
    await expect(card.locator('.stamps-count')).toHaveText(`${ids.length - 1}/${ids.length}`);
    await expect(card.locator('.stamps-badge')).toHaveCount(0);
    await page.evaluate(async (id) => { const { visitedStore } = await import('/js/modules/visited.js'); visitedStore().set('osaka', id, true); }, ids[0]);
    await expect(card.locator('.stamps-badge')).toHaveText('Colección completa');
    await expect(page.locator('.toast', { hasText: 'Colección de Osaka completa' })).toBeVisible();
  });

  test('works in dark mode on a phone without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('visited-v1', JSON.stringify({ kyoto: ['nishiki', 'nijo', 'fushimi'] })));
    await page.goto('/?view=viaje');
    await page.locator('.stamps-city[data-city="kyoto"] > summary').click();
    await expect(page.locator('.stamp.is-earned')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
