import { expect, test } from './fixtures/registry';

function job(reference: string, overrides = {}) {
  return {
    id: Number(reference.slice(-4)),
    reference,
    customerCode: 'ACME',
    customerName: 'Acme Pressings',
    state: 'ACCEPTED',
    priority: 'STANDARD',
    receivedOn: '2025-11-20',
    promisedOn: '2025-12-04',
    itemCount: 2,
    lateness: -6,
    open: true,
    ...overrides,
  };
}

const DESK = [
  job('J-2025-0141', { state: 'RECEIVED', lateness: 3, itemCount: 1 }),
  job('J-2025-0142', { state: 'IN_PROGRESS', priority: 'SAME_DAY' }),
  job('J-2025-0143', { state: 'COMPLETED', open: false, lateness: -2 }),
];

const SHEET = {
  id: 142,
  reference: 'J-2025-0142',
  customerCode: 'ACME',
  customerName: 'Acme Pressings',
  state: 'RECEIVED',
  priority: 'STANDARD',
  receivedOn: '2025-11-20',
  promisedOn: '2025-12-04',
  completedOn: null,
  dispatchedOn: null,
  receivedBy: 'h.whitcombe',
  customerOrder: 'PO-99123',
  instructions: null,
  items: [
    {
      id: 1,
      lineNumber: 1,
      service: 'CALIBRATION',
      description: 'external micrometer 0-25',
      manufacturer: 'Mitutoyo',
      model: '103-137',
      serialNumber: '81104321',
      classCode: 'MIC-EXT',
      className: 'External micrometer',
      condition: 'SERVICEABLE',
      accessories: null,
      note: null,
      rangeHigh: 25,
      toleranceStated: true,
      assetTag: null,
      calibratable: true,
    },
  ],
  review: null,
  lateness: -10,
  open: true,
};

test.beforeEach(async ({ registry }) => {
  await registry.on('**/api/jobs?*', {
    items: DESK,
    page: 0,
    size: 200,
    totalItems: DESK.length,
    totalPages: 1,
    first: true,
    last: true,
  });
  await registry.on('**/api/jobs/desk', {
    open: 2,
    awaitingReview: 1,
    onTheBench: 1,
    late: 1,
    dueToday: 0,
    readyToDispatch: 1,
  });
});

test.describe('the job desk', () => {
  test('opens on everything that is still here', async ({ signedIn: page }) => {
    await page.goto('/jobs');

    await expect(page.getByRole('heading', { name: 'Job desk' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'J-2025-0141' })).toBeVisible();
    await expect(page.getByText('3 working days late')).toBeVisible();
  });

  test('puts the counts on the lane tabs', async ({ signedIn: page }) => {
    await page.goto('/jobs');

    await expect(page.getByRole('button', { name: /Everything open/ })).toContainText('2');
    await expect(page.getByRole('button', { name: /To send back/ })).toContainText('1');
  });

  test('sorts the late job to the top', async ({ signedIn: page }) => {
    await page.goto('/jobs');

    const first = page.locator('.jobs tbody tr').first();
    await expect(first).toContainText('J-2025-0141');
  });

  test('shows only the late work in the late lane', async ({ signedIn: page }) => {
    await page.goto('/jobs');
    await page.getByRole('button', { name: /^Late/ }).click();

    await expect(page.locator('.jobs tbody tr')).toHaveCount(1);
    await expect(page.locator('.jobs tbody tr')).toContainText('J-2025-0141');
  });

  test('flags a same day job', async ({ signedIn: page }) => {
    await page.goto('/jobs');

    await expect(page.getByText('Same day')).toBeVisible();
  });

  test('offers the one move each state allows', async ({ signedIn: page }) => {
    await page.goto('/jobs');

    await expect(page.getByRole('button', { name: 'Mark finished' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send it back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Put on the bench' })).toHaveCount(0);
  });

  test('says so when a completion is refused', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/jobs/J-2025-0142/complete',
      {
        type: 'https://errors.slipgauge.internal/registry/rule-violation',
        title: 'RULE_VIOLATION',
        status: 422,
        detail: 'line 1 has no certificate filed since the job arrived',
        code: 'registry/rule-violation',
      },
      422,
    );

    await page.goto('/jobs');
    await page.getByRole('button', { name: 'Mark finished' }).click();

    await expect(page.getByText('no certificate filed')).toBeVisible();
  });
});

test.describe('the job sheet', () => {
  test.beforeEach(async ({ registry }) => {
    await registry.on('**/api/jobs/J-2025-0142', SHEET);
    await registry.on('**/api/jobs/J-2025-0142/progress', []);
    await registry.on('**/api/jobs/J-2025-0142/review/preview*', {
      reference: 'J-2025-0142',
      outcome: 'ACCEPTED_WITH_DEVIATION',
      findings: [
        {
          clause: 'CAPABILITY',
          severity: 'DEVIATION',
          lineNumber: 1,
          detail: 'MIC-EXT is not on the accredited scope',
        },
      ],
      acceptable: true,
      decisionRulePending: true,
    });
  });

  test('reads the job out with what came in', async ({ signedIn: page }) => {
    await page.goto('/jobs/J-2025-0142');

    await expect(page.getByRole('heading', { name: 'J-2025-0142' })).toBeVisible();
    await expect(page.getByText('external micrometer 0-25')).toBeVisible();
    await expect(page.getByText('not raised')).toBeVisible();
  });

  test('shows what contract review would say before anybody records it', async ({
    signedIn: page,
  }) => {
    await page.goto('/jobs/J-2025-0142');

    await expect(page.getByText('not on the accredited scope')).toBeVisible();
    await expect(page.getByText('The decision rule has not been judged yet.')).toBeVisible();
  });

  test('records the review under the rule the reviewer picks', async ({
    signedIn: page,
    registry,
  }) => {
    await registry.on('**/api/jobs/J-2025-0142/review', {
      ...SHEET,
      state: 'ACCEPTED',
      review: {
        outcome: 'ACCEPTED_WITH_DEVIATION',
        reviewedBy: 'h.whitcombe',
        reviewedOn: '2025-11-21',
        requirementsDefined: true,
        capabilityConfirmed: false,
        methodSelected: true,
        decisionRuleAgreed: true,
        acceptancePolicy: 'MANAGED_RISK',
        methodReference: null,
        findings: ['line 1: MIC-EXT is not on the accredited scope'],
        declinedReason: null,
      },
    });

    await page.goto('/jobs/J-2025-0142');
    await page.getByLabel('Managed risk').check();
    await page.getByRole('button', { name: 'Record the review' }).click();

    await expect(page.getByText('Accepted with a deviation')).toBeVisible();
    await expect(page.getByText('Capability confirmed')).toBeVisible();
  });

  test('will not let the reviewer decline without a reason', async ({ signedIn: page }) => {
    await page.goto('/jobs/J-2025-0142');
    await page.getByText('Turn this job away instead').click();

    await expect(page.getByRole('button', { name: 'Decline' })).toBeDisabled();
  });

  test('navigates from the desk to the sheet', async ({ signedIn: page }) => {
    await page.goto('/jobs');
    await page.getByRole('link', { name: 'J-2025-0142' }).click();

    await expect(page).toHaveURL(/\/jobs\/J-2025-0142$/);
    await expect(page.getByRole('heading', { name: 'J-2025-0142' })).toBeVisible();
  });
});
