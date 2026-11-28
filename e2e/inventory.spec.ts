import { expect, test } from '@playwright/test';

test('add an item, use it up with the stepper, and it leaves the list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add item' }).click();

  const sheet = page.getByRole('dialog', { name: 'Add item' });
  await sheet.getByLabel('Name').fill('Eggs');
  await sheet.getByLabel('Quantity').fill('1');
  await sheet.getByLabel('Expiry date').fill('2099-01-15');
  await sheet.getByLabel('Date type').selectOption('use_by');
  await sheet.getByRole('button', { name: 'Add' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'Eggs' });
  await expect(row).toContainText('Use by 15 Jan 2099');

  await row.getByRole('button', { name: 'One less Eggs' }).click();
  const prompt = page.getByRole('alertdialog', { name: 'Used up Eggs?' });
  await prompt.getByRole('button', { name: 'Yes, used up' }).click();

  await expect(page.getByText('Eggs marked as used up')).toBeVisible();
  await expect(page.getByText('Nothing in the fridge yet.')).toBeVisible();
});

test('move an item to the freezer and it survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Bread');
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();

  await page.getByRole('button', { name: /^Bread/ }).click();
  await page
    .getByRole('dialog', { name: 'Edit Bread' })
    .getByRole('button', { name: 'Freezer' })
    .click();
  await expect(page.getByText('Nothing in the fridge yet.')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Freezer' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Bread' })).toBeVisible();
});
