import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const PIN = '4821#test';
const BOOKING = 'ZX-998877';
const card = (page, id) => page.locator(`.lodging-card[data-stay-id="${id}"]`);

async function fill(page, id = 'osaka') {
  const block = card(page, id);
  await block.locator('.lodging-private > summary').click();
  await block.getByLabel('PIN o código de acceso').fill(PIN);
  await block.getByLabel('Número de reserva').fill(BOOKING);
  await block.getByLabel('Notas (opcional)').fill('Planta 5, ascensor al fondo');
}

test('the Osaka card shows the approximate check-in time', async ({ page }) => {
  await page.goto('/?view=viaje');
  await expect(card(page, 'osaka')).toContainText('Check-in orientativo 12:00–14:00 (por confirmar)');
  await expect(card(page, 'kyoto')).not.toContainText('Check-in orientativo');
});

test('each stay has private fields with a clear privacy notice', async ({ page }) => {
  await page.goto('/?view=viaje');
  await expect(page.locator('.lodging-private')).toHaveCount(6);
  await expect(card(page, 'osaka').locator('.lodging-private > summary')).toContainText('solo en este móvil');
  await card(page, 'osaka').locator('.lodging-private > summary').click();
  await expect(card(page, 'osaka').locator('.lodging-private')).not.toContainText('No se sube'); // the summary already says it: no line repeated under every stay
  for (const label of ['PIN o código de acceso', 'Número de reserva', 'Notas (opcional)']) await expect(card(page, 'osaka').getByLabel(label)).toBeVisible();
});

test('PINs, reservations and notes are saved on this device as you type and survive a reload', async ({ page }) => {
  await page.goto('/?view=viaje');
  await fill(page);
  await page.reload();
  const block = card(page, 'osaka');
  await expect(block.locator('.lodging-private')).toHaveAttribute('open', ''); // opens by itself when it has data
  await expect(block.getByLabel('PIN o código de acceso')).toHaveValue(PIN);
  await expect(block.getByLabel('Número de reserva')).toHaveValue(BOOKING);
  await expect(block.getByLabel('Notas (opcional)')).toHaveValue('Planta 5, ascensor al fondo');
  await expect(card(page, 'kyoto').getByLabel('PIN o código de acceso')).toHaveValue('');
  const stored = await page.evaluate(() => localStorage.getItem('japan-trip:lodging-private'));
  expect(JSON.parse(stored).osaka.pin).toBe(PIN);
});

test('nothing you type is ever sent over the network', async ({ page }) => {
  const sent = [];
  page.on('request', (request) => { sent.push(`${request.method()} ${request.url()} ${request.postData() ?? ''}`); });
  await page.goto('/?view=viaje');
  await fill(page);
  await page.waitForTimeout(500);
  await page.reload();
  expect(sent.filter((entry) => entry.includes(PIN) || entry.includes(BOOKING) || entry.includes('Planta'))).toEqual([]);
  expect(sent.every((entry) => entry.startsWith('GET '))).toBe(true);
});

test('it also works without a connection', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.route('**/tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
  await page.goto('/?view=viaje');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => { const name = (await caches.keys()).find((key) => key.startsWith('japan-guide-')); return name ? (await (await caches.open(name)).keys()).length : 0; }), { timeout: 30_000 }).toBeGreaterThan(100);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await fill(page);
  await page.reload();
  await expect(card(page, 'osaka').getByLabel('PIN o código de acceso')).toHaveValue(PIN);
  // the private data is not in any cache
  const leaked = await page.evaluate(async (secret) => {
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
      if ((await (await (await caches.open(name)).match(request)).clone().text()).includes(secret)) return request.url;
    }
    return null;
  }, PIN);
  expect(leaked).toBeNull();
  await context.close();
});

test('only the Viaje view can be saved as PDF: the button exists there and calls the print view', async ({ page }) => {
  await page.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints += 1; }; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /PDF|Imprimir/ })).toHaveCount(0); // not in the guide hero or anywhere else
  for (const view of ['frases', 'platos']) {
    await page.locator(`[data-view-target="${view}"]`).click();
    await expect(page.getByRole('button', { name: /PDF|Imprimir/ })).toHaveCount(0);
  }
  await page.locator('[data-view-target="viaje"]').click();
  await fill(page);
  await page.getByRole('button', { name: 'Descargar PDF' }).click();
  expect(await page.evaluate(() => window.__prints)).toBe(1);
});

