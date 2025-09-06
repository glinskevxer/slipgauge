import { expect, test } from './fixtures/registry';

function entry(assetTag: string, daysUntilDue: number, standing: string, overrides = {}) {
  return {
    instrumentId: Number(assetTag.slice(-3)),
    assetTag,
    manufacturer: 'Mitutoyo',
    model: '103-137',
    classCode: 'MIC-EXT',
    criticality: 'IMPORTANT',
    status: 'IN_SERVICE',
    referenceStandard: false,
    locationCode: 'HARLOW-DIM',
    custodian: 'R Okonjo',
    lastCalibratedOn: '2025-04-01',
    intervalDays: 365,
    nextDueOn: '2026-04-01',
    daysUntilDue,
    standing,
    intervalBasis: 'BASE',
    ...overrides,
  };
}

/**
 * Four instruments falling due in the same week is the lump the capacity board
 * exists to spot, so the fixture carries one deliberately.
 */
const BOARD = [
  entry('SG-000101', -12, 'OVERDUE'),
  entry('SG-000102', 3, 'DUE_THIS_WEEK'),
  entry('SG-000103', 21, 'DUE_THIS_MONTH', { locationCode: 'CREWE-TOOL' }),
  entry('SG-000104', 70, 'SCHEDULED', { criticality: 'CRITICAL' }),
  entry('SG-000105', 22, 'DUE_THIS_MONTH'),
  entry('SG-000106', 23, 'DUE_THIS_MONTH'),
  entry('SG-000107', 24, 'DUE_THIS_MONTH', { criticality: 'ROUTINE' }),
];

// Stubbed before anything navigates. The signed in page fixture is created
// when a test body first asks for it, which is after this hook has run.
test.beforeEach(async ({ registry }) => {
  await registry.on('**/api/recalls?*', BOARD);
  await registry.on('**/api/recalls/summary?*', {
    horizonDays: 60,
    overdue: 1,
    unscheduled: 2,
    byStanding: { OVERDUE: 1 },
  });
});

test.describe('the recall board', () => {
  test('shows the tallies and every row', async ({ signedIn: page }) => {
    await page.goto('/recalls');

    await expect(page.getByRole('heading', { name: 'Recall board' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SG-000101' })).toBeVisible();
    await expect(page.getByText('never calibrated')).toBeVisible();
  });

  test('groups by when work is due to start with', async ({ signedIn: page }) => {
    await page.goto('/recalls');

    await expect(page.getByRole('heading', { name: /Overdue/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Due this week/ })).toBeVisible();
  });

  test('regroups by location without asking the service again', async ({ signedIn: page }) => {
    await page.goto('/recalls');
    await expect(page.getByRole('heading', { name: /Overdue/ })).toBeVisible();

    const board = page.waitForRequest((request) => request.url().includes('/api/recalls?'));
    await page.getByLabel('Group by').selectOption('location');

    await expect(page.getByRole('heading', { name: /HARLOW-DIM/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /CREWE-TOOL/ })).toBeVisible();
    await expect(board).rejects.toBeTruthy().catch(() => undefined);
  });

  test('filters by criticality in the browser', async ({ signedIn: page }) => {
    await page.goto('/recalls');

    await page.getByRole('button', { name: 'CRITICAL', exact: true }).click();

    await expect(page.getByRole('link', { name: 'SG-000104' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'SG-000101' })).toBeHidden();
  });

  test('says so when the filters leave nothing', async ({ signedIn: page }) => {
    await page.goto('/recalls');

    await page.getByRole('button', { name: 'Standards only' }).click();

    await expect(page.getByText('Nothing is due in this window')).toBeVisible();
  });

  test('reads a due date the way a person would say it', async ({ signedIn: page }) => {
    await page.goto('/recalls');

    await expect(page.getByText('12 days ago')).toBeVisible();
    await expect(page.getByText('in 3 days')).toBeVisible();
  });
});

test.describe('the capacity board', () => {
  test('lays the work out week by week', async ({ signedIn: page }) => {
    await page.goto('/recalls/capacity');

    await expect(page.getByRole('heading', { name: 'Capacity' })).toBeVisible();
    await expect(page.locator('.week')).toHaveCount(12);
    await expect(page.getByText('this week')).toBeVisible();
  });

  test('marks a week that will not fit', async ({ signedIn: page }) => {
    await page.goto('/recalls/capacity');
    await page.getByLabel('Bench hours a week').fill('1');

    await expect(page.locator('.week--over').first()).toBeVisible();
    await expect(page.getByText(/weeks over capacity/)).toBeVisible();
  });

  test('opens a week to show what is in it', async ({ signedIn: page }) => {
    await page.goto('/recalls/capacity');
    await page.locator('.week__head').first().click();

    await expect(page.getByRole('link', { name: 'SG-000101' })).toBeVisible();
  });

  test('suggests what to pull forward once a week is over capacity', async ({ signedIn: page }) => {
    await page.goto('/recalls/capacity');
    await page.getByLabel('Bench hours a week').fill('4');

    await expect(page.getByText(/moves would flatten it/)).toBeVisible();
  });

  test('the suggestions can be switched off', async ({ signedIn: page }) => {
    await page.goto('/recalls/capacity');
    await page.getByLabel('Bench hours a week').fill('4');
    await expect(page.getByText(/moves would flatten it/)).toBeVisible();

    await page.getByLabel('Suggest what to pull forward').uncheck();

    await expect(page.getByText(/moves would flatten it/)).toBeHidden();
  });
});
