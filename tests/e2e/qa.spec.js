import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS } from './helpers.js';

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const openPlaceSheet = async (page) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
  await page.locator(SVG_MARKERS).first().dispatchEvent('click');
  await page.locator('.popup-detail-button').first().click();
  await expect(page.locator('#poi-modal')).toBeVisible();
};
const openPhraseSheet = async (page) => {
  await page.goto('/?view=frases');
  await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
  await expect(page.locator('#phrase-show')).toBeVisible();
};
const openDishSheet = async (page) => {
  await page.goto('/?view=platos');
  await page.locator('.dish-card .dish-open').first().click();
  await expect(page.locator('#dish-show')).toBeVisible();
};

test.describe('Back button / swipe-back closes full-screen sheets and they stay closed', () => {
  test.use(phone);
  for (const [name, open, sheet, url] of [
    ['phrase show mode', openPhraseSheet, '#phrase-show', /view=frases/],
    ['dish sheet', openDishSheet, '#dish-show', /view=platos/],
    ['place sheet', openPlaceSheet, '#poi-modal', /^(?!.*view=)/]
  ]) {
    test(`${name}: Back closes it and it stays closed (also after Forward); the in-sheet button releases its history entry`, async ({ page }) => {
      await open(page);
      const startUrl = page.url();
      await page.evaluate(() => history.back()); // what the Android gesture / iOS edge swipe does
      await expect(page.locator(sheet)).toBeHidden();
      await page.waitForTimeout(900); // the reported bug: the sheet came back after the animation
      await expect(page.locator(sheet)).toBeHidden();
      expect(page.url()).toBe(startUrl);
      expect(page.url()).toMatch(url);
      await expect(page.locator('#app-bar')).toBeVisible();
      await page.evaluate(() => history.forward());
      await page.waitForTimeout(500);
      await expect(page.locator(sheet)).toBeHidden();
      await expect(page.locator('#app-bar')).toBeVisible();

      const second = await page.context().newPage(); // a clean history, as a real second visit
      await open(second);
      const entries = await second.evaluate(() => history.length);
      await second.locator(`${sheet} :is(.phrase-show-close, .poi-back)`).first().click();
      await expect(second.locator(sheet)).toBeHidden();
      await expect.poll(() => second.evaluate(() => history.state?.overlay ?? null)).toBeNull();
      expect(entries).toBeGreaterThan(1);
    });
  }

  test('Escape closes a sheet and also releases its history entry', async ({ page }) => {
    await openPhraseSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#phrase-show')).toBeHidden();
    await expect.poll(() => page.evaluate(() => history.state?.overlay ?? null)).toBeNull();
  });

  test('Back after closing a sheet still navigates between views normally', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-view-target="frases"]').click();
    await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
    await page.evaluate(() => history.back());
    await expect(page.locator('#phrase-show')).toBeHidden();
    await page.evaluate(() => history.back());
    await expect(page.locator('#city-view')).toBeVisible();
    await expect(page.locator('#view-frases')).toBeHidden();
  });
});

test.describe('phone usability', () => {
  test.use(phone);

  test('the version badge no longer floats over the content on phones', async ({ page }) => {
    await page.goto('/?view=frases');
    expect(await page.locator('#version-indicator').evaluate((el) => getComputedStyle(el).position)).toBe('static');
    // it must not sit on top of the first phrase buttons
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const badge = await page.locator('#version-indicator').boundingBox();
    const bar = await page.locator('#app-bar').boundingBox();
    expect(badge.y + badge.height).toBeLessThanOrEqual(bar.y + 1);
  });

  test('section tabs and "Ver detalle" links are at least 44 px tall', async ({ page }) => {
    await page.goto('/');
    for (const link of await page.locator('.nav-inner a').all()) {
      if (!(await link.isVisible())) continue;
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    const detail = page.locator('.quick-card .text-link').first();
    await expect(detail).toBeVisible();
    expect((await detail.boundingBox()).height).toBeGreaterThanOrEqual(44);
  });

  test('the section strip shows a fade while more tabs are hidden and drops it at the end', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('#city-view > nav');
    await expect(nav).toHaveAttribute('data-more-end', '');
    await page.locator('.nav-inner').evaluate((strip) => { strip.scrollLeft = strip.scrollWidth; });
    await expect(nav).not.toHaveAttribute('data-more-end', '');
    await expect(nav).toHaveAttribute('data-more-start', '');
  });

  test('filters start collapsed so the content comes first', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-filters')).not.toHaveAttribute('open', '');
    await expect(page.locator('.map-legend')).not.toHaveAttribute('open', '');
    await page.locator('.nav-inner a[href="#mapa"]').click();
    await expect.poll(async () => (await page.locator('#city-map').boundingBox()).y).toBeLessThan(500);
    await page.locator('#map-filters > summary').click();
    await expect(page.locator('#map-day-filters button').first()).toBeVisible();

    await page.goto('/?view=platos');
    await expect(page.locator('#dishes-filters')).not.toHaveAttribute('open', '');
    await expect(page.locator('.dish-card').first()).toBeInViewport({ ratio: 0.3 });
    await page.goto('/?view=frases');
    await expect(page.locator('#phrases-filters')).not.toHaveAttribute('open', '');
    await page.locator('#phrases-filters > summary').click();
    await page.getByRole('button', { name: 'Comida', exact: true }).click();
    await expect(page.locator('#phrases-filters-summary')).toHaveText('Filtros · Comida');
  });
});

