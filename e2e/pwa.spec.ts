import { expect, test } from '@playwright/test';

test('serves an installable manifest', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('Shelf Life');
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test('loads the app shell offline once the service worker is installed', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Shelf Life' })).toBeVisible();

  // Wait until the service worker has installed and precached the app shell.
  // A first install activates straight away, so the reload below is served by it.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Shelf Life' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fridge' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Offline');
});

test('Chrome reports no installability errors', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors.map((e) => e.errorId)).toEqual([]);
});
