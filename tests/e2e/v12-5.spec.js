import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kyoto, SVG_MARKERS } from './helpers.js';

const lodging = JSON.parse(readFileSync(new URL('../../data/global/lodging.json', import.meta.url), 'utf8'));
const LANDSCAPE = { width: 844, height: 390 };
const withJapanese = async (page) => {
  await page.route('**/data/global/lodging.json', async (route) => {
    const data = JSON.parse(readFileSync(new URL('../../data/global/lodging.json', import.meta.url), 'utf8'));
    data.stays.forEach((stay) => { if (stay.id === 'kyoto') Object.assign(stay, { nameJa: 'テストホテル京都', addressJa: '京都府京都市下京区テスト町1-2-3', phone: '+81 75-000-0000' }); });
    await route.fulfill({ json: data });
  });
};

test.describe('taxi mode', () => {
  test('every stay card in Viaje has a taxi button that opens the full-screen screen', async ({ page }) => {
    await withJapanese(page);
    await page.goto('/?view=viaje');
    await expect(page.locator('.lodging-card .taxi-button')).toHaveCount(lodging.stays.length);
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    const taxi = page.locator('#taxi-show');
    await expect(taxi).toBeVisible();
    await expect(taxi.locator('.taxi-name')).toHaveText('テストホテル京都');
    await expect(taxi.locator('.taxi-address')).toHaveText('京都府京都市下京区テスト町1-2-3');
    await expect(taxi.locator('.taxi-es')).toContainText('Agora Kyoto Karasuma');
    await expect(taxi.locator('.taxi-directions')).toHaveAttribute('href', /^https:\/\//);
    await expect(taxi.locator('.taxi-call')).toHaveAttribute('href', 'tel:+81750000000');
    await expect(taxi.locator('.taxi-missing')).toHaveCount(0);
  });

  test('without Japanese data it shows the Latin name big and a notice, with no invented text', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('.lodging-card[data-stay-id="osaka"] .taxi-button').click();
    const taxi = page.locator('#taxi-show');
    await expect(taxi.locator('.taxi-name')).toHaveText('The Bridge Hotel Shinsaibashi');
    await expect(taxi.locator('.taxi-missing')).toBeVisible();
    await expect(taxi.locator('.taxi-call')).toHaveCount(0);
  });

  test('copy puts the address on the clipboard; Back and Escape close it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await withJapanese(page);
    await page.goto('/?view=viaje');
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    await page.locator('.taxi-copy').click();
    await expect(page.locator('.taxi-copy')).toHaveText('Copiada ✓');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('テストホテル京都\n京都府京都市下京区テスト町1-2-3');
    await page.locator('#taxi-show-close').click();
    await expect(page.locator('#taxi-show')).toBeHidden();
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#taxi-show')).toBeHidden();
  });

  test('the Back button closes the taxi screen instead of leaving the page', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    await expect(page.locator('#taxi-show')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#taxi-show')).toBeHidden();
    await expect(page).toHaveURL(/view=viaje/);
  });

  test('the hotel in the city header has a taxi chip', async ({ page }) => {
    await page.goto('/');
    await page.locator('#hero-hotel .taxi-button').click();
    await expect(page.locator('#taxi-show .taxi-es')).toContainText('Agora Kyoto Karasuma');
  });

  test('the hotel marker popup on the map has a taxi button, and so does its place sheet; other places do not', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    expect(kyoto.places[0].type).toBe('hotel');
    await page.locator(SVG_MARKERS).nth(0).dispatchEvent('click');
    await expect(page.locator('.leaflet-popup .taxi-button')).toBeVisible();
    await page.locator('.popup-detail-button').first().click();
    await expect(page.locator('#poi-taxi')).toBeVisible();
    await page.locator('#poi-taxi').click();
    await expect(page.locator('#taxi-show .taxi-es')).toContainText('Agora Kyoto Karasuma');
  });

  test('a place that is not a hotel has no taxi button', async ({ page }) => {
    await page.goto('/?view=mapa');
    await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
    await page.locator(SVG_MARKERS).nth(1).dispatchEvent('click');
    await expect(page.locator('.leaflet-popup .popup-title')).toBeVisible();
    await expect(page.locator('.leaflet-popup .taxi-button')).toHaveCount(0);
    await page.locator('.popup-detail-button').first().click();
    await expect(page.locator('#poi-taxi')).toBeHidden();
  });

  test('on a landscape phone the taxi text fits without page scroll', async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    await withJapanese(page);
    await page.goto('/?view=viaje');
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    const box = await page.locator('#taxi-show').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(box.sh).toBeLessThanOrEqual(box.ch + 1);
    const name = await page.locator('.taxi-name').boundingBox();
    expect(name.height).toBeGreaterThan(40);
    for (const sel of ['.taxi-directions', '.taxi-copy', '#taxi-show-close']) {
      const b = await page.locator(sel).boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(LANDSCAPE.height);
      expect(b.x + b.width).toBeLessThanOrEqual(LANDSCAPE.width);
    }
  });
});

