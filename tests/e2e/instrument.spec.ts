import { expect, instrument, test } from './fixtures/registry';

const DETAIL = {
  ...instrument(1, 'SG-000101'),
  className: 'External micrometer',
  description: 'Bench micrometer, dimensional room',
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
  updatedAt: '2026-05-01T09:00:00Z',
  version: 3,
};

function point(normalised: number) {
  return {
    id: 1,
    sequenceNo: 1,
    label: '5 mm',
    nominal: 5,
    unit: 'mm',
    asFound: 5 + normalised * 0.004,
    asLeft: 5,
    asFoundError: normalised * 0.004,
    asLeftError: 0,
    normalisedAsFoundError: normalised,
    toleranceLow: 4.996,
    toleranceHigh: 5.004,
    expandedUncertainty: 0.0005,
    coverageFactor: 2,
    asFoundVerdict: normalised > 1 ? 'OUT_OF_TOLERANCE' : 'PASS',
    asLeftVerdict: 'PASS',
  };
}

function certificate(number: string, performedOn: string, normalised: number) {
  return {
    id: Number(number.slice(-3)),
    certificateNumber: number,
    instrumentId: 1,
    assetTag: 'SG-000101',
    performedOn,
    issuedOn: performedOn,
    performedBy: 'R Okonjo',
    approvedBy: 'H Whitcombe',
    issuingLab: 'Slipgauge Metrology',
    externalLab: false,
    ambientTemperature: 20.1,
    ambientHumidity: 44,
    asFoundVerdict: normalised > 1 ? 'OUT_OF_TOLERANCE' : 'PASS',
    asLeftVerdict: 'PASS',
    adjusted: false,
    remarks: null,
    live: true,
    withdrawnAt: null,
    withdrawnReason: null,
    supersededById: null,
    points: [point(normalised)],
  };
}

test.beforeEach(async ({ registry }) => {
  await registry.on('**/api/instruments/1', DETAIL);
  await registry.on('**/api/certificates?*', [
    certificate('SGM-003', '2026-02-04', 0.7),
    certificate('SGM-002', '2025-02-05', 0.4),
    certificate('SGM-001', '2024-02-06', 0.1),
  ]);
  await registry.on('**/api/recalls/instruments/1/decisions', [
    {
      id: 2,
      effectiveFrom: '2026-02-04',
      intervalDays: 406,
      previousIntervalDays: 365,
      delta: 41,
      basis: 'EXTENDED',
      consecutivePasses: 2,
      driftRatio: 0.7,
      rationale: '2 clean results in a row, interval moved from 365 to 406 days',
      current: true,
    },
    {
      id: 1,
      effectiveFrom: '2025-02-05',
      intervalDays: 365,
      previousIntervalDays: null,
      delta: 0,
      basis: 'BASE',
      consecutivePasses: 1,
      driftRatio: 0.4,
      rationale: '1 clean result so far, 2 needed before the interval moves',
      current: false,
    },
  ]);
  await registry.on('**/api/instruments/1/chain', {
    kind: 'CERTIFICATE',
    certificateId: 3,
    instrumentId: 1,
    assetTag: 'SG-000101',
    label: 'SGM-003',
    performedOn: '2026-02-04',
    validUntil: '2027-03-17',
    verdict: 'PASS',
    sound: true,
    note: null,
    children: [
      {
        kind: 'EXTERNAL_STANDARD',
        certificateId: null,
        instrumentId: null,
        assetTag: null,
        label: 'NPL length bar 12/4471',
        performedOn: '2024-08-01',
        validUntil: '2026-08-01',
        verdict: null,
        sound: true,
        note: null,
        children: [],
      },
    ],
  });
  await registry.on('**/api/usage/instruments/1*', {
    items: [],
    page: 0,
    size: 50,
    totalItems: 0,
    totalPages: 1,
    first: true,
    last: true,
  });
});

