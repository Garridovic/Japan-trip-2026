import { test, expect } from '@playwright/test';
import { kyoto, version, journey, SVG_MARKERS, RESTAURANT_MARKERS, countFor } from './helpers.js';

const visitCount = kyoto.places.length;
const restaurantCount = kyoto.restaurants.length;

test('Kyoto loads its map, markers, tabs and full version', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#city-map')).toBeVisible();
  await expect(page.locator('#city-map')).toHaveAttribute('data-city', 'kyoto');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(restaurantCount);
  await expect(page.locator('#version-indicator')).toHaveText(`GUÍA · ${version.version}`);
  await expect(page.locator('meta[name="guide-version"]')).toHaveAttribute('content', version.version);
  await expect(page).toHaveTitle(kyoto.city.pageTitle);
  await expect(page.locator('#hero-title')).toHaveText('Kioto');
  expect(pageErrors).toEqual([]);
});

test('only enabled cities get a tab, in journey order: Kioto and Osaka', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tab');
  await expect(tabs).toHaveCount(journey.cities.filter((city) => city.enabled).length);
  await expect(tabs).toHaveText(['Kioto', 'Osaka']);
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
});

test('the Kyoto content migrated to data is fully rendered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.quick-card')).toHaveCount(4);
  await expect(page.locator('.day-detail')).toHaveCount(4);
  await expect(page.locator('.day-detail .stop')).toHaveCount(kyoto.itinerary.days.reduce((sum, day) => sum + (day.detail?.stops.length ?? 0), 0));
  await expect(page.locator('.food-card')).toHaveCount(restaurantCount);
  await expect(page.locator('.food-highlight')).toHaveCount(8);
  await expect(page.locator('.extra-card')).toHaveCount(kyoto.extras.items.length);
  await expect(page.locator('#notes-grid .note-card')).toHaveCount(4);
  await expect(page.locator('.sources li')).toHaveCount(24);
  await expect(page.locator('.connection-card')).toContainText('Kioto → Osaka');
  await expect(page.getByRole('button', { name: /Imprimir|PDF/ })).toHaveCount(0); // only the Viaje view can be saved as PDF
  const kmlHref = await page.locator('#footer-kml-link').getAttribute('href');
  expect((await page.request.get(kmlHref)).ok()).toBe(true);
});

test('a place marker opens its detail sheet', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS).first()).toBeVisible({ timeout: 20_000 });
  await page.locator(SVG_MARKERS).first().click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  await page.getByRole('button', { name: 'Ver ficha del lugar' }).click();
  await expect(page.locator('#poi-modal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#poi-title')).not.toBeEmpty();
  await expect(page.locator('#poi-kicker')).toHaveText('GUÍA DE KIOTO');
  await page.keyboard.press('Escape');
  await expect(page.locator('#poi-modal')).toHaveAttribute('aria-hidden', 'true');
});

test('a restaurant marker has no place sheet, only Google Maps links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(restaurantCount, { timeout: 20_000 });
  await page.locator(RESTAURANT_MARKERS).first().dispatchEvent('click');
  await expect(page.locator('.leaflet-popup')).toContainText('Marcador orientativo');
  await expect(page.getByRole('button', { name: 'Ver ficha del lugar' })).toHaveCount(0);
});

test('map filters by day and by kind keep the right markers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });

  await page.getByRole('button', { name: '14 dic · eventos' }).click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(countFor(kyoto.places, '14'));
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(countFor(kyoto.restaurants, '14'));
  await expect(page.locator('#map-filter-status')).toContainText('filtro 14 dic');

  await page.getByRole('button', { name: 'Alternativas', exact: true }).first().click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(countFor(kyoto.places, 'extra'));

  await page.getByRole('button', { name: 'Todos los días' }).first().click();
  await page.getByRole('button', { name: 'Solo restaurantes' }).click();
  await expect(page.locator(SVG_MARKERS)).toHaveCount(0);
  await expect(page.locator(RESTAURANT_MARKERS)).toHaveCount(restaurantCount);
});

test('restaurant filters update the visible restaurant cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.food-card:visible')).toHaveCount(restaurantCount);
  await expect(page.locator('#food-count')).toHaveText(`Mostrando ${restaurantCount} lugares.`);

  await page.locator('.food-day-filter').nth(2).click(); // 12 dic
  const dayCount = countFor(kyoto.restaurants, '12');
  await expect(page.locator('.food-card:visible')).toHaveCount(dayCount);
  await expect(page.locator('#food-count')).toHaveText(`Mostrando ${dayCount} de ${restaurantCount} lugares.`);

  await page.locator('.food-type-filter', { hasText: 'Ramen y soba' }).click();
  const expected = kyoto.restaurants.filter((item) => item.day === '12' && item.foodCategory === 'fideos').length;
  await expect(page.locator('.food-card:visible')).toHaveCount(expected);

  await page.locator('.food-day-filter').first().click();
  await page.locator('.food-type-filter').first().click();
  await expect(page.locator('.food-card:visible')).toHaveCount(restaurantCount);
});

test('alternative places can be filtered by category', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.extra-card:visible')).toHaveCount(kyoto.extras.items.length);
  await page.locator('#extras-toolbar .filter', { hasText: 'Templos' }).click();
  await expect(page.locator('.extra-card:visible')).toHaveCount(kyoto.extras.items.filter((item) => item.category === 'templos').length);
});

test('GPS shows the nearest places and opens an event sheet with its route', async ({ browser }) => {
  const bishamondo = kyoto.places.find(({ id }) => id === 'bishamondo');
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: bishamondo.lat, longitude: bishamondo.lng }
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.locator('#locate-me').click();
  await expect(page.locator('#nearby-list li')).toHaveCount(7);
  await expect(page.locator('#nearby-status')).toContainText('lugares más próximos');
  await page.locator('#nearby-list button', { hasText: bishamondo.name }).click();
  await expect(page.locator('#poi-event')).toBeVisible();
  await expect(page.locator('#poi-event')).toContainText('Yamashina Gishi Matsuri');
  await expect(page.locator('#poi-event li')).toHaveCount(4);
  await context.close();
});

test('a place photo that fails to load shows the visual fallback', async ({ browser }) => {
  const nishiki = kyoto.places.find(({ id }) => id === 'nishiki');
  const context = await browser.newContext({
    permissions: ['geolocation'],
    geolocation: { latitude: nishiki.lat, longitude: nishiki.lng }
  });
  const page = await context.newPage();
  await page.route(/\.(webp|jpe?g)(\?.*)?$/, (route) => route.abort());
  await page.route('**/commons.wikimedia.org/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  await page.locator('#locate-me').click();
  await page.locator('#nearby-list button', { hasText: nishiki.name }).first().click();
  await expect(page.locator('#poi-modal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#poi-photo')).toHaveClass(/is-fallback/);
  await context.close();
});

test('the section navigation highlights the section being read', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(visitCount, { timeout: 20_000 });
  const current = page.locator('.nav-inner a[aria-current="location"]');
  await expect(current).toHaveText('Vista rápida');
  await page.locator('#mapa').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.getElementById('mapa').offsetTop - 60));
  await expect(current).toHaveText('Mapa');
  await page.evaluate(() => window.scrollTo(0, document.getElementById('detalle').offsetTop - 60));
  await expect(current).toHaveText('Día a día');
  await expect(current).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(current).toHaveText('Fuentes');
});
