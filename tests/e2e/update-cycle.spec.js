import { test, expect } from '@playwright/test';
import { kyoto, SVG_MARKERS, version } from './helpers.js';

// Real browser, real service worker: version N is installed, then "the next deployment" appears (a cookie makes the test
// server answer with a new version.json, a new worker stamp and slow photos) and the page has to end up on the new version.
test.use({ serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial' });

const NEW_VERSION = 'V99.0.0';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function installed(page, context) {
  await context.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.goto('/');
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => { const n = (await caches.keys()).find((k) => k.startsWith('japan-guide-')); return n ? (await (await caches.open(n)).keys()).length : 0; }), { timeout: 30_000 }).toBeGreaterThan(250);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await expect(page.locator('#update-version')).toHaveText(version.version);
}

const deploy = (context, delay = 1500, flag = '') => context.addCookies([{ name: 'fake-deploy', value: `${NEW_VERSION}~${delay}${flag ? `~${flag}` : ''}`, url: `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}` }]);
const checkNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('online')));

test('a new version is applied by itself when the app is opened and nothing is half-done, even with slow photos', async ({ page, context }) => {
  test.setTimeout(90_000);
  await installed(page, context);
  await deploy(context);
  await checkNow(page);
  // Photos take 1.5 s each, so installing everything would take far longer than this: the app alone has to be enough.
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 20_000 });
  await expect(page.locator('#update-banner')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('japan-guide-')).length)).toBe(1);
  await expect(page.locator(SVG_MARKERS)).toHaveCount(kyoto.places.length, { timeout: 20_000 });
});

test('after the person has touched the app a banner appears, and "Actualizar" loads the new version', async ({ page, context }) => {
  test.setTimeout(90_000);
  await installed(page, context);
  await page.locator('body').click({ position: { x: 5, y: 5 } }); // the person is using the app
  await deploy(context);
  await checkNow(page);
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#update-banner-text')).toContainText(NEW_VERSION);
  await page.locator('#update-reload').click();
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 20_000 });
  await expect(page.locator('#update-banner')).toBeHidden();
});

test('a field being edited blocks the automatic update, and the banner still works', async ({ page, context }) => {
  test.setTimeout(90_000);
  await installed(page, context);
  await page.locator('[data-view-target="frases"]').click({ noWaitAfter: true });
  await page.locator('#phrases-search').fill('gra');
  await deploy(context);
  await checkNow(page);
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#phrases-search')).toHaveValue('gra'); // nothing was reloaded under the person's hands
  await page.locator('#update-reload').click();
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 20_000 });
});

test('the small photos of the new version are downloaded in the background after the switch', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installed(page, context);
  await deploy(context, 0);
  await checkNow(page);
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 20_000 });
  await expect.poll(() => page.evaluate(async () => { const n = (await caches.keys()).find((k) => k.startsWith('japan-guide-')); return n ? (await (await caches.open(n)).keys()).length : 0; }), { timeout: 60_000 }).toBeGreaterThan(250);
});

test('even when the new worker can never install, "Actualizar" ends on the new version (start-over route)', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installed(page, context);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await deploy(context, 0, 'broken');
  await checkNow(page);
  await expect(page.locator('#update-banner')).toBeVisible({ timeout: 15_000 });
  await page.locator('#update-reload').click();
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 60_000 });
  expect(page.url()).not.toContain('_u='); // the cache-busting parameter is taken off the address again
  await expect(page.locator('#update-banner')).toBeHidden();
});

test('after a start-over the check still runs: a newer version published later shows the banner again', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installed(page, context);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await deploy(context, 0, 'broken');
  await checkNow(page);
  await page.locator('#update-reload').click();
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 60_000 });
  await context.addCookies([{ name: 'fake-deploy', value: 'V99.1.0~0~broken', url: `http://127.0.0.1:${process.env.E2E_PORT ?? 4173}` }]);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await checkNow(page);
  await expect(page.locator('#update-banner-text')).toContainText('V99.1.0', { timeout: 20_000 });
});

test('the settings block shows installed and published versions and can force the update', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installed(page, context);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.evaluate(async () => {
    const { updateSection } = await import('/js/modules/update-settings.js');
    document.body.append(updateSection());
  });
  await expect(page.locator('#settings-version-installed')).toHaveText(version.version);
  await page.locator('#settings-update-check').click();
  await expect(page.locator('#settings-version-message')).toHaveText('Tienes la última versión.');
  await deploy(context, 0, 'broken');
  await page.locator('#settings-update-check').click();
  await expect(page.locator('#settings-version-published')).toHaveText(NEW_VERSION);
  await page.locator('#settings-update-force').click();
  await expect(page.locator('#update-version')).toHaveText(NEW_VERSION, { timeout: 60_000 });
});