test.describe('the instrument page', () => {
  test('opens on the calibration history', async ({ signedIn: page }) => {
    await page.goto('/register/1');

    await expect(page.getByRole('heading', { name: 'SG-000101' })).toBeVisible();
    await expect(page.getByText('Mitutoyo 103-137')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'SGM-003' })).toBeVisible();
  });

  test('draws a point per calibration on the drift chart', async ({ signedIn: page }) => {
    await page.goto('/register/1');

    await expect(page.locator('.chart__point')).toHaveCount(3);
    await expect(page.locator('.chart__trend')).toContainText('rising');
  });

  test('shows the latest certificate points below the chart', async ({ signedIn: page }) => {
    await page.goto('/register/1');

    await expect(page.getByText('Latest certificate SGM-003')).toBeVisible();
    await expect(page.getByText('healthy uncertainty ratio')).toBeVisible();
  });

  test('the interval tab explains why the interval is what it is', async ({
    signedIn: page,
  }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Interval' }).click();

    await expect(page.locator('.panel__lead')).toContainText('406 days');
    await expect(page.locator('.timeline__why').first()).toContainText(
      'interval moved from 365 to 406 days',
    );
    await expect(page.locator('.timeline__row')).toHaveCount(2);
  });

  test('the traceability tab draws the chain', async ({ signedIn: page }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Traceability' }).click();

    await expect(page.getByText('traceable in 1 hop')).toBeVisible();
    await expect(page.locator('.chain__box')).toHaveCount(2);
  });

  test('the usage tab offers the four field form', async ({ signedIn: page }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Usage' }).click();

    await expect(page.getByLabel('Used by')).toBeVisible();
    await expect(page.getByText('Nothing has been logged against this instrument yet')).toBeVisible();
  });

  test('the details tab carries the edit form', async ({ signedIn: page }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Details' }).click();

    await expect(page.getByRole('heading', { name: 'Edit' })).toBeVisible();
    await expect(page.getByText('Nothing changed yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('the edit form warns before a change that reaches further', async ({
    signedIn: page,
  }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Details' }).click();
    await page.getByLabel('Used as a reference standard').check();

    await expect(page.getByText(/cascade to every certificate/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('putting it back disables the save again', async ({ signedIn: page }) => {
    await page.goto('/register/1');
    await page.getByRole('button', { name: 'Details' }).click();
    await page.getByLabel('Used as a reference standard').check();
    await page.getByRole('button', { name: 'Put it back' }).click();

    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('the print view lays the certificate out on paper', async ({ signedIn: page, registry }) => {
    await registry.on('**/api/certificates/3', certificate('SGM-003', '2026-02-04', 0.7));

    await page.goto('/certificates/3/print');

    await expect(page.getByRole('heading', { name: 'Certificate of calibration' })).toBeVisible();
    await expect(page.getByText('SGM-003', { exact: true })).toBeVisible();
    await expect(page.getByText(/conform to its specification/)).toBeVisible();
  });

  test('an unsigned certificate says it cannot be issued', async ({ signedIn: page, registry }) => {
    await registry.on('**/api/certificates/3', {
      ...certificate('SGM-003', '2026-02-04', 0.7),
      approvedBy: null,
    });

    await page.goto('/certificates/3/print');

    await expect(page.getByRole('alert')).toContainText('an approval signature');
  });
});

test.describe('saved views', () => {
  test('offers to keep the view once one is set up', async ({ signedIn: page }) => {
    await page.goto('/register');

    await expect(page.getByRole('button', { name: 'Keep this view' })).toBeVisible();
  });

  test('keeps a named view and shows it as a chip', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Keep this view' }).click();
    await page.getByPlaceholder('Call it something').fill('Everything');
    await page.getByRole('button', { name: 'Keep it' }).click();

    await expect(page.getByRole('button', { name: /Everything/ })).toBeVisible();
    await expect(page.getByText('Showing Everything')).toBeVisible();
  });

  test('will not keep two views under the same name', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Keep this view' }).click();
    await page.getByPlaceholder('Call it something').fill('Everything');
    await page.getByRole('button', { name: 'Keep it' }).click();

    await page.getByPlaceholder('Asset tag, maker, model or serial').fill('mitutoyo');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('button', { name: 'Keep this view' }).click();
    await page.getByPlaceholder('Call it something').fill('Everything');

    await expect(page.getByRole('button', { name: 'Keep it' })).toBeDisabled();
  });
});
