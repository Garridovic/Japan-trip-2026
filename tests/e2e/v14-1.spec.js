import { test, expect } from '@playwright/test';
import { mockWeather } from './helpers.js';

const tokyo = (iso) => new Date(`${iso}+09:00`);

test.describe('V14.1 header carousel and weather', () => {
  test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

  test('before the trip the header is compact: city, dates, countdown, hotel and the weather card', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    await expect(page.locator('#hero-range')).toHaveText('11–15 dic · 4 noches');
    await expect(page.locator('#hero-status')).toHaveText('Faltan 14 días');
    await expect(page.locator('#hero-hotel')).toContainText('Agora Kyoto Karasuma');
    await expect(page.locator('#hero-hotel .taxi-button')).toBeVisible();
    await expect(page.locator('#hero-hotel a')).toHaveText('Cómo llegar');
    await expect(page.locator('#today-card')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Abrir mapa interactivo' })).toHaveCount(0);
    await expect(page.locator('#hero-dots i')).toHaveCount(3);
    expect((await page.locator('.hero').boundingBox()).height).toBeLessThan(450); // fixed title + one row of cards
  });

  test('the weather card lists the trip days and keeps working with the forecast stored when offline', async ({ page, context }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    const days = page.locator('#weather-strip .wd');
    await expect(days).toHaveCount(5);
    await expect(days.first()).toContainText('Vie 11');
    await expect(days.nth(1)).toContainText('11°');
    await expect(page.locator('#weather-note')).toContainText('actualizado');
    expect(await page.evaluate(() => Boolean(localStorage.getItem('weather-v1:kyoto')))).toBe(true);
    expect(await page.evaluate(() => (window.japanTripUserData.snapshot().data['weather-v1:kyoto'] ?? null))).toBeNull();
    await mockWeather(page, { fail: true }); // the service is unreachable now
    await page.reload();
    await expect(page.locator('#weather-strip .wd').nth(1)).toContainText('11°');
  });

  test('tapping a day opens the hourly sheet; days change with the chips and the sheet closes with Esc and Back', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await page.locator('#weather-strip .wd[data-date="2026-12-12"]').click();
    const sheet = page.locator('#weather-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.locator('#weather-sheet-title')).toHaveText('Sábado 12 dic · Kioto');
    await expect(page.locator('#weather-hours .wh')).toHaveCount(6);
    await expect(page.locator('#weather-facts')).toContainText('Amanece 06:56');
    await page.locator('.wchip', { hasText: 'Lun 14' }).click();
    await expect(page.locator('#weather-sheet-title')).toHaveText('Lunes 14 dic · Kioto');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.locator('#weather-strip .wd[data-date="2026-12-12"]').click();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/$|\/\?/);
  });

  test('days beyond the forecast say so instead of showing invented numbers', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":true}' }));
    await page.goto('/');
    await expect(page.locator('#weather-strip .wd.is-empty')).toHaveCount(5);
    await expect(page.locator('#weather-strip .wd.is-empty').first()).toContainText('aún no');
    await expect(page.locator('#weather-strip .wd button, #weather-strip button.wd')).toHaveCount(0);
  });

  test('during the trip the header opens on "Ahora" and the weather highlights today', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-12T10:40:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#hero-status')).toHaveText('Día 2 de 4');
    await expect(page.locator('#today-card')).toBeVisible();
    await expect(page.locator('#today-card')).toContainText('Kiyomizu-dera');
    await expect(page.locator('#hero-dots i')).toHaveCount(4);
    await expect(page.locator('#weather-strip .wd.is-today')).toContainText('Sáb 12');
    await page.locator('#hero-viewport').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#hero-dots i').nth(1)).toHaveClass('on');
  });

  test('works on 320 px phones in dark mode with no horizontal scroll, and the sign-in invite lives in Viaje', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#weather-strip .wd')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#weather-strip .wd').first().click();
    const box = await page.locator('#weather-sheet').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await expect(page.locator('#hero .account-invite, .hero .account-invite')).toHaveCount(0);
  });
});

test.describe('V14.1.1 fixes', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('taxi screen without Japanese data keeps latin words whole at 390 px', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('.lodging-card[data-stay-id="kyoto"] .taxi-button').click();
    const words = await page.locator('#taxi-show .taxi-name, #taxi-show .taxi-address').evaluateAll((nodes) => nodes.map((node) => {
      // a word is split when a line ends in the middle of it: compare each word's rects
      const range = document.createRange();
      const split = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        for (const match of text.data.matchAll(/[A-Za-z0-9ōŌ]+/g)) {
          range.setStart(text, match.index); range.setEnd(text, match.index + match[0].length);
          const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
          if (tops.size > 1) split.push(match[0]);
        }
      }
      return split;
    }));
    expect(words.flat()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the top bar title never wraps onto two lines in Viaje', async ({ page }) => {
    await page.goto('/?view=viaje');
    const box = await page.locator('#top-bar-title').boundingBox();
    expect(box.height).toBeLessThan(30);
  });
});

