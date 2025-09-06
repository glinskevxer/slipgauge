import { expect, instrument, page1, test } from './fixtures/registry';

test.describe('the register grid', () => {
  test('lists what the service returned', async ({ signedIn: page }) => {
    await page.goto('/register');

    await expect(page.getByRole('heading', { name: 'Instrument register' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SG-000101' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SG-000102' })).toBeVisible();
    await expect(page.getByText('1 to 2 of 2')).toBeVisible();
  });

  test('says so plainly when nothing matches', async ({ signedIn: page, registry }) => {
    await registry.on('**/api/instruments?*', page1([], 0));
    await page.goto('/register');

    await expect(page.getByText('Nothing in the register matches')).toBeVisible();
  });

  test('marks a reference standard in the grid', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/instruments?*',
      page1([instrument(3, 'SG-000901', { referenceStandard: true, classCode: 'GB-SET' })]),
    );
    await page.goto('/register');

    await expect(page.getByTitle('Used as a reference standard')).toBeVisible();
  });

  test('shows the status of every row as a badge', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/instruments?*',
      page1([
        instrument(4, 'SG-000104', { status: 'QUARANTINED' }),
        instrument(5, 'SG-000105', { status: 'IN_CALIBRATION' }),
      ]),
    );
    await page.goto('/register');

    await expect(page.getByText('Quarantined')).toBeVisible();
    await expect(page.getByText('At calibration')).toBeVisible();
  });

  test('sorting a column asks the service for that order', async ({ signedIn: page }) => {
    await page.goto('/register');

    const request = page.waitForRequest((candidate) =>
      candidate.url().includes('sort=model'),
    );
    await page.getByRole('button', { name: 'Model' }).click();
    await request;
  });

  test('clicking the same column again reverses it', async ({ signedIn: page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'Model' }).click();
    const reversed = page.waitForRequest((candidate) =>
      candidate.url().includes('sort=-model'),
    );
    await page.getByRole('button', { name: 'Model' }).click();
    await reversed;
  });

  test('searching sends the text and shows the clear button', async ({ signedIn: page }) => {
    await page.goto('/register');

    await page.getByPlaceholder('Asset tag, maker, model or serial').fill('mitutoyo');
    const search = page.waitForRequest((candidate) =>
      candidate.url().includes('text=mitutoyo'),
    );
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await search;

    await expect(page.getByRole('button', { name: 'Clear 1 filter' })).toBeVisible();
  });

  test('the extra filters fold out and fold away again', async ({ signedIn: page }) => {
    await page.goto('/register');

    await expect(page.getByText('Reference standards only')).toBeHidden();
    await page.getByRole('button', { name: 'More filters' }).click();
    await expect(page.getByText('Reference standards only')).toBeVisible();
    await page.getByRole('button', { name: 'Fewer filters' }).click();
    await expect(page.getByText('Reference standards only')).toBeHidden();
  });

  test('a status chip is sent as a repeated parameter', async ({ signedIn: page }) => {
    await page.goto('/register');

    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByRole('button', { name: 'In service', exact: true }).click();
    await page.getByRole('button', { name: 'Quarantined', exact: true }).click();

    const search = page.waitForRequest(
      (candidate) =>
        candidate.url().includes('statuses=IN_SERVICE') &&
        candidate.url().includes('statuses=QUARANTINED'),
    );
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await search;
  });

  test('a service fault is shown with a way to try again', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/instruments?*',
      {
        type: 'https://errors.slipgauge.internal/registry/internal',
        title: 'INTERNAL',
        status: 500,
        detail: 'the request could not be completed',
        code: 'registry/internal',
        timestamp: new Date().toISOString(),
      },
      500,
    );
    await page.goto('/register');

    await expect(page.getByRole('alert')).toContainText('could not be completed');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('following an asset tag opens that instrument', async ({ signedIn: page, registry }) => {
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
      locationPath: ['HARLOW', 'HARLOW-LAB', 'HARLOW-DIM'],
      retiredOn: null,
      createdAt: '2021-03-01T09:00:00Z',
      updatedAt: '2025-04-14T09:00:00Z',
      version: 3,
    });
    await registry.on('**/api/certificates?*', []);
    await registry.on('**/api/recalls/instruments/1/decisions', []);

    await page.goto('/register');
    await page.getByRole('link', { name: 'SG-000101' }).click();

    await expect(page).toHaveURL(/\/register\/1/);
    await expect(page.getByRole('heading', { name: 'SG-000101' })).toBeVisible();
    await expect(page.getByText('This instrument has never been calibrated')).toBeVisible();
  });
});
