import { expect, test } from './fixtures/registry';

function excursion(id: number, overrides = {}) {
  return {
    id,
    locationCode: 'HARLOW-DIM',
    locationName: 'Dimensional room',
    kind: 'TEMPERATURE_HIGH',
    severity: 'SIGNIFICANT',
    startedAt: '2025-11-20T09:00:00.000Z',
    endedAt: '2025-11-20T12:00:00.000Z',
    worstValue: 22.6,
    limitValue: 21,
    overshoot: 1.6,
    readings: 3,
    open: false,
    assessed: false,
    assessedBy: null,
    finding: null,
    putsWorkInQuestion: true,
    ...overrides,
  };
}

const LIMIT = {
  id: 1,
  locationCode: 'HARLOW-DIM',
  locationName: 'Dimensional room',
  discipline: null,
  temperatureMin: 19,
  temperatureMax: 21,
  humidityMin: 40,
  humidityMax: 60,
  driftPerHour: null,
  soakHours: 12,
  methodReference: 'SLP-WI-002',
  summary: '19 to 21 C, 40 to 60 %RH',
};

const AFFECTED = {
  excursionId: 1,
  locationCode: 'HARLOW-DIM',
  severity: 'SIGNIFICANT',
  from: '2025-11-20',
  to: '2025-11-20',
  certificates: [
    {
      certificateId: 11,
      certificateNumber: 'CAL-2025-0100',
      assetTag: 'SG-000101',
      performedOn: '2025-11-20',
      performedBy: 'r.okonjo',
      withdrawn: false,
      wholeDay: false,
    },
  ],
};

function nonconformance(reference: string, overrides = {}) {
  return {
    id: Number(reference.slice(-3)),
    reference,
    raisedOn: '2025-11-20',
    raisedBy: 'registry',
    source: 'EXCURSION',
    sourceRef: '1',
    title: 'HARLOW-DIM outside its band',
    detail: 'The chiller tripped overnight.',
    severity: 'HIGH',
    state: 'RAISED',
    owner: null,
    dueOn: '2025-12-04',
    containment: null,
    containedOn: null,
    rootCause: null,
    causeFoundOn: null,
    correctiveAction: null,
    actionTakenOn: null,
    effectiveness: null,
    effectivenessOn: null,
    closedOn: null,
    closedBy: null,
    open: true,
    lateness: -14,
    escalate: false,
    answersGiven: 0,
    closesFrom: 'EFFECTIVENESS_CHECKED',
    ...overrides,
  };
}

test.describe('the room log', () => {
  test.beforeEach(async ({ registry }) => {
    await registry.on('**/api/environment/excursions*', [
      excursion(1),
      excursion(2, { severity: 'MINOR', putsWorkInQuestion: false, assessed: true }),
    ]);
    await registry.on('**/api/environment/limits*', [LIMIT]);
    await registry.on('**/api/environment/excursions/1/affected', AFFECTED);
    await registry.on('**/api/environment/rooms/HARLOW-DIM/trace*', {
      locationCode: 'HARLOW-DIM',
      limit: LIMIT,
      samples: [],
    });
  });

  test('lists the excursions worst first', async ({ signedIn: page }) => {
    await page.goto('/rooms');

    await expect(page.getByRole('heading', { name: 'Room log' })).toBeVisible();
    const first = page.locator('.excursion').first();
    await expect(first).toContainText('Significant');
    await expect(first).toContainText('Too warm in HARLOW-DIM');
  });

  test('shows the band each room is held to', async ({ signedIn: page }) => {
    await page.goto('/rooms');

    await expect(page.getByText('held to 19 to 21 C, 40 to 60 %RH')).toBeVisible();
  });

  test('opens one and lists what it put in question', async ({ signedIn: page }) => {
    await page.goto('/rooms');
    await page.locator('.excursion__head').first().click();

    await expect(page.getByText('What went out while the room was like this')).toBeVisible();
    await expect(page.getByRole('link', { name: 'CAL-2025-0100' })).toBeVisible();
  });

  test('will not withdraw without a reason', async ({ signedIn: page }) => {
    await page.goto('/rooms');
    await page.locator('.excursion__head').first().click();

    await expect(page.getByRole('button', { name: /Withdraw 1 certificate/ })).toBeDisabled();
  });

  test('withdraws what the excursion touched once a reason is given', async ({
    signedIn: page,
    registry,
  }) => {
    await registry.on('**/api/environment/excursions/1/withdrawals', {
      withdrawn: 1,
      alreadyWithdrawn: 0,
    });

    await page.goto('/rooms');
    await page.locator('.excursion__head').first().click();
    await page.getByLabel('Why they are being withdrawn').fill('chiller tripped overnight');
    await page.getByRole('button', { name: /Withdraw 1 certificate/ }).click();

    await expect(page.getByText('1 certificate(s) withdrawn')).toBeVisible();
  });
});