test.describe('presentation modes in landscape', () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true, isMobile: true });

  test('a phrase fills the screen: big text on the left, buttons in a column on the right, nothing cut off', async ({ page }) => {
    await page.goto('/?view=frases');
    await page.locator('.phrase-card .is-primary').first().click();
    const show = page.locator('#phrase-show');
    await expect(show).toBeVisible();
    const ja = await show.locator('.phrase-show-ja').boundingBox();
    expect(ja.height).toBeGreaterThan(60);
    const close = await show.locator('#phrase-show-close').boundingBox();
    expect(close.x).toBeGreaterThan(LANDSCAPE.width / 2);
    for (const sel of ['.phrase-show-actions .phrase-btn', '#phrase-show-next']) {
      const b = await show.locator(sel).first().boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(LANDSCAPE.height);
      expect(b.x + b.width).toBeLessThanOrEqual(LANDSCAPE.width);
    }
    expect(await show.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });

  test('a dish shows its photo beside the text', async ({ page }) => {
    await page.goto('/?view=platos');
    await page.locator('.dish-open').first().click();
    const show = page.locator('#dish-show');
    await expect(show).toBeVisible();
    const photo = await show.locator('.dish-show-photo').boundingBox();
    const ja = await show.locator('.phrase-show-ja').boundingBox();
    expect(photo.x + photo.width).toBeLessThanOrEqual(ja.x + 2);
    expect(photo.height).toBeGreaterThan(200);
  });
});

test.describe('presentation modes in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('portrait keeps the old layout and shows the rotate hint', async ({ page }) => {
    await page.goto('/?view=frases');
    await page.locator('.phrase-card .is-primary').first().click();
    await expect(page.locator('#phrase-show .show-rotate-hint')).toBeVisible();
    const ja = await page.locator('#phrase-show .phrase-show-ja').boundingBox();
    expect(ja.width).toBeGreaterThan(100);
  });
});

test.describe('illustrations for places without a photo', () => {
  test('every restaurant card gets a drawing for what it serves, hidden from screen readers', async ({ page }) => {
    await page.goto('/#gastronomia');
    const cards = page.locator('.food-card');
    await expect(cards.first()).toBeAttached();
    const total = await cards.count();
    expect(total).toBeGreaterThan(0);
    await expect(page.locator('.food-card .card-art')).toHaveCount(total);
    await expect(page.locator('.food-card .card-art').first()).toHaveAttribute('aria-hidden', 'true');
    const ramen = page.locator('.food-card', { hasText: 'Nippon Ramen Rin' }).locator('.card-art');
    await expect(ramen).toHaveAttribute('data-art', 'noodles');
    await expect(page.locator('.food-card', { hasText: 'Mercado Nishiki' }).locator('.card-art')).toHaveAttribute('data-art', 'market');
  });

  test('other places use the category drawing', async ({ page }) => {
    await page.goto('/#alternativas');
    const cards = page.locator('.extra-card');
    await expect(cards.first()).toBeAttached();
    await expect(page.locator('.extra-card .card-art')).toHaveCount(await cards.count());
    await expect(page.locator('.extra-card[data-category="templos"] .card-art').first()).toHaveAttribute('data-art', 'temple');
  });

  test('the drawings are visible and sized in dark mode too', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/#gastronomia');
    await expect(page.locator('.food-card .card-art svg').first()).toBeAttached();
    const box = await page.locator('.food-card .card-art svg').first().boundingBox();
    expect(box.width).toBeGreaterThan(40);
    const stroke = await page.locator('.food-card .card-art .s').first().evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).not.toBe('none');
  });
});
