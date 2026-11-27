import { test, expect } from '@playwright/test';

test('Viaje shows the practical tips with collapsible categories above the stays', async ({ page }) => {
  await page.goto('/?view=viaje');
  const block = page.locator('#consejos');
  await expect(block).toBeVisible();
  await expect(block.locator('h2')).toHaveText('Consejos prácticos');
  const groups = block.locator('details.tips-group');
  await expect(groups.locator('summary > span:first-child')).toHaveText(['Etiqueta', 'Antes y durante el viaje', 'Kioto', 'Osaka']);
  await expect(groups.first()).not.toHaveAttribute('open', '');
  const tip = block.locator('[data-tip-id="bandeja"]');
  await expect(tip).toBeHidden();
  await groups.first().locator('summary').click();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Consejo de un amigo');
  const above = await page.evaluate(() => document.querySelector('#consejos').getBoundingClientRect().top < document.querySelector('#viaje').getBoundingClientRect().top);
  expect(above).toBe(true);
});

test('facts to check are flagged and links open in a new tab', async ({ page }) => {
  await page.goto('/?view=viaje');
  await page.locator('details[data-tips-group="antes-y-durante"] summary').click();
  const jr = page.locator('[data-tip-id="jr-pass"]');
  await expect(jr.locator('.tip-verify')).toHaveText('Confirmar antes de ir');
  await expect(jr.locator('a')).toHaveAttribute('target', '_blank');
  await expect(jr.locator('a')).toHaveAttribute('href', /^https:\/\//);
});

test('city tips sit under their city whichever tab is active, with no mixing', async ({ page }) => {
  await page.goto('/?view=viaje');
  const kyoto = page.locator('details[data-tips-group="city-kyoto"]');
  const osaka = page.locator('details[data-tips-group="city-osaka"]');
  await kyoto.locator('summary').click();
  await osaka.locator('summary').click();
  await expect(kyoto).toContainText('Fushimi Inari');
  await expect(kyoto).not.toContainText(/okonomiyaki|ookini/i);
  await expect(osaka).toContainText('Ookini');
  await expect(osaka).not.toContainText('Fushimi');
});

test('the tips are not part of the printed stays document', async ({ page }) => {
  await page.goto('/?view=viaje');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#consejos')).toBeHidden();
});


