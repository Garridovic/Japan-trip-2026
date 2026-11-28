import { test, expect } from '@playwright/test';

test.describe('checklist in Viaje', () => {
  test('shows the base list with progress; checking an item persists after reload', async ({ page }) => {
    await page.goto('/?view=viaje');
    await expect(page.locator('#checklist h2')).toHaveText('Checklist del viaje');
    await expect(page.locator('#checklist-count')).toHaveText(/^0 de \d+ listos$/);
    await page.locator('#checklist-groups details[data-group="documentos"]').evaluate((el) => { el.open = true; });
    await page.getByRole('checkbox', { name: 'Pasaporte en vigor' }).check();
    await expect(page.locator('#checklist-count')).toHaveText(/^1 de \d+ listos$/);
    await expect(page.locator('.checklist-item[data-item-id="pasaporte"]')).toHaveClass(/is-done/);
    await page.reload();
    await page.locator('#checklist-groups details[data-group="documentos"]').evaluate((el) => { el.open = true; });
    await expect(page.getByRole('checkbox', { name: 'Pasaporte en vigor' })).toBeChecked();
  });

  test('the user can add their own item, tick it, and remove it', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('#checklist-input').fill('Cámara de fotos');
    await page.locator('#checklist-form button').click();
    const mine = page.locator('.checklist-item', { hasText: 'Cámara de fotos' });
    await expect(mine).toBeVisible();
    await mine.getByRole('checkbox').check();
    await expect(page.locator('#checklist-count')).toHaveText(/^1 de \d+ listos$/);
    await page.reload();
    await page.locator('#checklist-groups details[data-group="mis"]').evaluate((el) => { el.open = true; });
    await expect(page.locator('.checklist-item', { hasText: 'Cámara de fotos' })).toBeVisible();
    await expect(page.locator('.checklist-item', { hasText: 'Cámara de fotos' }).getByRole('button', { name: /Quitar/ })).toBeHidden(); // deleting needs «Editar»
    await page.locator('#checklist-edit').click();
    await expect(page.locator('#checklist-edit')).toHaveText('Listo');
    await page.locator('.checklist-item', { hasText: 'Cámara de fotos' }).getByRole('button', { name: /Quitar/ }).click();
    await expect(page.locator('.checklist-item', { hasText: 'Cámara de fotos' })).toHaveCount(0);
  });

  test('it also stores through the single user-data layer and is exposed for a future sync', async ({ page }) => {
    await page.goto('/?view=viaje');
    await page.locator('#checklist-groups details[data-group="documentos"]').evaluate((el) => { el.open = true; });
    await page.getByRole('checkbox', { name: 'Pasaporte en vigor' }).check();
    const snapshot = await page.evaluate(() => window.japanTripUserData.snapshot());
    expect(Object.keys(snapshot.data)).toContain('checklist-v1');
    expect(JSON.parse(snapshot.data['checklist-v1']).checked).toContain('pasaporte');
  });

  test('a connected backend receives changes and can restore data before the app starts', async ({ page }) => {
    await page.addInitScript(() => {
      window.__saved = [];
      const wait = setInterval(() => {
        if (!window.japanTripUserData) return;
        clearInterval(wait);
        window.japanTripUserData.connect({
          load: async () => ({ updatedAt: 1, data: { 'visited-v1': JSON.stringify({ kyoto: ['nishiki'] }), 'checklist-v1': JSON.stringify({ checked: ['cargador'], custom: [], removed: [] }) } }),
          save: async (snapshot) => { window.__saved.push(snapshot); }
        });
      }, 1);
    });
    await page.goto('/?view=viaje');
    await page.locator('#checklist-groups details[data-group="maleta"]').evaluate((el) => { el.open = true; });
    await expect(page.getByRole('checkbox', { name: 'Cargador del móvil' })).toBeChecked();
    await page.getByRole('checkbox', { name: 'Adaptador de enchufe' }).check();
    await expect.poll(() => page.evaluate(() => window.__saved.length)).toBeGreaterThan(0);
  });
});