test.describe('the nonconformance board', () => {
  test.beforeEach(async ({ registry }) => {
    await registry.on('**/api/nonconformities?*', [
      nonconformance('NC-2025-001'),
      nonconformance('NC-2025-002', { severity: 'LOW', closesFrom: 'ACTION_TAKEN' }),
    ]);
    await registry.on('**/api/nonconformities', [
      nonconformance('NC-2025-001'),
      nonconformance('NC-2025-002', { severity: 'LOW', closesFrom: 'ACTION_TAKEN' }),
    ]);
    await registry.on('**/api/nonconformities/summary', {
      open: 2,
      late: 0,
      escalating: 0,
      high: 1,
      closedThisYear: 4,
      byStage: { RAISED: 2 },
    });
  });

  test('lists what is open with its source and stage', async ({ signedIn: page }) => {
    await page.goto('/nonconformities');

    await expect(page.getByRole('heading', { name: 'Nonconformances' })).toBeVisible();
    await expect(page.getByText('NC-2025-001')).toBeVisible();
    await expect(page.getByText('Room excursion').first()).toBeVisible();
  });

  test('offers only the next stage on the record that is open', async ({ signedIn: page }) => {
    await page.goto('/nonconformities');
    await page.locator('.record__head').first().click();

    await expect(page.getByLabel('Contained')).toBeVisible();
    await expect(page.getByLabel('Cause found')).toHaveCount(0);
  });

  test('says why a high severity record cannot be closed yet', async ({ signedIn: page }) => {
    await page.goto('/nonconformities');
    await page.locator('.record__head').first().click();

    await expect(page.getByText(/cannot close until effectiveness checked/)).toBeVisible();
  });

  test('records the containment and reads the record back', async ({ signedIn: page, registry }) => {
    await registry.on(
      '**/api/nonconformities/NC-2025-001/containment',
      nonconformance('NC-2025-001', {
        state: 'CONTAINED',
        containment: 'work in the room stopped',
        containedOn: '2025-11-21',
        answersGiven: 1,
      }),
    );

    await page.goto('/nonconformities');
    await page.locator('.record__head').first().click();

    // The board reloads after a stage is recorded, so the list has to answer
    // with the record as it now is. Re-stubbed after the first load rather than
    // before it, or the panel would open on a record that is already contained.
    const contained = nonconformance('NC-2025-001', {
      state: 'CONTAINED',
      containment: 'work in the room stopped',
      containedOn: '2025-11-21',
      answersGiven: 1,
    });
    await registry.on('**/api/nonconformities?*', [contained]);
    await registry.on('**/api/nonconformities', [contained]);

    await page.getByLabel('Contained').fill('work in the room stopped');
    await page.getByRole('button', { name: 'Record it' }).click();

    // The board posts the stage and then reloads the whole list, so this waits
    // on two round trips rather than one. Under four workers the default five
    // seconds was not always enough and the test failed on the clock.
    await expect(page.getByText('work in the room stopped').first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
