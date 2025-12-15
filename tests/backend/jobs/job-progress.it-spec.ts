import { Instrument } from '@registry/instrument/instrument.entity';
import { Role } from '@registry/security/role';

import { CalibrationFixtures } from '../support/calibration-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('moving a job along the bench', () => {
  let harness: TestApp;
  let bench: ReturnType<TestApp['api']>;
  let reviewer: ReturnType<TestApp['api']>;
  let fixtures: RegisterFixtures;
  let calibrations: CalibrationFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    reviewer = harness.api(harness.tokenFor(Role.METROLOGIST));
    fixtures = new RegisterFixtures(harness.dataSource);
    calibrations = new CalibrationFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness
      .api(harness.tokenFor(Role.QUALITY_MANAGER))
      .post('/api/customers')
      .send({ code: 'ACME', name: 'Acme Pressings', contactPhone: '01279 000000' })
      .expect(201);

    const standard = await fixtures.gaugeBlockSet('SG-9001');
    standard.nextDueOn = '2026-06-30';
    await harness.dataSource.getRepository(Instrument).save(standard);
  });

  async function accepted(): Promise<string> {
    const booked = await bench
      .post('/api/jobs')
      .send({
        customerCode: 'ACME',
        receivedOn: '2025-11-20',
        receivedBy: 'h.whitcombe',
        items: [
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

    await reviewer
      .post(`/api/jobs/${booked.body.reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);

    return booked.body.reference as string;
  }

  /** A certificate against the register row a job line was raised as. */
  async function certify(assetTag: string, issuedOn: string): Promise<string> {
    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag });

    const certificate = await calibrations.certificate(instrument, {
      number: `CAL-${assetTag}-${issuedOn}`,
      performedOn: issuedOn,
      issuedOn,
    });
    return certificate.certificateNumber;
  }

  it('refuses to start a job that has not been reviewed', async () => {
    const booked = await bench
      .post('/api/jobs')
      .send({
        customerCode: 'ACME',
        receivedOn: '2025-11-20',
        receivedBy: 'h.whitcombe',
        items: [{ service: 'CALIBRATION', description: 'micrometer', classCode: 'MIC-EXT' }],
      })
      .expect(201);

    const refused = await bench
      .post(`/api/jobs/${booked.body.reference}/start`)
      .expect(422);
    expect(refused.body.detail).toContain('has not passed contract review');
  });

  it('puts an accepted job on the bench', async () => {
    const reference = await accepted();

    const started = await bench.post(`/api/jobs/${reference}/start`).expect(201);
    expect(started.body.state).toBe('IN_PROGRESS');
  });

  it('will not complete a job while a line has no certificate', async () => {
    const reference = await accepted();
    await bench.post(`/api/jobs/${reference}/start`).expect(201);

    const refused = await bench.post(`/api/jobs/${reference}/complete`).expect(422);
    expect(refused.body.detail).toContain('line 1 has no certificate filed since the job arrived');
  });

  it('names each unfinished line on the progress route', async () => {
    const reference = await accepted();

    const progress = await bench.get(`/api/jobs/${reference}/progress`).expect(200);
    expect(progress.body).toHaveLength(1);
    expect(progress.body[0]).toMatchObject({ lineNumber: 1, done: false });
    expect(progress.body[0].assetTag).toMatch(/^SG-/);
  });

  it('completes once every line is certified', async () => {
    const reference = await accepted();
    await bench.post(`/api/jobs/${reference}/start`).expect(201);

    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    await certify(job.body.items[0].assetTag, '2025-11-24');

    const progress = await bench.get(`/api/jobs/${reference}/progress`).expect(200);
    expect(progress.body[0]).toMatchObject({ done: true });

    const completed = await bench.post(`/api/jobs/${reference}/complete`).expect(201);
    expect(completed.body.state).toBe('COMPLETED');
    expect(completed.body.completedOn).toBe('2025-11-20');
  });

  it('does not count a certificate issued before the job arrived', async () => {
    const reference = await accepted();
    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    await certify(job.body.items[0].assetTag, '2025-06-01');

    await bench.post(`/api/jobs/${reference}/start`).expect(201);
    await bench.post(`/api/jobs/${reference}/complete`).expect(422);
  });

  it('does not count a certificate that has since been withdrawn', async () => {
    const reference = await accepted();
    await bench.post(`/api/jobs/${reference}/start`).expect(201);

    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    const number = await certify(job.body.items[0].assetTag, '2025-11-24');

    await harness.dataSource.query(
      `update calibration_certificate
          set withdrawn_at = now(), withdrawn_reason = 'wrong standard quoted'
        where certificate_number = $1`,
      [number],
    );

    const refused = await bench.post(`/api/jobs/${reference}/complete`).expect(422);
    expect(refused.body.detail).toContain('no certificate filed');
  });

  it('puts the customer item back in service when the job is dispatched', async () => {
    const reference = await accepted();
    await bench.post(`/api/jobs/${reference}/start`).expect(201);

    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    const assetTag = job.body.items[0].assetTag;
    await certify(assetTag, '2025-11-24');
    await bench.post(`/api/jobs/${reference}/complete`).expect(201);

    const before = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag });
    expect(before.status).toBe('IN_CALIBRATION');

    const dispatched = await bench.post(`/api/jobs/${reference}/dispatch`).expect(201);
    expect(dispatched.body.state).toBe('DISPATCHED');
    expect(dispatched.body.dispatchedOn).toBe('2025-11-20');

    const after = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag });
    expect(after.status).toBe('IN_SERVICE');
  });

  it('refuses to dispatch a job that was never completed', async () => {
    const reference = await accepted();

    await bench.post(`/api/jobs/${reference}/dispatch`).expect(409);
  });

  it('counts a completed job as ready to dispatch on the desk', async () => {
    const reference = await accepted();
    await bench.post(`/api/jobs/${reference}/start`).expect(201);

    const job = await bench.get(`/api/jobs/${reference}`).expect(200);
    await certify(job.body.items[0].assetTag, '2025-11-24');
    await bench.post(`/api/jobs/${reference}/complete`).expect(201);

    const desk = await bench.get('/api/jobs/desk').expect(200);
    expect(desk.body).toMatchObject({ open: 0, readyToDispatch: 1 });
  });

  it('leaves a repair line out of the completion check entirely', async () => {
    const booked = await bench
      .post('/api/jobs')
      .send({
        customerCode: 'ACME',
        receivedOn: '2025-11-20',
        receivedBy: 'h.whitcombe',
        items: [
          { service: 'REPAIR', description: 'vernier with a bent jaw', classCode: 'MIC-EXT' },
        ],
      })
      .expect(201);

    await reviewer
      .post(`/api/jobs/${booked.body.reference}/review`)
      .send({ acceptancePolicy: 'MANAGED_RISK' })
      .expect(201);
    await bench.post(`/api/jobs/${booked.body.reference}/start`).expect(201);

    const progress = await bench.get(`/api/jobs/${booked.body.reference}/progress`).expect(200);
    expect(progress.body).toHaveLength(0);

    const completed = await bench.post(`/api/jobs/${booked.body.reference}/complete`).expect(201);
    expect(completed.body.state).toBe('COMPLETED');
  });
});
