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
    await expect(card.locator('strong')).toHaveText('Preparativos');
    await expect(card).toContainText('días para salir');
    await expect(card.locator('.progress-chip', { hasText: 'Platos' })).toHaveClass(/tier-none/);
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
    await expect(card.locator('strong')).toHaveText(/^1 lugar en Kioto/);
    await expect(card.locator('.progress-ring')).toHaveClass(/tier-start/);
    await expect(card).toContainText('Día 5 de 15');
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('visited-v1'));
      raw.kyoto.push('fushimi');
      window.japanTripUserData.storage.setItem('visited-v1', JSON.stringify(raw));
    });
    await expect(card.locator('strong')).toHaveText(/^2 lugares en Kioto/);
  });

  test('the card opens a sheet with every indicator and closes with its button, Escape and Back', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-12T10:00:00'));
    await mockWeather(page);
    await page.goto('/?city=kyoto');
    await page.locator('#progress-card .progress-open').click();
    const sheet = page.locator('#progress-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.progress-tile')).toHaveCount(6);
    await expect(sheet.locator('.progress-tile', { hasText: 'Sellos' })).toContainText('/18');
    await page.locator('#progress-close').click();
    await expect(sheet).toBeHidden();
    await page.locator('#progress-card .progress-open').click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.locator('#progress-card .progress-open').click();
    await page.goBack();
    await expect(sheet).toBeHidden();
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

test.describe('V14.12 compact header', () => {
  test('every control has a 44 px target, 8 px apart, and the text is at least 12 px, at 320 and 390 px', async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.clock.setFixedTime(tokyo('2026-12-09T12:00:00'));
      await mockWeather(page);
      await page.goto('/?city=tokyo');
      await expect(page.locator('#hero-stays .stay-chip')).toHaveCount(2);
      const small = await page.evaluate(() => {
        const bad = [];
        for (const slide of document.querySelectorAll('.hero-slide:not([hidden])')) {
          slide.scrollIntoView({ inline: 'start', block: 'nearest' });
          for (const control of slide.querySelectorAll('a, button')) {
            const box = control.getBoundingClientRect();
            if (box.width && (box.width < 43.5 || box.height < 43.5)) bad.push(`${control.textContent.trim()}: ${Math.round(box.width)}×${Math.round(box.height)}`);
          }
        }
        for (const node of document.querySelectorAll('.hero-head *, .hero-slide *')) {
          const own = [...node.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim());
          if (own && node.getBoundingClientRect().width && parseFloat(getComputedStyle(node).fontSize) < 11.99) bad.push(`font ${getComputedStyle(node).fontSize}: ${node.textContent.trim().slice(0, 20)}`);
        }
        return bad;
      });
      expect(small, `width ${width}`).toEqual([]);
      const gaps = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.hero-stays, .hotel-actions, .today-actions')];
        return rows.filter((row) => row.getBoundingClientRect().width).map((row) => {
          const boxes = [...row.children].map((child) => child.getBoundingClientRect()).filter((box) => box.width);
          return Math.min(...boxes.slice(1).map((box, index) => box.left - boxes[index].right), 99);
        });
      });
      expect(Math.min(...gaps), `width ${width}`).toBeGreaterThanOrEqual(7.5);
    }
  });

  test('the hotel card shows the Japanese name and the nearest plan places, and the side margin is 16 px', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/?city=kyoto');
    const hotel = page.locator('#hero-hotel');
    await expect(hotel.locator('.hotel-ja')).toHaveText('アゴーラ 京都烏丸');
    await expect(hotel.locator('.hotel-near')).toContainText('Nishiki');
    await expect(hotel.locator('.hotel-near')).toContainText(' m');
    expect((await page.locator('.hero-head').evaluate((node) => parseFloat(getComputedStyle(node).paddingLeft)))).toBe(16);
    await page.setViewportSize({ width: 320, height: 800 });
    await expect(hotel.locator('.hotel-ja')).toBeHidden(); // 320 px keeps the name and the buttons; the extra lines wait for wider screens
  });
});

test.describe('V14.3.1 fixes', () => {
  test('the stamp goal is the same when a city is opened directly, at 320 px too', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.clock.setFixedTime(tokyo('2026-12-08T12:00:00'));
    await mockWeather(page);
    const goals = [];
    for (const city of ['nara', 'hakone', 'kyoto', 'tokyo']) {
      await page.goto(`/?city=${city}`);
      await page.locator('#progress-card .progress-open').click();
      const tile = page.locator('#progress-sheet .progress-tile', { hasText: 'Sellos' });
      await expect(tile).toBeVisible();
      goals.push(await tile.locator('b small').textContent());
    }
    expect(new Set(goals).size).toBe(1);
    expect(goals[0]).toBe('/18');
  });
});
