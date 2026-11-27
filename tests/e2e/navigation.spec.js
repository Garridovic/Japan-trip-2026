import { test, expect } from '@playwright/test';
import { SVG_MARKERS, kyoto } from './helpers.js';

const ids = ['resumen', 'mapa', 'detalle', 'comer', 'alternativas', 'practico'];
const panels = (page) => page.evaluate((ids) => ids.filter((id) => document.getElementById(id).offsetHeight > 0), ids);
const stickPoint = (page) => page.evaluate(() => {
  const nav = document.querySelector('#city-view > nav');
  return Math.round(document.querySelector('#city-view > .hero').getBoundingClientRect().bottom + scrollY - parseFloat(getComputedStyle(nav).top));
});

// Tab behaviour does not depend on the screen size, so one phone run is enough (desktop is covered by "Ver detalle" below).
test.describe('guide tabs (one section per tab)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('each tab shows only its own section, in any order, and there is no Fuentes tab', async ({ page }) => {
    await page.goto('/?city=kyoto');
    await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible();
    await expect(page.locator('.nav-inner [role="tab"]')).toHaveText(['Vista rápida', 'Mapa', 'Día a día', 'Comer', 'Otros lugares', 'Consejos']);
    expect(await panels(page)).toEqual(['resumen']);
    for (const id of [...ids, 'mapa', 'resumen']) {
      await page.locator(`.nav-inner a[href="#${id}"]`).click();
      await expect(page.locator(`.nav-inner a[href="#${id}"]`)).toHaveAttribute('aria-selected', 'true');
      expect(await panels(page)).toEqual([id]);
      await expect(page).toHaveURL(new RegExp(`[?&]tab=${id}$`));
    }
  });

  test('with the strip stuck, a new tab starts right below it and each tab keeps its own scroll', async ({ page }) => {
    await page.goto('/?city=kyoto');
    await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible();
    await page.locator('.nav-inner a[href="#comer"]').click();
    const stick = await stickPoint(page);
    await page.evaluate(() => window.scrollTo({ top: 4000, behavior: 'instant' }));
    await page.locator('.nav-inner a[href="#practico"]').click();
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(stick);
    expect(Math.round((await page.locator('#practico').boundingBox()).y)).toBeLessThan(160); // under the bars, not below the header
    await page.locator('.nav-inner a[href="#comer"]').click();
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(4000);
  });

  test('without scrolling, changing tab leaves the header where it is', async ({ page }) => {
    await page.goto('/?city=kyoto');
    await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible();
    await page.locator('.nav-inner a[href="#alternativas"]').click();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect(page.locator('#hero-title')).toBeInViewport();
  });

  test('arrow keys move between tabs', async ({ page }) => {
    await page.goto('/?city=kyoto&tab=mapa');
    await expect(page.locator('#quick-grid .quick-card').first()).toBeAttached();
    await page.locator('.nav-inner a[href="#mapa"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.nav-inner a[href="#detalle"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.nav-inner a[href="#detalle"]')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('.nav-inner a[href="#resumen"]')).toHaveAttribute('aria-selected', 'true');
  });
});

test('the tab goes in the URL without adding history entries, and Back leaves the city instead of walking tabs', async ({ page }) => {
  await page.goto('/?city=kyoto');
  await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible();
  const before = await page.evaluate(() => history.length);
  await page.locator('.nav-inner a[href="#mapa"]').click();
  await page.locator('.nav-inner a[href="#comer"]').click();
  await expect(page).toHaveURL(/\?city=kyoto&tab=comer$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('a link with ?tab= or an old #anchor opens that tab, and the last tab is remembered', async ({ page }) => {
  await page.goto('/?city=kyoto&tab=alternativas');
  await expect(page.locator('#alternativas')).toBeVisible();
  await expect(page.locator('#resumen')).toBeHidden();
  await page.goto('/?city=kyoto#comer');
  await expect(page.locator('#comer')).toBeVisible();
  await expect(page).toHaveURL(/\?city=kyoto&tab=comer$/);
  await page.goto('/?city=kyoto');
  await expect(page.locator('#comer')).toBeVisible(); // remembered on this device
  await page.goto('/?city=kyoto#dia12');
  await expect(page.locator('#detalle')).toBeVisible();
  await expect.poll(() => page.locator('#dia12').evaluate((day) => day.open)).toBe(true);
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

  test('place sheet closes with a round X on the right, like every other sheet', async ({ page }) => {
    await page.goto('/?tab=mapa');
    await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
    await page.locator(SVG_MARKERS).first().dispatchEvent('click');
    await page.locator('.popup-detail-button').first().click();
    const box = await page.locator('#poi-modal .poi-back').boundingBox();
    expect(box.width).toBe(44);
    expect(box.x + box.width / 2).toBeGreaterThan(390 / 2);
  });
});

// Each city is checked on one screen size (phone for Kyoto, desktop for Osaka): the four combinations were redundant.
for (const [city, name, viewport, mobile] of [['kyoto', 'phone', { width: 390, height: 844 }, true], ['osaka', 'desktop', { width: 1440, height: 900 }, false]]) {
  {
    test.describe(`"Ver detalle" · ${city} · ${name}`, () => {
      test.use({ viewport, isMobile: mobile, hasTouch: mobile });

      test('each link opens its day and shows its title clear of the two sticky bars', async ({ page }) => {
        await page.goto(`/?city=${city}`);
        await expect(page.locator('.quick-card .text-link').first()).toBeVisible();
        const count = await page.locator('.quick-card .text-link').count();
        expect(count).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < count; i++) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.locator('.nav-inner a[href="#resumen"]').click(); // each link switches to «Día a día»
          const link = page.locator('.quick-card .text-link').nth(i);
          const target = await link.getAttribute('href');
          await link.scrollIntoViewIfNeeded();
          await link.click();
          const day = page.locator(target);
          await expect.poll(() => day.evaluate((element) => element.open)).toBe(true);
          // The day title ends up below the sticky city bar and the section navigation, fully visible.
          await expect.poll(async () => {
            const box = await day.locator('summary').boundingBox();
            return box.y >= 96 - 1 && box.y < 400;
          }, { timeout: 8000 }).toBe(true);
          const covered = await day.locator('summary').evaluate((summary) => {
            const rect = summary.getBoundingClientRect();
            const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 10);
            return !summary.contains(top);
          });
          expect(covered).toBe(false);
          await expect(page).toHaveURL(new RegExp(`${target}$`));
        }
      });
    });
  }
}

test('clicking a tab does not let the app reset the scroll afterwards', async ({ page }) => {
  await page.goto('/?city=kyoto');
  await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await page.locator('nav a[href="#mapa"]').click();
  await page.waitForTimeout(500); // the layout of the new tab settles
  const y = await page.evaluate(() => Math.round(window.scrollY));
  await page.waitForTimeout(600);
  expect(Math.abs((await page.evaluate(() => Math.round(window.scrollY))) - y)).toBeLessThanOrEqual(2);
});

test('opening the page with #diaN in the URL opens that day under the bars', async ({ page }) => {
  await page.goto('/?city=kyoto#dia12');
  await expect.poll(() => page.locator('#dia12').evaluate((element) => element.open)).toBe(true);
  await expect.poll(async () => (await page.locator('#dia12 summary').boundingBox()).y).toBeGreaterThanOrEqual(95);
});
