import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, RESTAURANT_MARKERS } from './helpers.js';

// UX review (Nov 2026): every map point is a 44 px tap area, nearby points join into numbered groups,
// and the controls people tap most measure 48 px.
const POINTS = '#city-map .poi-marker';
const GROUPS = '#city-map .poi-cluster';
const phone = (width) => ({ viewport: { width, height: width === 320 ? 640 : 844 }, isMobile: true, hasTouch: true });
const withGroups = (page) => page.addInitScript(() => localStorage.setItem('map-cluster-enabled', '1'));

/** Boxes of the points and groups that are on screen. */
const onScreen = (page) => page.evaluate(() => [...document.querySelectorAll('#city-map .poi-marker, #city-map .poi-cluster')]
  .map((element) => element.getBoundingClientRect())
  .filter((box) => box.width && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth)
  .map((box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height })));

test('every point is a 44 px tap area with its shape drawn inside', async ({ page }) => {
  await page.goto('/?tab=mapa');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(kyoto.restaurants.length);
  const sizes = await page.locator(POINTS).evaluateAll((elements) => elements.map((element) => [element.offsetWidth, element.offsetHeight]));
  expect(sizes.every(([w, h]) => w === 44 && h === 44)).toBe(true);
  const shape = await page.locator(`${SVG_MARKERS}.is-visit span`).first().boundingBox();
  expect(shape.width).toBeLessThan(30); // the drawing stays small; only the tap area grows
});

for (const width of [390, 320]) {
  test.describe(`map groups at ${width} px`, () => {
    test.use(phone(width));

    test('nearby points join into numbered groups and a tap on a group splits it', async ({ page }) => {
      await withGroups(page);
      await page.goto('/?view=mapa');
      await expect(page.locator('#city-map')).toHaveAttribute('data-clustered', 'true');
      await expect(page.locator(GROUPS).first()).toBeVisible({ timeout: 20_000 });
      const total = kyoto.places.length + kyoto.restaurants.length;
      const counts = await page.locator(`${GROUPS} span`).allInnerTexts();
      const loose = await page.locator(POINTS).count();
      expect(counts.map(Number).reduce((sum, n) => sum + n, 0) + loose).toBe(total); // nothing is lost inside a group
      await expect(page.locator(GROUPS).first()).toHaveAttribute('aria-label', /lugares aquí/);
      const boxes = await onScreen(page);
      expect(boxes.every((box) => box.w >= 44 && box.h >= 44)).toBe(true);
      // no two tap areas sit on top of each other (a little overlap at the rim is fine)
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        expect(Math.hypot(boxes[i].x - boxes[j].x, boxes[i].y - boxes[j].y)).toBeGreaterThan(30);
      }
      const zoomBefore = await page.evaluate(() => document.querySelector('#city-map .leaflet-tile-container img')?.src);
      const biggest = await page.locator(GROUPS).evaluateAll((groups) => groups.reduce((best, group, index, all) => (Number(group.textContent) > Number(all[best].textContent) ? index : best), 0));
      await page.locator(GROUPS).nth(biggest).click();
      await expect.poll(() => page.evaluate(() => document.querySelector('#city-map .leaflet-tile-container img')?.src)).not.toBe(zoomBefore);
    });

    test('a search result inside a group still opens its card', async ({ page }) => {
      await withGroups(page);
      await page.goto('/?view=mapa');
      await expect(page.locator(GROUPS).first()).toBeVisible({ timeout: 20_000 });
      await page.locator('#map-search-input').fill('ryouanji');
      await page.locator('#map-search-input').press('Enter');
      await expect(page.locator('#map-card-body')).toContainText('Ryoan-ji');
      await expect(page.locator(`${POINTS}.is-search-hit`)).toHaveCount(1);
    });
  });
}

