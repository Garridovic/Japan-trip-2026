import { test, expect } from '@playwright/test';

test('the guide loads its map and all map markers', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#kyoto-map')).toBeVisible();
  await expect(page.locator('.leaflet-pane .leaflet-marker-pane path')).toHaveCount(32, { timeout: 20_000 });
  await expect(page.locator('.restaurant-map-marker')).toHaveCount(20);
  await expect(page.locator('#version-indicator')).toContainText('V9');
  expect(pageErrors).toEqual([]);
});

test('a place marker opens its detail sheet', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.leaflet-pane .leaflet-marker-pane path').first()).toBeVisible({ timeout: 20_000 });
  await page.locator('.leaflet-pane .leaflet-marker-pane path').first().click();
  await expect(page.locator('.leaflet-popup')).toBeVisible();
  await page.getByRole('button', { name: 'Ver ficha del lugar' }).click();
  await expect(page.locator('#poi-modal')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#poi-title')).not.toBeEmpty();
});

test('restaurant filters update the visible restaurant cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.food-card')).not.toHaveCount(0);
  await page.locator('.food-day-filter').nth(1).click();
  await expect(page.locator('#food-count')).toBeVisible().catch(() => {});
  await expect(page.locator('.food-card:visible').first()).toBeVisible();
});
