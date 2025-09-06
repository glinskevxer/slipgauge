import { expect, test } from './fixtures/registry';



async function fillHeader(page: import('@playwright/test').Page): Promise<void> {
  await page.getByLabel('Certificate number').fill('SGM-2025-0412');
  await page.getByLabel('Instrument asset tag').fill('SG-000101');
  await page.getByLabel('Performed on').fill('2025-04-12');
  await page.getByLabel('Issued on').fill('2025-04-14');
  await page.getByLabel('Performed by').fill('R Okonjo');
}

test.beforeEach(async ({ signedIn: page }) => {
  await page.goto('/certificates/new');
});

test.describe('entering a calibration sheet', () => {
  test('opens on the header step with problems already counted', async ({ signedIn: page }) => {
    await expect(page.getByRole('heading', { name: 'Enter a calibration sheet' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('The certificate needs a number');
  });

  test('the step tabs carry a count of what is missing', async ({ signedIn: page }) => {
    // Three, not four: the issuing laboratory is filled in already.
    await expect(page.getByRole('button', { name: /The certificate/ })).toContainText('3');
    await expect(page.getByRole('button', { name: /The readings/ })).toContainText('2');
  });

  test('filling the header clears its badge', async ({ signedIn: page }) => {
    await fillHeader(page);

    await expect(page.getByRole('button', { name: /The certificate/ })).toHaveText(
      'The certificate',
    );
  });

  test('a technician can move between steps with things still missing', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Add one from the register')).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Add a point' })).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Add one from the register')).toBeVisible();
  });

  test('adding a point gives it the next number', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /The readings/ }).click();
    await page.getByRole('button', { name: 'Add a point' }).click();
    await page.getByRole('button', { name: 'Add a point' }).click();

    await expect(page.getByRole('row')).toHaveCount(4);
  });

  test('copying as found into as left fills the whole column', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /The readings/ }).click();
    const rows = page.locator('tbody tr');
    await rows.nth(0).locator('input').nth(3).fill('5.0012');

    await page.getByRole('button', { name: 'Copy as found into as left' }).click();

    await expect(rows.nth(0).locator('input').nth(4)).toHaveValue('5.0012');
  });

  test('the file button stays disabled until nothing is outstanding', async ({ signedIn: page }) => {
    await page.getByRole('button', { name: /Check and file/ }).click();
    await expect(page.getByRole('button', { name: 'File the certificate' })).toBeDisabled();
  });

  test('a complete sheet is filed and lands on the instrument', async ({ signedIn: page, registry }) => {
    await registry.on('**/api/certificates', {
      id: 44,
      certificateNumber: 'SGM-2025-0412',
      instrumentId: 1,
      assetTag: 'SG-000101',
      asFoundVerdict: 'PASS',
      asLeftVerdict: 'PASS',
      points: [],
    });
    await registry.on('**/api/instruments/1', {
      id: 1,
      assetTag: 'SG-000101',
      manufacturer: 'Mitutoyo',
      model: '103-137',
      serialNumber: 'SN-1',
      classCode: 'MIC-EXT',
      className: 'External micrometer',
      discipline: 'DIMENSIONAL',
      criticality: 'IMPORTANT',
      status: 'IN_SERVICE',
      referenceStandard: false,
      locationCode: 'HARLOW-DIM',
      locationPath: ['HARLOW', 'HARLOW-DIM'],
      custodian: 'R Okonjo',
      acquiredOn: '2021-03-01',
      description: null,
      baseIntervalDays: 365,
      minIntervalDays: 180,
      maxIntervalDays: 730,
      unit: 'mm',
      rangeLow: 0,
      rangeHigh: 25,
      resolution: 0.001,
      retiredOn: null,
      createdAt: '2021-03-01T09:00:00Z',
      updatedAt: '2025-04-14T09:00:00Z',
      version: 3,
    });
    await registry.on('**/api/certificates?*', []);
    await registry.on('**/api/recalls/instruments/1/decisions', []);

    await fillHeader(page);

    await page.getByRole('button', { name: /What it was measured against/ }).click();
    await page.locator('.standard input').first().fill('SG-000901');

    await page.getByRole('button', { name: /The readings/ }).click();
    const row = page.locator('tbody tr').first();
    await row.locator('input').nth(2).fill('5');
    await row.locator('input').nth(3).fill('5.0012');
    await row.locator('input').nth(5).fill('0.0005');

    await page.getByRole('button', { name: /Check and file/ }).click();
    await expect(page.getByText('Nothing outstanding')).toBeVisible();

    await page.getByRole('button', { name: 'File the certificate' }).click();

    await expect(page.getByText('Filed SGM-2025-0412')).toBeVisible();
    await expect(page).toHaveURL(/\/register\/1/);
  });

  test('a refused chain sends the operator back to the standards step', async ({
    page,
    registry,
  }) => {
    await registry.on(
      '**/api/certificates',
      {
        type: 'https://errors.slipgauge.internal/registry/traceability-broken',
        title: 'RULE_VIOLATION',
        status: 422,
        detail: '1 problem on the chain',
        code: 'registry/traceability-broken',
        timestamp: new Date().toISOString(),
      },
      422,
    );

    await fillHeader(page);
    await page.getByRole('button', { name: /What it was measured against/ }).click();
    await page.locator('.standard input').first().fill('SG-000901');
    await page.getByRole('button', { name: /The readings/ }).click();
    const row = page.locator('tbody tr').first();
    await row.locator('input').nth(2).fill('5');
    await row.locator('input').nth(3).fill('5.0012');
    await row.locator('input').nth(5).fill('0.0005');

    await page.getByRole('button', { name: /Check and file/ }).click();
    await page.getByRole('button', { name: 'File the certificate' }).click();

    await expect(page.getByText('The traceability chain does not hold')).toBeVisible();
    await expect(page.getByText('Add one from the register')).toBeVisible();
  });

  test('starting again empties the sheet', async ({ signedIn: page }) => {
    await fillHeader(page);
    await page.getByRole('button', { name: 'Start again' }).click();

    await expect(page.getByLabel('Certificate number')).toHaveValue('');
    await expect(page.getByRole('alert')).toContainText('The certificate needs a number');
  });
});
