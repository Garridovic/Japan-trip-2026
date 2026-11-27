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
  test('first open: the welcome tip points at the city tabs, closes with «Entendido» and never returns', async ({ page }) => {
    await setup(page);
    await page.goto('/');
    await expect(tip(page, 'welcome')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'welcome')).toContainText('cambias de ciudad');
    await expect(page.locator('#city-tabs')).toHaveClass(/onb-highlight/);
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

  test('the day before the trip: tabs in the guide, taxi in Viaje', async ({ page }) => {
    await setup(page, { sessions: 3, seen: { welcome: 1, 'map-filters': 1, 'offline-map': 1, checklists: 1 } });
    await page.clock.install({ time: new Date('2026-12-07T10:00:00') });
    await page.goto('/');
    await expect(tip(page, 'tabs')).toBeVisible({ timeout: 10_000 });
    await tip(page, 'tabs').getByRole('button', { name: 'Entendido' }).click();
    await page.clock.fastForward(61_000); // past the one-minute spacing between tips
    await page.locator('[data-view-target="viaje"]').first().click();
    await expect(tip(page, 'taxi')).toBeVisible({ timeout: 10_000 });
    await expect(tip(page, 'taxi').getByRole('button', { name: 'Probarlo ahora' })).toBeVisible();
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

  test('automated browsers stay free of tips unless switched on', async ({ page }) => {
    await page.route(WORKER, (route) => route.abort());
    await page.goto('/');
    await expect(page.locator('#hero-title')).not.toHaveText('…');
    await page.waitForTimeout(4000);
    await expect(page.locator('.onb-tip')).toHaveCount(0);
  });
});
