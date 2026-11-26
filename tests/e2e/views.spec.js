import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS } from './helpers.js';

const bar = (page) => page.locator('#app-bar');
const button = (page, view) => page.locator(`[data-view-target="${view}"]`);

test('the bottom bar has Guía, Frases and Platos and starts on the guide', async ({ page }) => {
  await page.goto('/');
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).getByRole('button')).toHaveText([/Guía/, /Frases/, /Platos/]);
  await expect(button(page, 'guia')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#city-view')).toBeVisible();
  await expect(page.locator('#view-frases')).toBeHidden();
  await expect(page.locator('#view-platos')).toBeHidden();
});

test('each button opens its own screen and the city tabs only show in the guide', async ({ page }) => {
  await page.goto('/');
  await button(page, 'frases').click();
  await expect(page.locator('#view-frases')).toBeVisible();
  await expect(page.locator('#city-view')).toBeHidden();
  await expect(page.locator('#city-tabs')).toBeHidden();
  await expect(button(page, 'frases')).toHaveAttribute('aria-current', 'page');
  await expect(button(page, 'guia')).not.toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/view=frases/);
  await button(page, 'platos').click();
  await expect(page.locator('#view-platos')).toBeVisible();
  await expect(page.locator('#view-frases')).toBeHidden();
  await button(page, 'guia').click();
  await expect(page.locator('#city-view')).toBeVisible();
  await expect(page.locator('#city-tabs')).toBeVisible();
  await expect(page).not.toHaveURL(/view=/);
});

test('the bar stays visible while scrolling and does not cover the end of the page', async ({ page }) => {
  await page.goto('/?view=platos');
  await expect(page.locator('.dish-card').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar(page)).toBeVisible();
  const barBox = await bar(page).boundingBox();
  const lastBox = await page.locator('#dishes-credits').boundingBox();
  const viewport = page.viewportSize();
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y + 1);
});

test('buttons are big enough to tap with a thumb', async ({ page }) => {
  await page.goto('/');
  for (const view of ['guia', 'frases', 'platos']) {
    const box = await button(page, view).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(64);
  }
});

test('opening a view from the URL works and the back button returns to the guide', async ({ page }) => {
  await page.goto('/?view=frases');
  await expect(page.locator('#view-frases')).toBeVisible();
  await expect(page.locator('.phrase-card').first()).toBeVisible();
  await button(page, 'guia').click();
  await expect(page.locator('#city-view')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#view-frases')).toBeVisible();
  await expect(page.locator('#city-view')).toBeHidden();
});

test('the guide keeps its scroll position, map and section highlight when you leave and come back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, document.getElementById('detalle').offsetTop - 60));
  await expect(page.locator('.nav-inner a[aria-current="location"]')).toHaveText('Día a día');
  const before = await page.evaluate(() => Math.round(window.scrollY));
  await button(page, 'frases').click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await button(page, 'guia').click();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(before);
  await expect(page.locator('.nav-inner a[aria-current="location"]')).toHaveText('Día a día');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length);
  const size = await page.locator('#city-map').boundingBox();
  expect(size.width).toBeGreaterThan(200);
  await expect(page.locator('#city-map .leaflet-tile-loaded').first()).toBeAttached({ timeout: 15_000 });
});

test('phrase and dish state is kept when switching between views', async ({ page }) => {
  await page.goto('/?view=frases');
  await page.locator('#phrases-search').fill('gracias');
  await button(page, 'platos').click();
  await page.locator('#dishes-search').fill('ramen');
  await button(page, 'frases').click();
  await expect(page.locator('#phrases-search')).toHaveValue('gracias');
  await button(page, 'platos').click();
  await expect(page.locator('#dishes-search')).toHaveValue('ramen');
});

test('place sheets and show mode still cover the bottom bar', async ({ page }) => {
  await page.goto('/?view=frases');
  await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
  const topmost = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
    return Boolean(el.closest('#phrase-show'));
  });
  expect(topmost).toBe(true);
});

test('the bottom bar fits a narrow phone with safe-area padding', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const box = await bar(page).boundingBox();
  expect(box.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const padding = await page.evaluate(() => getComputedStyle(document.body).paddingBottom);
  expect(parseFloat(padding)).toBeGreaterThanOrEqual(68);
});

test('on large screens the bar is a centred floating bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const box = await bar(page).boundingBox();
  expect(box.width).toBeLessThan(600);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
});
