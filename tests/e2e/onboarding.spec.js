import { test, expect } from '@playwright/test';

const WORKER = 'https://japon-avisos.garridovic.workers.dev/avisos';
/** Switches coach marks on (they are off in automated browsers) and optionally seeds the saved state once. */
async function setup(page, state = null) {
  await page.route(WORKER, (route) => route.abort());
  await page.addInitScript((seed) => {
    localStorage.setItem('onboarding-enabled', '1');
    if (seed && !sessionStorage.getItem('onb-seeded')) { sessionStorage.setItem('onb-seeded', '1'); localStorage.setItem('onboarding-v1', JSON.stringify({ v: 1, sessions: 1, lastActive: seed.fresh ? Date.now() : 1, lastShown: 0, seen: {}, snoozed: {}, ...seed, fresh: undefined })); }
  }, state);
}
const tip = (page, flow) => page.locator(`.onb-tip[data-flow="${flow}"]`);

test.describe('feature onboarding', () => {
  test('first open: the welcome tip points at the city button, closes with «Entendido» and never returns', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(tip(page, 'welcome')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'welcome')).toContainText('cambias de ciudad');
    await expect(page.locator('#city-select')).toHaveClass(/onb-highlight/);
    await tip(page, 'welcome').getByRole('button', { name: 'Entendido' }).click();
    await expect(page.locator('.onb-tip')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.waitForTimeout(4000);
    await expect(page.locator('.onb-tip')).toHaveCount(0);
  });

  test('first session: the filters tip shows when the map is opened', async ({ page }) => {
    await setup(page, { sessions: 1, fresh: true, seen: { welcome: 1 } });
    await page.goto('/?view=mapa');
    await expect(tip(page, 'map-filters')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'map-filters')).toContainText('tipo de lugar y jornada');
  });

  test('«Más tarde» hides the tip for the rest of the session', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await tip(page, 'welcome').getByRole('button', { name: 'Más tarde' }).click({ timeout: 10_000 });
    await page.reload();
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.waitForTimeout(4000);
    await expect(page.locator('.onb-tip')).toHaveCount(0);
  });

  test('second session: the offline-map tip in Mapa offers «Guardar mapa»', async ({ page }) => {
    await setup(page, { sessions: 1, seen: { welcome: 1, 'map-filters': 1 } });
    await page.goto('/?view=mapa');
    await expect(tip(page, 'offline-map')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'offline-map').getByRole('button', { name: 'Guardar mapa' })).toBeVisible();
  });

  test('second session: the checklist tip shows in Viaje', async ({ page }) => {
    await setup(page, { sessions: 1, seen: { welcome: 1 } });
    await page.goto('/?view=viaje');
    await expect(tip(page, 'checklists')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'checklists')).toContainText('Marca lo que ya tienes');
  });

  test('the day before the trip: tabs, then taxi on the hotel card of the guide', async ({ page }) => {
    await setup(page, { sessions: 3, seen: { welcome: 1, 'map-filters': 1, 'offline-map': 1, checklists: 1 } });
    await page.clock.install({ time: new Date('2026-12-07T10:00:00') });
    await page.goto('/');
    await expect(tip(page, 'tabs')).toBeVisible({ timeout: 10_000 });
    await tip(page, 'tabs').getByRole('button', { name: 'Entendido' }).click();
    await page.clock.fastForward(61_000); // past the one-minute spacing between tips
    await page.locator('[data-view-target="mapa"]').first().click();
    await page.locator('[data-view-target="guia"]').first().click();
    await expect(tip(page, 'taxi')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'taxi').getByRole('button', { name: 'Probarlo ahora' })).toBeVisible();
    await expect(page.locator('#hero-hotel .taxi-button')).toHaveClass(/onb-highlight/);
  });

  test('before the eve there is no tabs or taxi tip', async ({ page }) => {
    await setup(page, { sessions: 3, seen: { welcome: 1, 'map-filters': 1, 'offline-map': 1, checklists: 1 } });
    await page.clock.install({ time: new Date('2026-11-27T10:00:00') });
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.waitForTimeout(4000);
    await expect(page.locator('.onb-tip')).toHaveCount(0);
  });

  test('«Cómo funciona» in the account panel repeats a tip even if it was seen', async ({ page }) => {
    await page.route('**/assets/auth-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const AUTH_CONFIG = { enabled: true, domain: 'test.eu.auth0.com', clientId: 'x' };" }));
    await page.route('**/assets/vendor/auth0-spa-js.production.esm.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export class Auth0Client { constructor(){} async isAuthenticated(){return false} async getUser(){return null} }' }));
    await setup(page, { sessions: 2, seen: { welcome: 1, 'map-filters': 1, 'offline-map': 1, checklists: 1 } });
    await page.goto('/');
    await page.locator('#account-button').click();
    await page.locator('[data-how="checklists"]').click();
    await expect(page).toHaveURL(/view=viaje/);
    await expect(tip(page, 'checklists')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'checklists').getByRole('button', { name: 'Más tarde' })).toHaveCount(0);
    expect(page.url()).not.toContain('onboarding=');
  });

  for (const [width, height] of [[390, 844], [320, 568]]) {
    for (const flow of [{ id: 'taxi', view: 'guia' }, { id: 'checklists', view: 'viaje' }, { id: 'map-filters', view: 'mapa' }, { id: 'tabs', view: 'guia' }]) {
      test(`«${flow.id}» tip: the target is scrolled into view and the whole tip, buttons included, stays between header and bottom bar at ${width}×${height}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await setup(page, { sessions: 2, seen: {} });
        await page.goto(`/?view=${flow.view}&onboarding=${flow.id}`);
        const node = tip(page, flow.id);
        await expect(node).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(400);
        const box = await page.evaluate((id) => {
          const rect = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
          const tipNode = document.querySelector(`.onb-tip[data-flow="${id}"]`);
          const buttons = [...tipNode.querySelectorAll('button')].map(rect);
          return { tip: rect(tipNode), buttons, target: rect(document.querySelector('.onb-highlight')), header: rect(document.getElementById('top-bar')), bar: rect(document.getElementById('app-bar')), vw: innerWidth, vh: innerHeight };
        }, flow.id);
        const barTop = box.bar.bottom > box.bar.top ? box.bar.top : box.vh;
        expect(box.tip.top).toBeGreaterThanOrEqual(box.header.bottom - 1);
        expect(box.tip.bottom).toBeLessThanOrEqual(barTop + 1);
        expect(box.tip.left).toBeGreaterThanOrEqual(0);
        expect(box.tip.right).toBeLessThanOrEqual(box.vw);
        for (const button of box.buttons) { expect(button.bottom).toBeLessThanOrEqual(barTop + 1); expect(button.top).toBeGreaterThanOrEqual(box.header.bottom - 1); }
        expect(box.target.bottom).toBeGreaterThan(box.header.bottom); // the highlighted element is on screen
        expect(box.target.top).toBeLessThan(barTop);
      });
    }
  }

  for (const flow of [{ id: 'welcome', view: 'guia' }, { id: 'map-filters', view: 'mapa' }, { id: 'tabs', view: 'guia' }, { id: 'checklists', view: 'viaje' }, { id: 'taxi', view: 'guia' }]) {
    test(`«${flow.id}» tip on a desktop screen sits at its element, not in the middle of the page`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await setup(page, { sessions: 2, seen: {} });
      await page.goto(`/?view=${flow.view}&onboarding=${flow.id}`);
      await expect(tip(page, flow.id)).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(800); // the tip follows its element for a moment while the page settles
      const geometry = await page.evaluate((id) => {
        const tipNode = document.querySelector(`.onb-tip[data-flow="${id}"]`).getBoundingClientRect();
        const target = document.querySelector('.onb-highlight').getBoundingClientRect();
        const center = target.left + target.width / 2;
        const gap = tipNode.top >= target.bottom ? tipNode.top - target.bottom : target.top - tipNode.bottom;
        return { tipLeft: tipNode.left, tipRight: tipNode.right, center, gap, vw: innerWidth, targetWidth: target.width, targetHeight: target.height };
      }, flow.id);
      expect(geometry.tipLeft).toBeGreaterThanOrEqual(0);
      expect(geometry.tipRight).toBeLessThanOrEqual(geometry.vw);
      // the target's centre is within the tip's horizontal span (or the tip is pinned at the screen edge nearest to it)
      expect(geometry.center >= geometry.tipLeft - 1 && geometry.center <= geometry.tipRight + 1).toBe(true);
      if (flow.id !== 'tabs') expect(geometry.targetWidth).toBeLessThan(400); // it points at one button or figure, not at a whole bar
      expect(geometry.targetHeight).toBeGreaterThan(14);
      expect(geometry.gap).toBeGreaterThanOrEqual(0);
      expect(geometry.gap).toBeLessThanOrEqual(24); // right next to it
    });
  }

  test('«Cómo funciona» goes to the right screen without reloading and shows the tip within a second', async ({ page }) => {
    await page.route('**/assets/auth-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const AUTH_CONFIG = { enabled: true, domain: 'test.eu.auth0.com', clientId: 'x' };" }));
    await page.route('**/assets/vendor/auth0-spa-js.production.esm.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export class Auth0Client { constructor(){} async isAuthenticated(){return false} async getUser(){return null} }' }));
    await setup(page, { sessions: 3, seen: { welcome: 1, 'map-filters': 1, 'offline-map': 1, checklists: 1, tabs: 1, taxi: 1 } });
    await page.goto('/?view=mapa');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.evaluate(() => { window.__sameDocument = true; });
    for (const [id, view] of [['taxi', 'guia'], ['checklists', 'viaje'], ['map-filters', 'mapa']]) {
      await page.locator('#account-button').click();
      const started = Date.now();
      await page.locator(`[data-how="${id}"]`).click();
      await expect(tip(page, id)).toBeVisible({ timeout: 5_000 });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(await page.evaluate(() => window.__sameDocument)).toBe(true); // no reload
      expect(page.url()).toContain(view === 'guia' ? '127.0.0.1' : `view=${view}`);
      await tip(page, id).getByRole('button', { name: 'Entendido' }).click();
    }
  });

  test('automated browsers stay free of tips unless switched on', async ({ page }) => {
    await page.route(WORKER, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.waitForTimeout(4000);
    await expect(page.locator('.onb-tip')).toHaveCount(0);
  });
});
