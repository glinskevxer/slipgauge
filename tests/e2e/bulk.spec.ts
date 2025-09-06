import { expect, instrument, page1, test } from './fixtures/registry';

const ROWS = [
  instrument(1, 'SG-000101'),
  instrument(2, 'SG-000102', { status: 'QUARANTINED' }),
  instrument(3, 'SG-000103', { status: 'RETIRED' }),
];

test.beforeEach(async ({ registry }) => {
  await registry.on('**/api/instruments?*', page1(ROWS));
});

test.describe('acting on several instruments at once', () => {
  test('the bar appears only once something is selected', async ({ signedIn: page }) => {
    await page.goto('/register');

    await expect(page.getByRole('region', { name: 'Bulk actions' })).toBeHidden();

    await page.getByLabel('Select SG-000101').check();

    await expect(page.getByRole('region', { name: 'Bulk actions' })).toBeVisible();
    await expect(page.locator('.bulk__count')).toHaveText('1 selected');
  });

  test('the header checkbox takes the whole page', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select every row on this page').check();

    await expect(page.locator('.bulk__count')).toHaveText('3 selected');
  });

  test('clearing puts the bar away again', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select SG-000101').check();
    await page.getByRole('button', { name: 'Clear' }).click();

    await expect(page.getByRole('region', { name: 'Bulk actions' })).toBeHidden();
  });

  test('offers only the statuses the selection can reach', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select SG-000102').check();
    await page.getByRole('button', { name: 'Change status' }).click();

    const options = page.getByLabel('Move to').locator('option');
    await expect(options).toHaveText([
      'Choose a status',
      'At calibration',
      'Retired',
      'Under repair',
    ]);
  });

  test('says what it will skip before it runs', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select every row on this page').check();
    await page.getByRole('button', { name: 'Change status' }).click();
    await page.getByLabel('Move to').selectOption('QUARANTINED');

    await expect(page.getByText('1 will change.')).toBeVisible();
    await expect(page.getByText('2 will be skipped.')).toBeVisible();
    await expect(page.getByText('already quarantined')).toBeVisible();
  });

  test('applies to the eligible rows and reports what happened', async ({
    signedIn: page,
    registry,
  }) => {
    await registry.on('**/api/instruments/1/status*', {
      ...instrument(1, 'SG-000101', { status: 'QUARANTINED' }),
    });

    await page.goto('/register');
    await page.getByLabel('Select every row on this page').check();
    await page.getByRole('button', { name: 'Change status' }).click();
    await page.getByLabel('Move to').selectOption('QUARANTINED');
    await page.getByRole('button', { name: 'Apply to 1' }).click();

    await expect(page.locator('.bulk__outcome')).toContainText('1 updated');
  });

  test('a refusal is reported without losing the ones that worked', async ({
    signedIn: page,
    registry,
  }) => {
    await registry.on(
      '**/api/instruments/1/status*',
      {
        type: 't',
        title: 'FORBIDDEN',
        status: 403,
        detail: 'your role does not allow that',
        code: 'registry/forbidden',
        timestamp: new Date().toISOString(),
      },
      403,
    );

    await page.goto('/register');
    await page.getByLabel('Select SG-000101').check();
    await page.getByRole('button', { name: 'Change status' }).click();
    await page.getByLabel('Move to').selectOption('QUARANTINED');
    await page.getByRole('button', { name: 'Apply to 1' }).click();

    await expect(page.locator('.bulk__outcome')).toContainText('none updated, 1 refused');
    await expect(page.locator('.bulk__failure')).toContainText(
      '1 refused: your role does not allow that',
    );
  });

  test('the export button is offered whatever is selected', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select SG-000103').check();

    await expect(page.getByRole('button', { name: 'Export' })).toBeEnabled();
  });

  test('changing the filters drops the selection', async ({ signedIn: page }) => {
    await page.goto('/register');
    await page.getByLabel('Select SG-000101').check();
    await expect(page.locator('.bulk__count')).toHaveText('1 selected');

    await page.getByPlaceholder('Asset tag, maker, model or serial').fill('mitutoyo');
    await page.getByRole('button', { name: 'Search', exact: true }).click();

    await expect(page.getByRole('region', { name: 'Bulk actions' })).toBeHidden();
  });
});