test('the print view contains only the Viaje view, with the private data written out', async ({ page }) => {
  await page.goto('/?view=viaje');
  await fill(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#app-bar')).toBeHidden();
  await expect(page.locator('#top-bar')).toBeHidden();
  await expect(page.locator('#city-view')).toBeHidden();
  await expect(page.locator('.lodging-actions').first()).toBeHidden();
  await expect(page.locator('.lodging-private').first()).toBeHidden();
  await expect(page.locator('.lodging-print-title')).toBeVisible();
  const osaka = card(page, 'osaka');
  await expect(osaka.locator('.lodging-print-private')).toBeVisible();
  await expect(osaka.locator('.lodging-print-private')).toContainText(`PIN o código de acceso: ${PIN}`);
  await expect(osaka.locator('.lodging-print-private')).toContainText(`Número de reserva: ${BOOKING}`);
  await expect(osaka.locator('.lodging-print-maps')).toContainText('https://maps.app.goo.gl/ohmM1sY272qXbuhj7');
  await expect(card(page, 'kyoto').locator('.lodging-print-private')).toBeEmpty();
  await expect(page.locator('.lodging-card')).toHaveCount(6);
});

test('printing from other views shows nothing of the private data', async ({ page }) => {
  await page.goto('/?view=viaje');
  await fill(page);
  await page.locator('[data-view-target="frases"]').click();
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('body').innerText()).not.toContain(PIN);
});

test('export, clear and import give the private data back (backup)', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/?view=viaje');
  await page.getByText('Copia de seguridad de mis datos privados').click();
  await page.locator('#lodging-export').click();
  await expect(page.locator('#lodging-backup-status')).toContainText('Todavía no hay datos privados');
  await fill(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#lodging-export').click()]);
  expect(download.suggestedFilename()).toBe('japon-2026-datos-privados.json');
  const file = testInfo.outputPath('backup.json');
  await download.saveAs(file);
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup.kind).toBe('japan-trip-2026/private-lodging');
  expect(backup.stays.osaka.pin).toBe(PIN);

  await page.locator('#lodging-clear').click();
  await expect(page.locator('#lodging-backup-status')).toContainText('borrados');
  await expect(card(page, 'osaka').getByLabel('PIN o código de acceso')).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('japan-trip:lodging-private'))).toBeNull();

  await page.locator('#lodging-import').setInputFiles(file);
  await expect(page.locator('#lodging-backup-status')).toContainText('Copia importada: 1 alojamientos');
  await expect(card(page, 'osaka').getByLabel('PIN o código de acceso')).toHaveValue(PIN);
  await expect(card(page, 'osaka').getByLabel('Número de reserva')).toHaveValue(BOOKING);
});

test('importing a wrong file is rejected without touching the data', async ({ page }, testInfo) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/?view=viaje');
  await fill(page);
  await page.getByText('Copia de seguridad de mis datos privados').click();
  const bad = testInfo.outputPath('bad.json');
  (await import('node:fs')).writeFileSync(bad, '{"hello":"world"}');
  await page.locator('#lodging-import').setInputFiles(bad);
  await expect(page.locator('#lodging-backup-status')).toContainText('no es una copia de seguridad');
  await expect(card(page, 'osaka').getByLabel('PIN o código de acceso')).toHaveValue(PIN);
});

test('"Borrar datos sin conexión" does not delete the private data', async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/?view=viaje');
  await fill(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.locator('#offline-chip').click();
  await Promise.all([page.waitForNavigation(), page.locator('#offline-reset').click()]);
  await expect(card(page, 'osaka').getByLabel('PIN o código de acceso')).toHaveValue(PIN);
  await context.close();
});

test.describe('on a 320 px phone', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test('the private fields fit and are comfortable to tap', async ({ page }) => {
    await page.goto('/?view=viaje');
    await fill(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for (const label of ['PIN o código de acceso', 'Número de reserva']) {
      const box = await card(page, 'osaka').getByLabel(label).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    expect((await page.locator('#lodging-pdf').boundingBox()).height).toBeGreaterThanOrEqual(44);
  });
});
