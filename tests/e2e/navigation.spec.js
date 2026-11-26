import { test, expect } from '@playwright/test';
import { SVG_MARKERS, kyoto } from './helpers.js';

const SECTIONS = ['mapa', 'detalle', 'comer', 'alternativas', 'practico', 'resumen', 'mapa'];
const ids = ['resumen', 'mapa', 'detalle', 'comer', 'alternativas', 'practico'];

async function expectAligned(page, id) {
  // After the scroll has settled the section starts right below the two sticky bars (scroll-margin-top).
  await expect.poll(async () => page.evaluate((id) => {
    const margin = parseFloat(getComputedStyle(document.getElementById(id)).scrollMarginTop);
    return Math.abs(document.getElementById(id).getBoundingClientRect().top - margin) <= 3;
  }, id), { timeout: 8000 }).toBe(true);
  await expect(page.locator('.nav-inner a[aria-current="location"]')).toHaveAttribute('href', `#${id}`);
}

for (const [name, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1440, height: 900 }, false]]) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: mobile, hasTouch: mobile });

    test('every section tab scrolls to its section from any position, in any order', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
      for (const id of [...ids, ...SECTIONS]) {
        await page.locator(`.nav-inner a[href="#${id}"]`).click();
        await expectAligned(page, id);
      }
    });

    test('the clicked tab is not overridden by the highlight while the page is scrolling', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
      await page.locator('.nav-inner a[href="#alternativas"]').click();
      // Long scroll across Mapa, Día a día and Comer: the highlight stays on the clicked tab.
      const seen = new Set();
      for (let i = 0; i < 12; i++) {
        seen.add(await page.locator('.nav-inner a[aria-current="location"]').getAttribute('href'));
        await page.waitForTimeout(80);
      }
      expect([...seen]).toEqual(['#alternativas']);
      await expectAligned(page, 'alternativas');
    });
  });
}

test('a browser that cancels smooth scrolling on scrollIntoView() does not break the tabs', async ({ page }) => {
  // Safari-like behaviour: any scrollIntoView() call aborts the smooth scroll that is running.
  await page.addInitScript(() => {
    Element.prototype.scrollIntoView = function () { window.scrollTo({ top: window.scrollY, behavior: 'instant' }); };
  });
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  for (const id of ['practico', 'mapa', 'comer', 'resumen']) {
    await page.locator(`.nav-inner a[href="#${id}"]`).click();
    await expectAligned(page, id);
  }
});

test('the last tab works even though the page cannot scroll that far', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-inner a[href="#fuentes"]').click();
  await expect.poll(() => page.evaluate(() => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)).toBe(true);
  await expect(page.locator('.nav-inner a[aria-current="location"]')).toHaveAttribute('href', '#fuentes');
});

test('the tab updates the URL hash without adding history entries', async ({ page }) => {
  await page.goto('/?city=kyoto');
  const before = await page.evaluate(() => history.length);
  await page.locator('.nav-inner a[href="#mapa"]').click();
  await expect(page).toHaveURL(/\?city=kyoto#mapa$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test.describe('full-screen sheets put the back button on the left', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const expectLeft = async (page, selector) => {
    const box = await page.locator(selector).boundingBox();
    expect(box.x).toBeLessThan(40);
    expect(box.x + box.width / 2).toBeLessThan(390 / 2);
  };

  test('phrase show mode', async ({ page }) => {
    await page.goto('/?view=frases');
    await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
    await expect(page.locator('#phrase-show-close, #phrase-show .phrase-show-close')).toHaveText(/Volver/);
    await expectLeft(page, '#phrase-show .phrase-show-close');
  });

  test('dish sheet', async ({ page }) => {
    await page.goto('/?view=platos');
    await page.locator('.dish-card .dish-open').first().click();
    await expect(page.locator('#dish-show-close')).toHaveText(/Volver/);
    await expectLeft(page, '#dish-show-close');
  });

  test('place sheet already had it on the left (consistency check)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SVG_MARKERS).first().dispatchEvent('click');
    await page.locator('.popup-detail-button').first().click();
    await expectLeft(page, '#poi-modal .poi-back');
  });
});
