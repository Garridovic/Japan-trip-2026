import { test, expect } from '@playwright/test';
import { SVG_MARKERS } from './helpers.js';

// Real touch input through CDP, so the browser applies touch-action / overscroll like a phone would.
async function touchDrag(page, from, to, { steps = 8 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: from.x, y }] });
  await send('touchStart', from.y);
  for (let i = 1; i <= steps; i += 1) { await send('touchMove', from.y + ((to - from.y) * i) / steps); await page.waitForTimeout(16); }
  await send('touchEnd', to);
  await cdp.detach();
}
const center = async (locator, dy = 0) => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 + dy }; };

for (const width of [390, 320]) {
  test.describe(`drag to close at ${width} px`, () => {
    test.use({ viewport: { width, height: 700 }, hasTouch: true, isMobile: true });

    const openCity = async (page) => {
      await page.goto('/?view=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
      await page.locator('#map-city-button').click();
      await expect(page.locator('#map-sheet')).toBeVisible();
      await page.waitForTimeout(400);
    };

    test('the handle is a 44 px target and dragging it down closes the sheet without scrolling the page', async ({ page }) => {
      await openCity(page);
      const grab = page.locator('#map-sheet .sheet-grab');
      expect((await grab.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await expect(grab).toHaveCSS('touch-action', 'none');
      const start = await center(grab);
      await touchDrag(page, start, start.y + 260);
      await expect(page.locator('#map-sheet')).toBeHidden();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.locator('#map-sheet')).toHaveCSS('transform', 'none');
    });

    test('a short drag springs back; dragging the header also closes; Escape and Cerrar still work', async ({ page }) => {
      await openCity(page);
      const start = await center(page.locator('#map-sheet .sheet-grab'));
      await touchDrag(page, start, start.y + 30);
      await expect(page.locator('#map-sheet')).toBeVisible();
      await expect.poll(() => page.locator('#map-sheet').evaluate((el) => el.style.transform)).toBe('');
      const header = await center(page.locator('#map-sheet .map-sheet-header'), 0);
      await touchDrag(page, { x: header.x - 60, y: header.y }, header.y + 280);
      await expect(page.locator('#map-sheet')).toBeHidden();
      await page.locator('#map-city-button').click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#map-sheet')).toBeHidden();
      await page.locator('#map-city-button').click();
      await page.locator('#map-sheet-close').click();
      await expect(page.locator('#map-sheet')).toBeHidden();
    });

    test('the body closes the sheet only when its scroll is at the top', async ({ page }) => {
      await page.goto('/?view=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
      await page.locator('#map-filters-button').click();
      const body = page.locator('#map-sheet .map-sheet-body');
      await expect(body).toBeVisible();
      await page.waitForTimeout(400);
      await body.evaluate((el) => { el.scrollTop = 80; });
      const scrolled = await body.evaluate((el) => el.scrollTop);
      expect(scrolled).toBeGreaterThan(0);
      const pos = await center(body);
      await touchDrag(page, pos, pos.y + 120);
      await expect(page.locator('#map-sheet')).toBeVisible();
      await body.evaluate((el) => { el.scrollTop = 0; });
      await touchDrag(page, pos, pos.y + 300);
      await expect(page.locator('#map-sheet')).toBeHidden();
    });

    test('the appearance sheet closes by its handle', async ({ page }) => {
      await page.goto('/');
      await page.locator('#theme-button').click();
      const sheet = page.locator('#theme-popover');
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(400);
      const start = await center(sheet.locator('.sheet-grab'));
      await touchDrag(page, start, start.y + 300);
      await expect(sheet).toBeHidden();
    });

    test('the place sheet closes by its handle', async ({ page }) => {
      await page.goto('/?tab=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
      await page.locator(SVG_MARKERS).first().dispatchEvent('click');
      await page.locator('.popup-detail-button').first().click();
      const sheet = page.locator('#poi-modal .poi-detail');
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(500);
      const start = await center(sheet.locator('.sheet-grab'));
      await touchDrag(page, start, start.y + 320);
      await expect(page.locator('#poi-modal')).toBeHidden();
    });
  });
}

test.describe('drag to close on desktop and with reduced motion', () => {
  test('a mouse drag on the handle closes the sheet', async ({ page }) => {
    await page.goto('/');
    await page.locator('#theme-button').click();
    const sheet = page.locator('#theme-popover');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const start = await center(sheet.locator('.sheet-grab'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 40, { steps: 4 });
    await page.mouse.move(start.x, start.y + 220, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
  });

  test('with reduced motion the sheet follows and closes without animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('#theme-button').click();
    const sheet = page.locator('#theme-popover');
    const start = await center(sheet.locator('.sheet-grab'));
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 200, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();
    await expect(sheet).toHaveCSS('transform', 'none');
  });
});
