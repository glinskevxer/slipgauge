import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import { Role } from '@registry/security/role';

import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('contract review on a customer job', () => {
  let harness: TestApp;
  let bench: ReturnType<TestApp['api']>;
  let reviewer: ReturnType<TestApp['api']>;
  let fixtures: RegisterFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    reviewer = harness.api(harness.tokenFor(Role.METROLOGIST));
    fixtures = new RegisterFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness
      .api(harness.tokenFor(Role.QUALITY_MANAGER))
      .post('/api/customers')
      .send({
        code: 'ACME',
        name: 'Acme Pressings',
        contactEmail: 'quality@acme.example',
        turnaroundDays: 10,
      })
      .expect(201);

    // A reference gauge block set in service and in calibration, which is what
    // makes the laboratory capable of dimensional work at all.
    const standard = await fixtures.gaugeBlockSet('SG-9001');
    standard.nextDueOn = '2026-06-30';
    await harness.dataSource.getRepository(Instrument).save(standard);
  });

  async function bookIn(items: Record<string, unknown>[] = []) {
    const response = await bench
      .post('/api/jobs')
      .send({
        customerCode: 'ACME',
        receivedOn: '2025-11-20',
        receivedBy: 'h.whitcombe',
        items: items.length
          ? items
          : [
              {
                service: 'CALIBRATION',
                description: 'external micrometer 0-25',
                manufacturer: 'Mitutoyo',
                model: '103-137',
                serialNumber: '81104321',
                classCode: 'MIC-EXT',
                rangeHigh: 25,
              },
            ],
      })
      .expect(201);
    return response.body.reference as string;
  }

  it('leaves the decision rule unjudged until one is proposed', async () => {
    const reference = await bookIn();

    const pending = await reviewer.get(`/api/jobs/${reference}/review/preview`).expect(200);
    expect(pending.body.acceptable).toBe(true);

    const asked = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=`)
      .expect(200);
    expect(asked.body.decisionRulePending).toBe(true);
  });

  it('previews a clean job without recording anything', async () => {
    const reference = await bookIn();

    const preview = await reviewer.get(`/api/jobs/${reference}/review/preview`).expect(200);
    expect(preview.body).toMatchObject({
      outcome: 'ACCEPTED',
      acceptable: true,
      decisionRulePending: true,
    });
    expect(preview.body.findings).toHaveLength(0);

    const withRule = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=SHARED_RISK`)
      .expect(200);
    expect(withRule.body.decisionRulePending).toBe(false);

    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    expect(job.body.state).toBe('RECEIVED');
    expect(job.body.review).toBeNull();
  });

  it('accepts the job and raises a register row for the line', async () => {
    const reference = await bookIn();

    const reviewed = await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK', methodReference: 'SLP-WI-014' })
      .expect(201);

    expect(reviewed.body.state).toBe('ACCEPTED');
    expect(reviewed.body.review).toMatchObject({
      outcome: 'ACCEPTED',
      requirementsDefined: true,
      capabilityConfirmed: true,
      methodSelected: true,
      decisionRuleAgreed: true,
      acceptancePolicy: 'MANAGED_RISK',
      methodReference: 'SLP-WI-014',
    });

    const raised = reviewed.body.items[0].assetTag;
    expect(raised).toMatch(/^SG-\d+$/);

    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: raised });
    expect(instrument.status).toBe('IN_CALIBRATION');
    expect(instrument.custodian).toBe('ACME');
  });

  it('will not raise two register rows for the same serial coming back', async () => {
    const first = await bookIn();
    await reviewer
      .post(`/api/jobs/${first}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    const before = await harness.dataSource.getRepository(Instrument).count();

    const second = await bookIn();
    const reviewed = await reviewer
      .post(`/api/jobs/${second}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    expect(await harness.dataSource.getRepository(Instrument).count()).toBe(before);
    expect(reviewed.body.items[0].assetTag).toBeTruthy();
  });

  it('leaves a line the desk could not identify out of the register', async () => {
    const reference = await bookIn([
      { service: 'CALIBRATION', description: 'something in a wooden box', classCode: 'MIC-EXT' },
    ]);

    const reviewed = await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    expect(reviewed.body.state).toBe('ACCEPTED');
    expect(reviewed.body.items[0].assetTag).toBeNull();
  });

  it('declines a job the laboratory cannot do and says why', async () => {
    await harness.dataSource
      .getRepository(Instrument)
      .update({ assetTag: 'SG-9001' }, { nextDueOn: '2025-01-01' });

    const reference = await bookIn();
    const reviewed = await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    expect(reviewed.body.state).toBe('DECLINED');
    expect(reviewed.body.review.declinedReason).toContain('no reference standard is available');
    expect(reviewed.body.review.capabilityConfirmed).toBe(false);
    expect(reviewed.body.review.acceptancePolicy).toBeNull();
    expect(reviewed.body.items[0].assetTag).toBeNull();
  });

  it('records a deviation when the item reads past what the laboratory covers', async () => {
    const reference = await bookIn([
      {
        service: 'CALIBRATION',
        description: 'external micrometer 900-925',
        manufacturer: 'Mitutoyo',
        model: '104-155',
        serialNumber: '81104999',
        classCode: 'MIC-EXT',
        rangeHigh: 925,
      },
    ]);

    const reviewed = await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    expect(reviewed.body.review.outcome).toBe('ACCEPTED_WITH_DEVIATION');
    expect(reviewed.body.review.findings.join(' ')).toContain('the laboratory covers 100');
    expect(reviewed.body.state).toBe('ACCEPTED');
  });

  it('keeps the reviewer comment beside what the checker found', async () => {
    const reference = await bookIn();

    const reviewed = await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({
        acceptancePolicy: 'MANAGED_RISK',
        comment: 'customer rang and confirmed the drawing tolerance',
      })
      .expect(201);

    expect(reviewed.body.review.findings).toEqual([
      'reviewer: customer rang and confirmed the drawing tolerance',
    ]);
  });

  it('refuses to review the same job twice', async () => {
    const reference = await bookIn();

    await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(409);
  });

  it('will not review without a decision rule at all', async () => {
    const reference = await bookIn();

    await reviewer.post(`/api/jobs/${reference}/review`).send({}).expect(400);
  });

  it('lets a reviewer decline on their own judgement', async () => {
    const reference = await bookIn();

    const declined = await reviewer
      .post(`/api/jobs/${reference}/decline`)
      .send({ reason: 'customer will not confirm the drawing revision' })
      .expect(201);

    expect(declined.body.state).toBe('DECLINED');
    expect(declined.body.review.declinedReason).toBe(
      'customer will not confirm the drawing revision',
    );
  });

  it('will not let the bench sign a contract review off', async () => {
    const reference = await bookIn();

    await bench
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(403);
  });

  it('reads the recorded review back on its own route', async () => {
    const reference = await bookIn();
    await reviewer
      .post(`/api/jobs/${reference}/review`)
      .send({ acceptancePolicy: 'STRINGENT' })
      .expect(201);

    const read = await bench.get(`/api/jobs/${reference}/review`).expect(200);
    expect(read.body.acceptancePolicy).toBe('STRINGENT');
  });

  it('says so plainly when there is no review yet', async () => {
    const reference = await bookIn();

    await bench.get(`/api/jobs/${reference}/review`).expect(404);
  });

  /**
   * The profile is reference data loaded by the migrations, and every other
   * suite depends on it being there. Detaching it from the class and putting it
   * back is the only way to test the refusal without leaving the next suite
   * with a laboratory that cannot judge a micrometer.
   */
  it('blocks the whole job when a class has no tolerance profile', async () => {
    const classes = harness.dataSource.getRepository(InstrumentClass);
    const type = await classes.findOneByOrFail({ code: 'MIC-EXT' });

    await harness.dataSource.query(
      'update tolerance_profile set class_id = null where class_id = $1',
      [type.id],
    );

    try {
      const reference = await bookIn();
      const reviewed = await reviewer
        .post(`/api/jobs/${reference}/review`)
        .send({ acceptancePolicy: 'MANAGED_RISK' })
        .expect(201);

      expect(reviewed.body.state).toBe('DECLINED');
      expect(reviewed.body.review.declinedReason).toContain('no tolerance profile');
    } finally {
      await harness.dataSource.query(
        `update tolerance_profile set class_id = $1 where code = 'DIM-MIC-25'`,
        [type.id],
      );
    }
  });
});