test('on wide screens the filter panels start open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('#map-filters')).toHaveAttribute('open', '');
  await page.goto('/?view=platos');
  await expect(page.locator('#dishes-filters')).toHaveAttribute('open', '');
});

test('favourites shortcut in Frases and Platos jumps to the starred items and back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?view=frases');
  await expect(page.locator('#phrases-fav')).toHaveText('★ Favoritas (0)');
  await page.locator('.phrase-card[data-phrase-id="hai"] .phrase-fav').click();
  await expect(page.locator('#phrases-fav')).toHaveText('★ Favoritas (1)');
  await page.locator('#phrases-fav').click();
  await expect(page.locator('.phrase-card')).toHaveCount(1);
  await expect(page.locator('#phrases-fav')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#phrases-fav').click();
  await expect(page.locator('.phrase-card').nth(5)).toBeAttached();

  await page.goto('/?view=platos');
  await page.locator('.dish-card[data-dish-id="ramen"] .dish-fav').click();
  await page.locator('#dishes-fav').click();
  await expect(page.locator('.dish-card')).toHaveCount(1);
  expect((await page.locator('#dishes-fav').boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('show mode has Anterior/Siguiente that walk through the visible phrases', async ({ page }) => {
  await page.goto('/?view=frases');
  await page.getByRole('button', { name: 'Saludos' }).click();
  await page.locator('.phrase-card').first().getByRole('button', { name: /Mostrar/ }).click();
  const position = page.locator('#phrase-show-position');
  await expect(position).toHaveText(/^1 \/ \d+$/);
  const first = await page.locator('.phrase-show-ja').textContent();
  await page.locator('#phrase-show-next').click();
  await expect(position).toHaveText(/^2 \/ /);
  expect(await page.locator('.phrase-show-ja').textContent()).not.toBe(first);
  await page.keyboard.press('ArrowLeft');
  await expect(position).toHaveText(/^1 \/ /);
  await page.locator('#phrase-show-prev').click(); // wraps to the last one
  const total = Number((await position.textContent()).split(' / ')[1]);
  await expect(position).toHaveText(`${total} / ${total}`);
});

test('Platos search tolerates typos and accents', async ({ page }) => {
  await page.goto('/?view=platos');
  await page.locator('#dishes-search').fill('sasimi');
  await expect(page.locator('.dish-card[data-dish-id="sashimi"]')).toBeVisible();
  await page.locator('#dishes-search').fill('Ramén');
  await expect(page.locator('.dish-card[data-dish-id="ramen"]')).toBeVisible();
  await page.locator('#dishes-search').fill('xqzwvk');
  await expect(page.locator('.dish-card')).toHaveCount(0);
});

test('dish photos have a short Spanish alt text', async ({ page }) => {
  await page.goto('/?view=platos');
  const alt = await page.locator('.dish-card[data-dish-id="ramen"] img').getAttribute('alt');
  expect(alt).toBe('Foto de ramen');
});

test.describe('Cerca de mí', () => {
  const near = kyoto.places[0];
  test('far from the city, the list warns about the distance', async ({ browser }) => {
    const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 35.6762, longitude: 139.6503 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await page.locator('#locate-me').click();
    await expect(page.locator('#nearby-status')).toContainText(/Estás a \d+ km de Kioto/);
    await context.close();
  });

  test('in the city there is no warning', async ({ browser }) => {
    const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: near.lat, longitude: near.lng } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await page.locator('#locate-me').click();
    await expect(page.locator('#nearby-list button').first()).toBeVisible();
    await expect(page.locator('#nearby-status')).not.toContainText('Estás a');
    await context.close();
  });
});

test('the photo counter is hidden when a place has a single photo', async ({ page }) => {
  await page.route('**/data/cities/kyoto/details.json', async (route) => {
    const response = await route.fetch();
    const details = await response.json();
    const target = details.find(({ id }) => id === kyoto.places[0].id);
    target.photos = [{ src: 'assets/images/dishes/ramen-480.webp', alt: 'Una sola foto' }];
    const other = details.find(({ id }) => id === kyoto.places[1].id);
    other.photos = [{ src: 'assets/images/dishes/ramen-480.webp', alt: 'Foto 1' }, { src: 'assets/images/dishes/udon-480.webp', alt: 'Foto 2' }];
    await route.fulfill({ response, json: details });
  });
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await page.evaluate(() => { document.querySelector('#nearby-list'); });
  // Open both places through the map popups.
  const open = async (index) => {
    await page.locator(SVG_MARKERS).nth(index).dispatchEvent('click');
    await page.locator('.popup-detail-button').first().click();
  };
  await open(0);
  await expect(page.locator('#poi-photo-count')).toBeHidden();
  await page.locator('.poi-back').click();
  await open(1);
  await expect(page.locator('#poi-photo-count')).toBeVisible();
  await expect(page.locator('#poi-photo-count')).toHaveText('1 / 2');
});

test('an invalid ?view= is cleaned from the URL and the hash is dropped when changing view', async ({ page }) => {
  await page.goto('/?view=bad');
  await expect(page.locator('#city-view')).toBeVisible();
  await expect(page).not.toHaveURL(/view=/);
  await page.locator('.nav-inner a[href="#mapa"]').click();
  await expect(page).toHaveURL(/#mapa/);
  await page.locator('[data-view-target="frases"]').click();
  await expect(page).toHaveURL(/view=frases$/);
});
