import { expect, instrument, test } from './fixtures/registry';

test.describe('the command palette', () => {
  test('is not there until it is asked for', async ({ signedIn: page }) => {
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  });

  test('opens on control k and closes on escape', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  });

  test('lists the commands this role may use', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');

    await expect(page.getByRole('button', { name: /Instrument register/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Site tree/ })).toBeHidden();
  });

  test('narrows as you type', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('capa');

    await expect(page.locator('.result')).toHaveCount(1);
    await expect(page.locator('.result').first()).toContainText('Capacity');
  });

  test('finds a command through a word that is not in its title', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('overdue');

    await expect(page.locator('.result').first()).toContainText('Recall board');
  });

  test('goes where the highlighted command points', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('recall');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/recalls/);
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
  });

  test('exactly one result is highlighted at a time', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('r');

    await expect(page.locator('.result--on')).toHaveCount(1);
    await expect(page.locator('.result').first()).toHaveClass(/result--on/);
  });

  test('clicking a result goes there', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('impact');
    await page.locator('.result').first().click();

    await expect(page).toHaveURL(/\/impact/);
  });

  test('offers to jump when an asset tag is typed in', async ({ signedIn: page, registry }) => {
    await registry.on('**/api/instruments/by-tag/SG-000101', {
      ...instrument(1, 'SG-000101'),
      className: 'External micrometer',
      description: null,
      baseIntervalDays: 365,
      minIntervalDays: 180,
      maxIntervalDays: 730,
      unit: 'mm',
      rangeLow: 0,
      rangeHigh: 25,
      resolution: 0.001,
      locationPath: ['HARLOW', 'HARLOW-DIM'],
      retiredOn: null,
      createdAt: '2021-03-01T09:00:00Z',
      updatedAt: '2026-03-01T09:00:00Z',
      version: 1,
    });
    await registry.on('**/api/instruments/1', {
      ...instrument(1, 'SG-000101'),
      className: 'External micrometer',
      description: null,
      baseIntervalDays: 365,
      minIntervalDays: 180,
      maxIntervalDays: 730,
      unit: 'mm',
      rangeLow: 0,
      rangeHigh: 25,
      resolution: 0.001,
      locationPath: ['HARLOW', 'HARLOW-DIM'],
      retiredOn: null,
      createdAt: '2021-03-01T09:00:00Z',
      updatedAt: '2026-03-01T09:00:00Z',
      version: 1,
    });
    await registry.on('**/api/certificates?*', []);
    await registry.on('**/api/recalls/instruments/1/decisions', []);

    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('sg000101');

    await expect(page.getByText('Jump to')).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/register\/1/);
  });

  test('says so when a tag matches nothing', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/instruments/by-tag/SG-999999',
      {
        type: 't',
        title: 'NOT_FOUND',
        status: 404,
        detail: 'instrument SG-999999 does not exist',
        code: 'registry/not-found',
        timestamp: new Date().toISOString(),
      },
      404,
    );

    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('SG-999999');
    await page.keyboard.press('Enter');

    await expect(page.getByText('No instrument is tagged SG-999999')).toBeVisible();
  });

  test('says plainly when nothing matches at all', async ({ signedIn: page }) => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder('Type a command').fill('zzzqqq');

    await expect(page.getByText('Nothing matches that.')).toBeVisible();
  });
});

test.describe('terminal preferences', () => {
  test('an explicit theme is stamped onto the document', async ({ signedIn: page }) => {
    await page.goto('/terminal');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('following the machine removes the stamp again', async ({ signedIn: page }) => {
    await page.goto('/terminal');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Follow the machine' }).click();

    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  });

  test('compact density adds its class', async ({ signedIn: page }) => {
    await page.goto('/terminal');
    await page.getByRole('button', { name: /Compact/ }).click();

    await expect(page.locator('html')).toHaveClass(/sg-compact/);
  });

  test('the settings survive a reload', async ({ signedIn: page }) => {
    await page.goto('/terminal');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Put back to the defaults' })).toBeVisible();
  });
});
