import { expect, test } from '@playwright/test';

test('tapping a location tab switches to it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Freezer' }).click();
  await expect(page.getByRole('tab', { name: 'Freezer' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveText(/Nothing in the freezer yet/);
});