test.describe('V14.1.3 equal cards', () => {
  test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const [label, iso, count] of [['before the trip', '2026-12-09T10:00:00', 3], ['during the trip', '2026-12-12T10:40:00', 4]]) {
    test(`all header cards have the same height ${label} and the weather card has no empty gap`, async ({ page }) => {
      await page.clock.setFixedTime(tokyo(iso));
      await mockWeather(page);
      await page.goto('/');
      await expect(page.locator('#weather-brief p').first()).toBeVisible();
      const heights = await page.locator('.hero-slide:visible').evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
      expect(heights).toHaveLength(count);
      expect(new Set(heights).size).toBe(1);
      const gap = await page.locator('[data-slide="tiempo"]').evaluate((slide) => {
        const note = slide.querySelector('.weather-note').getBoundingClientRect();
        const brief = slide.querySelector('.weather-brief').getBoundingClientRect();
        return Math.round(note.top - brief.bottom);
      });
      expect(gap).toBeLessThan(40);
    });
  }

  test('the weather card says the day, its summary and a tip with the figure it comes from', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-12T10:40:00'));
    await mockWeather(page);
    await page.goto('/');
    const brief = page.locator('#weather-brief');
    await expect(brief).toContainText('Hoy:');
    await expect(brief).toContainText('máx 11° · mín 2°');
    await expect(brief).toContainText('Frío por la mañana (2°): lleva abrigo');
  });
});

test.describe('V14.2.2 fixes', () => {
  test.use({ timezoneId: 'Asia/Tokyo', viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a city beyond the forecast says when the days will appear instead of loading forever', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-11-27T10:00:00'));
    let calls = 0;
    await page.route('https://api.open-meteo.com/**', (route) => { calls += 1; return route.abort('failed'); });
    await page.goto('/?city=osaka');
    await expect(page.locator('#hero-title')).toHaveText('Osaka');
    await expect(page.locator('#weather-note')).toContainText('días más aparecerán cuando haya previsión');
    await expect(page.locator('#weather-note')).not.toContainText('Cargando');
    await expect(page.locator('#weather-strip .wd.is-empty').first()).toContainText('aún no');
    expect(calls).toBe(0);
  });

  test('a failing service in range says so, and never stays on "Cargando"', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await page.route('https://api.open-meteo.com/**', (route) => route.abort('failed'));
    await page.goto('/');
    await expect(page.locator('#weather-note')).toContainText('No se ha podido cargar la previsión');
  });

  test('switching city empties the header instead of showing the previous city', async ({ page }) => {
    await page.clock.setFixedTime(tokyo('2026-12-09T10:00:00'));
    await mockWeather(page);
    await page.goto('/');
    await expect(page.locator('#hero-title')).toHaveText('Kioto');
    await page.route('**/data/cities/osaka/places.json', async (route) => { await new Promise((resolve) => setTimeout(resolve, 1500)); await route.continue(); });
    await page.locator('#city-select').click();
    await page.locator('#tab-osaka').click();
    await expect(page.locator('#hero-title')).toHaveText('…');
    await expect(page.locator('#hero-hotel')).toBeHidden();
    await expect(page.locator('#weather-strip .wd')).toHaveCount(0);
    await expect(page.locator('#hero-title')).toHaveText('Osaka', { timeout: 10_000 });
  });

  test('map popups open clear of the zoom buttons', async ({ page }) => {
    await page.goto('/?city=nara');
    await page.locator('#city-map').scrollIntoViewIfNeeded();
    const marker = page.locator('.leaflet-overlay-pane path').first();
    await expect(marker).toBeAttached({ timeout: 20_000 });
    await marker.dispatchEvent('click');
    const popup = page.locator('.leaflet-popup-content-wrapper');
    await expect(popup).toBeVisible();
    // The popup may still be panning into view (a marker outside the first view), so wait for it to settle.
    await expect.poll(async () => {
      const zoom = await page.locator('.leaflet-control-zoom').boundingBox();
      const box = await popup.boundingBox();
      return box.x < zoom.x + zoom.width && box.x + box.width > zoom.x && box.y < zoom.y + zoom.height && box.y + box.height > zoom.y;
    }, { timeout: 5_000 }).toBe(false);
  });
});