test.describe('touch targets of 44 and 48 px', () => {
  for (const width of [390, 320]) {
    test(`map search, map buttons and guide tabs at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 844 });
      await page.goto('/?view=mapa');
      await expect(page.locator('#map-search-field')).toBeVisible({ timeout: 20_000 });
      expect((await page.locator('#map-search-field').boundingBox()).height).toBeGreaterThanOrEqual(48);
      expect((await page.locator('#map-search-input').boundingBox()).height).toBeGreaterThanOrEqual(44);
      for (const selector of ['#map-filters-button', '#map-nearby-button', '#map-offline-button', '#map-city-button']) {
        const box = await page.locator(selector).boundingBox();
        expect(box.height, selector).toBeGreaterThanOrEqual(48);
      }
      for (const control of await page.locator('.map-view .leaflet-control-zoom a').all()) {
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      await page.goto('/?tab=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeAttached({ timeout: 20_000 });
      for (const tab of await page.locator('#city-view > nav a').all()) expect((await tab.boundingBox()).height).toBeGreaterThanOrEqual(48);
      for (const control of await page.locator('#city-map .leaflet-control-zoom a').all()) {
        const box = await control.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('at 320 px a long zone label never splits the date of a day card', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');
    const dates = page.locator('#resumen .quick-top .date');
    await expect(dates.first()).toBeVisible({ timeout: 20_000 });
    for (const date of await dates.all()) {
      const lineHeight = await date.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 20);
      expect((await date.boundingBox()).height).toBeLessThan(lineHeight * 1.6);
    }
    for (const link of await page.locator('#resumen .text-link').all()) expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(48);
  });

  test('desktop map: the search keeps a readable width and the version label leaves the zoom buttons free', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/?view=mapa');
    await expect(page.locator('#map-search-field')).toBeVisible({ timeout: 20_000 });
    expect((await page.locator('.map-search-row').boundingBox()).width).toBeLessThanOrEqual(560);
    const [field, chip] = await Promise.all([page.locator('#map-search-field').boundingBox(), page.locator('#map-city-button').boundingBox()]);
    expect(chip.y).toBeGreaterThanOrEqual(field.y + field.height); // the city chip stays under the search
    await expect(page.locator('#version-indicator')).toBeHidden();
    await page.goto('/');
    await expect(page.locator('#version-indicator')).toBeVisible();
  });
});

for (const width of [390, 320]) {
  test.describe(`map card at ${width} px`, () => {
    test.use(phone(width));

    test('a place opened from the search sits above the card, and the card has three icon actions', async ({ page }) => {
      await page.goto('/?view=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeAttached({ timeout: 20_000 });
      await page.locator('#map-search-input').fill('nishiki');
      await page.locator('#map-search-drop .map-search-row-item', { hasText: 'Nishiki' }).first().click();
      const card = page.locator('#map-card');
      await expect(card).toBeVisible();
      await expect(card.locator('.popup-title')).toContainText('Nishiki');
      const actions = card.locator('.map-card-action');
      expect(await actions.count()).toBeGreaterThanOrEqual(2);
      expect(await actions.count()).toBeLessThanOrEqual(3);
      for (const action of await actions.all()) {
        const box = await action.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.width).toBeGreaterThanOrEqual(48);
      }
      await expect(card.getByRole('link', { name: 'Cómo llegar con Google Maps' })).toHaveAttribute('href', /^https:\/\//);
      // QA V14.19.0: the chosen point used to end up under the card.
      const name = (await card.locator('.popup-title').innerText()).trim();
      const hit = page.locator(`${POINTS}[title="${name}"]`).first();
      await expect.poll(async () => {
        const [point, top] = [await hit.boundingBox(), (await card.boundingBox()).y];
        return point && point.y + point.height / 2 < top - 8;
      }, { timeout: 5_000 }).toBe(true);
      expect((await hit.boundingBox()).y).toBeGreaterThan((await page.locator('#map-search-field').boundingBox()).y);
    });

    test('the name of a place opens its sheet', async ({ page }) => {
      await page.goto('/?view=mapa');
      await expect(page.locator(SVG_MARKERS).first()).toBeAttached({ timeout: 20_000 });
      await page.locator(SVG_MARKERS).nth(1).dispatchEvent('click');
      const title = page.locator('#map-card button.popup-title');
      await expect(title).toHaveText(kyoto.places[1].name);
      expect((await title.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await title.click();
      await expect(page.locator('#poi-title, .poi-detail-header').first()).toBeVisible();
    });
  });
}

test('the guide has no map tab and no instruction paragraphs under its titles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#quick-grid .quick-card').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.nav-inner a[href="#mapa"]')).toBeHidden();
  await expect(page.locator('.section-head .kicker')).toHaveCount(0);
  await expect(page.locator('.section-head > p')).toHaveCount(0);
  await expect(page.locator('footer')).not.toContainText('data/');
});
