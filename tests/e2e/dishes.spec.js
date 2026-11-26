import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../../data/global/dishes.json', import.meta.url), 'utf8'));
const total = data.dishes.length;

test('the dishes section is global and shows every dish with names and ingredient badge', async ({ page }) => {
  await page.goto('/?view=platos');
  await expect(page.locator('.dish-card')).toHaveCount(total);
  await expect(page.locator('[data-view-target="platos"]')).toBeVisible();
  await expect(page.locator('#dishes-disclaimer')).toContainText('orientativa');
  const card = page.locator('.dish-card[data-dish-id="ramen"]');
  await expect(card.locator('.dish-ja')).toHaveText('ラーメン');
  await expect(card.locator('.dish-romaji')).toHaveText('rāmen');
  await expect(card.locator('.dish-es')).toHaveText('Ramen');
  await expect(card.locator('.dish-protein')).toContainText('carne');
  await expect(card.locator('img.dish-photo')).toHaveAttribute('src', /assets\/images\/dishes\/ramen-960\.webp/);
});

test('local dish photos load', async ({ page }) => {
  await page.goto('/?view=platos');
  const photo = page.locator('.dish-card[data-dish-id="onigiri"] img');
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('dishes without a photo show the Japanese name as a placeholder', async ({ page }) => {
  await page.goto('/?view=platos');
  const withoutPhoto = data.dishes.filter((dish) => dish.photos.length === 0);
  expect(withoutPhoto.length).toBeGreaterThan(0);
  const card = page.locator(`.dish-card[data-dish-id="${withoutPhoto[0].id}"]`);
  await expect(card.locator('.dish-photo.is-empty')).toHaveText(withoutPhoto[0].ja);
});

test('search by Japanese, romaji or Spanish plus category and ingredient filters', async ({ page }) => {
  await page.goto('/?view=platos');
  const search = page.locator('#dishes-search');
  await search.fill('たこ焼き');
  await expect(page.locator('.dish-card[data-dish-id="takoyaki"]')).toBeVisible();
  await search.fill('katsu');
  await expect(page.locator('.dish-card[data-dish-id="tonkatsu"]')).toBeVisible();
  await search.fill('zzzz');
  await expect(page.locator('.dish-card')).toHaveCount(0);
  await expect(page.locator('#dishes-empty')).toBeVisible();
  await search.fill('');
  await page.locator('#dishes-chips').getByRole('button', { name: 'Fideos' }).click();
  await expect(page.locator('.dish-card')).toHaveCount(data.dishes.filter(({ category }) => category === 'fideos').length);
  await page.locator('#dishes-protein').getByRole('button', { name: /Sin carne ni pescado/ }).click();
  await expect(page.locator('.dish-card')).toHaveCount(data.dishes.filter(({ category, protein }) => category === 'fideos' && protein === 'vegetariano').length);
});

test('list view and photo view can be switched', async ({ page }) => {
  await page.goto('/?view=platos');
  await expect(page.locator('#dishes-grid')).toHaveClass(/is-photos/);
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.locator('#dishes-grid')).toHaveClass(/is-list/);
  await page.getByRole('button', { name: 'Fotos' }).click();
  await expect(page.locator('#dishes-grid')).toHaveClass(/is-photos/);
});

test('favourite dishes persist after reloading', async ({ page }) => {
  await page.goto('/?view=platos');
  await page.locator('.dish-card[data-dish-id="udon"] .dish-fav').click();
  await page.reload();
  await page.locator('#dishes-chips').getByRole('button', { name: /Favoritos \(1\)/ }).click();
  await expect(page.locator('.dish-card')).toHaveCount(1);
  await page.locator('.dish-card .dish-fav').click();
  await expect(page.locator('#dishes-empty')).toContainText('Aún no tienes favoritos');
});

test('opening a dish shows it full screen with warning, credit and audio', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'ja-JP' }], cancel() {}, speak: (u) => window.__spoken.push(u.text), addEventListener() {} } });
  });
  await page.goto('/?view=platos');
  await page.locator('.dish-card[data-dish-id="okonomiyaki"] .dish-open').click();
  const sheet = page.locator('#dish-show');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.phrase-show-ja')).toHaveText('お好み焼き');
  await expect(sheet.locator('.dish-show-photo')).toBeVisible();
  await expect(sheet.locator('.dish-show-disclaimer')).toContainText('orientativa');
  await expect(sheet.locator('.dish-allergen').first()).toBeVisible();
  await expect(sheet.locator('.dish-credit a')).toHaveAttribute('href', /commons\.wikimedia\.org\/wiki\/File:/);
  await sheet.getByRole('button', { name: /Escuchar/ }).click();
  expect(await page.evaluate(() => window.__spoken)).toEqual(['お好み焼き']);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('photo credits are listed and the section fits a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?view=platos');
  await expect(page.locator('#dishes-credits-list li').first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
