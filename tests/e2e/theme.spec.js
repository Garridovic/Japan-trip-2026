import { test, expect } from '@playwright/test';

const html = (page) => page.locator('html');
const themeButton = (page) => page.locator('#theme-button');
const choose = async (page, choice) => {
  if (await page.locator('#theme-popover').isHidden()) await themeButton(page).click();
  await page.locator(`[data-theme-choice="${choice}"]`).click();
};
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('light and dark theme', () => {
  test('follows the phone when nothing is chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.+/);
    expect(await background(page)).toBe('rgb(14, 26, 33)');
    await page.emulateMedia({ colorScheme: 'light' });
    expect(await background(page)).toBe('rgb(247, 245, 240)');
  });

  test('the header button offers automatic, light and dark and remembers the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await themeButton(page).click();
    await expect(page.locator('#theme-popover')).toBeVisible();
    await expect(page.locator('[data-theme-choice]')).toHaveCount(3);
    await page.locator('[data-theme-choice="dark"]').click();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    expect(await background(page)).toBe('rgb(14, 26, 33)');
    await expect(themeButton(page)).toHaveAttribute('aria-label', 'Apariencia: oscura');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await choose(page, 'auto');
    await expect(html(page)).not.toHaveAttribute('data-theme', /.+/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  });

  test('the saved theme is applied before the first paint (no light flash)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/', { waitUntil: 'commit' });
    // the inline script in <head> sets the attribute before the stylesheets are even parsed
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    expect(await background(page)).toBe('rgb(14, 26, 33)');
  });

  test('Escape closes the popover and returns focus to the button', async ({ page }) => {
    await page.goto('/');
    await themeButton(page).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#theme-popover')).toBeHidden();
    await expect(themeButton(page)).toBeFocused();
  });

  for (const view of ['guia', 'viaje', 'frases', 'platos']) {
    test(`dark mode keeps text readable in ${view}`, async ({ page }) => {
      await page.goto(`/?view=${view}`);
      await choose(page, 'dark');
      const bad = await page.evaluate(() => {
        const lum = (rgb) => { const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const backdrop = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(.*, 0\)|transparent/.test(c)) return c; } return 'rgb(14, 26, 33)'; };
        const out = [];
        for (const el of document.querySelectorAll('.app-view:not([hidden]) :is(h1,h2,h3,p,li,span,strong,a,summary,button,label,small)')) {
          if (!el.checkVisibility() || !el.textContent.trim() || el.closest('.hero, footer, .phrase-show')) continue;
          const style = getComputedStyle(el);
          if (!el.firstChild || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          const r = ratio(style.color, backdrop(el));
          if (r < 3) out.push(`${el.className || el.tagName}: ${r.toFixed(1)}`);
        }
        return out.slice(0, 8);
      });
      expect(bad).toEqual([]);
    });
  }

  test('the map popup and tiles follow the theme', async ({ page }) => {
    await page.goto('/');
    await choose(page, 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tile-filter').trim())).toContain('invert');
    await choose(page, 'light');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tile-filter').trim())).toBe('none');
  });
});

test.describe('bottom bar with the central map button', () => {
  test('Mapa takes you to the map of the guide from any view', async ({ page }) => {
    await page.goto('/?view=platos');
    await page.locator('[data-action="map"]').click();
    await expect(page.locator('#city-view')).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById('mapa').getBoundingClientRect().top)), { timeout: 8000 }).toBeLessThan(200);
    await expect(page.locator('[data-view-target="guia"]')).toHaveAttribute('aria-current', 'page');
  });

  test('five buttons fit a 320 px phone and the map button is the centre one', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    const boxes = await page.locator('.app-bar-button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; }));
    expect(boxes).toHaveLength(5);
    for (const box of boxes) { expect(box.w).toBeGreaterThanOrEqual(56); expect(box.h).toBeGreaterThanOrEqual(44); }
    const centre = boxes[2];
    expect(Math.abs(centre.x + centre.w / 2 - 160)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });

  test('on 320 px the city tabs, offline chip and theme button share the header without overlap', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Kioto' })).toBeVisible();
    const chip = page.locator('#offline-chip');
    if (await chip.isVisible()) {
      const [c, t] = await Promise.all([chip.boundingBox(), themeButton(page).boundingBox()]);
      expect(c.x + c.width).toBeLessThanOrEqual(t.x + 1);
      expect(t.x + t.width).toBeLessThanOrEqual(320);
    }
  });
});
