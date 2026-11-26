import { test, expect } from '@playwright/test';
import { SVG_MARKERS, kyoto, selectCity } from './helpers.js';

const tokyoTime = (iso) => new Date(`${iso}+09:00`);

test.describe('Hoy card', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });
  const card = (page) => page.locator('#today-card');
  const at = async (page, iso) => { await page.clock.setFixedTime(tokyoTime(iso)); };

  test('on a trip day it shows what is on now, what is next, and how to get there', async ({ page }) => {
    await at(page, '2026-12-11T13:00:00');
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('Hoy · Vie · 11 dic');
    await expect(card(page).locator('.today-line.is-now')).toContainText('11:45 · Mercado Nishiki');
    await expect(card(page).locator('.today-line').nth(1)).toContainText('13:45 · Castillo Nijō');
    const directions = card(page).getByRole('link', { name: 'Cómo llegar' });
    expect(await directions.getAttribute('href')).toMatch(/maps\/dir\/\?api=1&destination=Castillo%20Nij%C5%8D%2C%20Kyoto/);
    expect((await directions.boundingBox()).height).toBeGreaterThanOrEqual(48);
  });

  test("today's day opens with a timeline: done, now and next", async ({ page }) => {
    await at(page, '2026-12-11T14:00:00');
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    await card(page).getByRole('link', { name: 'Ver el día' }).click();
    const day = page.locator('#dia11');
    await expect(day).toHaveAttribute('open', '');
    await expect(day.locator('.stop.is-done')).toHaveCount(2);
    await expect(day.locator('.stop.is-now')).toHaveCount(1);
    await expect(day.locator('.stop.is-next')).toHaveCount(1);
    await expect(page.locator('#dia12 .stop.is-done, #dia12 .stop.is-now')).toHaveCount(0);
  });

  test('the card follows the clock without reloading', async ({ page }) => {
    await at(page, '2026-12-11T09:00:00');
    await page.goto('/');
    await expect(card(page).locator('.today-line').first()).toContainText('Siguiente');
    await page.clock.setFixedTime(tokyoTime('2026-12-11T12:00:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // coming back to the app
    await expect(card(page).locator('.today-line.is-now')).toContainText('Mercado Nishiki');
  });

  test('before the trip it counts the days; after the last day it disappears', async ({ page }) => {
    await at(page, '2026-12-01T09:00:00');
    await page.goto('/');
    await expect(card(page)).toContainText('Faltan 10 días');
    await expect(card(page)).toContainText('Llegada + primera noche');
    await at(page, '2026-12-20T09:00:00');
    await page.reload();
    await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
    await expect(card(page)).toBeHidden();
  });

  test('late on a day: it keeps showing today\'s card', async ({ page }) => {
    await at(page, '2026-12-14T21:00:00'); // Kyoto 14 dic: everything done
    await page.goto('/');
    await expect(card(page)).toContainText('Hoy · ');
    await expect(card(page)).toBeVisible();
  });

  test('each city has its own day: on 16 dic Osaka shows today and Kioto is over', async ({ page }) => {
    await at(page, '2026-12-16T10:00:00');
    await page.goto('/?city=osaka');
    await expect(card(page)).toContainText('Hoy · ');
    await selectCity(page, 'Kioto');
    await expect(card(page)).toBeHidden();
  });

  test('the card fits a 320 px phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await at(page, '2026-12-11T13:00:00');
    await page.goto('/');
    await expect(card(page)).toBeVisible();
    const box = await card(page).boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('restaurants and other places: "Cómo llegar" first', () => {
  test('every restaurant card leads with a big directions button that includes the city', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    const card = page.locator('.food-card').first();
    const primary = card.locator('a.primary-action');
    await expect(primary).toHaveText('Cómo llegar');
    await primary.scrollIntoViewIfNeeded();
    expect((await primary.boundingBox()).height).toBeGreaterThanOrEqual(48);
    expect(await primary.getAttribute('href')).toMatch(/maps\/dir\/\?api=1&destination=.*Kyoto/);
    expect(await primary.evaluate((node) => node.parentElement.firstElementChild === node)).toBe(true);
    await expect(card.getByRole('link', { name: /Ver en Google Maps/ })).toBeVisible(); // the old link is still there
  });

  test('alternative places get the same button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    const extra = page.locator('.extra-card').first();
    await expect(extra.locator('a.primary-action')).toHaveText('Cómo llegar');
    expect(await extra.locator('a.primary-action').getAttribute('href')).toContain('Kyoto');
  });
});

test.describe('phrases: "Mostrar" first, swipe in show mode', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the card leads with a big «Mostrar» and icon-only audio buttons', async ({ page }) => {
    await page.goto('/?view=frases');
    const actions = page.locator('.phrase-card').first().locator('.phrase-actions');
    const buttons = actions.getByRole('button');
    await expect(buttons).toHaveCount(3);
    await expect(buttons.first()).toHaveText(/Mostrar/);
    expect((await buttons.first().boundingBox()).height).toBeGreaterThanOrEqual(48);
    await expect(buttons.nth(1)).toHaveAccessibleName(/^Escuchar:/);
    await expect(buttons.nth(2)).toHaveAccessibleName(/^Escuchar despacio:/);
    for (const index of [1, 2]) {
      const box = await buttons.nth(index).boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  const swipe = (page, dx, dy = 0) => page.evaluate(([dx, dy]) => {
    const modal = document.getElementById('phrase-show');
    const touch = (x, y) => new Touch({ identifier: 1, target: modal, clientX: x, clientY: y });
    modal.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch(200, 400)], bubbles: true }));
    modal.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200 + dx, 400 + dy)], bubbles: true }));
  }, [dx, dy]);

  test('swiping left goes to the next phrase, right to the previous; a vertical drag does nothing', async ({ page }) => {
    await page.goto('/?view=frases');
    await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
    const position = page.locator('#phrase-show-position');
    await expect(position).toHaveText(/^1 \/ \d+$/);
    await expect(page.locator('#phrase-show-hint')).toBeVisible();
    await swipe(page, -140);
    await expect(position).toHaveText(/^2 \/ \d+$/);
    await swipe(page, 20, 160); // scrolling down, not a swipe
    await expect(position).toHaveText(/^2 \/ \d+$/);
    await swipe(page, 140);
    await expect(position).toHaveText(/^1 \/ \d+$/);
    await page.getByRole('button', { name: 'Frase siguiente' }).click(); // buttons still work
    await expect(position).toHaveText(/^2 \/ \d+$/);
  });
});
