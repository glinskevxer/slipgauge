import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import {
  OUTSIDE_STANDARD,
  ReferenceDataSnapshot,
  scopeSnapshot,
} from '../support/sheet-fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

/**
 * The schedule replaced a boolean on the class. These are the questions the
 * boolean could not answer and this can.
 */
describe('the schedule of accreditation', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;
  let reviewer: ReturnType<TestApp['api']>;
  let register: RegisterFixtures;

  /**
   * The migration writes the schedule out for the disciplines the laboratory was
   * assessed for, and that is reference data rather than something a suite may
   * wipe. This one has to start from an empty schedule to say anything useful,
   * so it takes a copy first and puts it back at the end.
   */
  let seeded: ReferenceDataSnapshot;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    reviewer = harness.api(harness.tokenFor(Role.METROLOGIST));
    register = new RegisterFixtures(harness.dataSource);
    seeded = scopeSnapshot(harness.dataSource);
    await seeded.take();
  });

  afterAll(async () => {
    await seeded.restore();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await seeded.clear();
    await new CompetenceFixtures(harness.dataSource).grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
    );

    const standard = await register.gaugeBlockSet('SG-9001');
    standard.nextDueOn = '2026-06-30';
    await harness.dataSource.getRepository(Instrument).save(standard);

    await quality
      .post('/api/customers')
      .send({ code: 'ACME', name: 'Acme Pressings', accreditedRequired: true, contactPhone: '01' })
      .expect(201);
  });

  function line(body: Record<string, unknown> = {}) {
    return quality.post('/api/scope').send({
      scheduleRef: 'UKAS-0001/12',
      discipline: 'DIMENSIONAL',
      classCode: 'MIC-EXT',
      measurand: 'External micrometer',
      unit: 'mm',
      rangeLow: 0,
      rangeHigh: 100,
      cmcAbsolute: 0.0005,
      cmcPpm: 20,
      validFrom: '2025-01-06',
      ...body,
    });
  }

  async function bookIn(rangeHigh: number) {
    const booked = await bench
      .post('/api/jobs')
      .send({
        customerCode: 'ACME',
        receivedOn: '2025-11-20',
        receivedBy: 'h.whitcombe',
        items: [
          {
            service: 'CALIBRATION',
            description: 'external micrometer',
            manufacturer: 'Mitutoyo',
            model: '103-137',
            serialNumber: `SN-${rangeHigh}`,
            classCode: 'MIC-EXT',
            rangeHigh,
          },
        ],
      })
      .expect(201);
    return booked.body.reference as string;
  }

  it('writes a line out and reads it back with its capability', async () => {
    const added = await line().expect(201);

    expect(added.body).toMatchObject({
      scheduleRef: 'UKAS-0001/12',
      classCode: 'MIC-EXT',
      rangeLow: 0,
      rangeHigh: 100,
      live: true,
    });
    expect(added.body.summary).toBe(
      'External micrometer, 0 to 100 mm, 0.0005 mm plus 20 ppm',
    );
  });

  it('refuses a range that reads downwards', async () => {
    await line({ rangeLow: 100, rangeHigh: 0 }).expect(422);
  });

  it('refuses a line that claims no capability at all', async () => {
    await line({ cmcAbsolute: undefined, cmcPpm: undefined }).expect(422);
  });

  it('refuses a line that lapses before it starts', async () => {
    await line({ validFrom: '2026-01-01', validTo: '2025-01-01' }).expect(422);
  });

  it('leaves the class unaccredited until a line names it', async () => {
    const reference = await bookIn(25);
    const preview = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=MANAGED_RISK`)
      .expect(200);

    expect(preview.body.findings.map((f: { detail: string }) => f.detail).join(' ')).toContain(
      'not on the accredited scope',
    );
  });

  it('accredits it once the line is written', async () => {
    await line().expect(201);

    const reference = await bookIn(25);
    const preview = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=MANAGED_RISK`)
      .expect(200);

    expect(preview.body.findings).toHaveLength(0);
  });

  it('stops at the top of the range the schedule granted', async () => {
    await line().expect(201);

    const reference = await bookIn(400);
    const preview = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=MANAGED_RISK`)
      .expect(200);

    expect(preview.body.findings.map((f: { detail: string }) => f.detail).join(' ')).toContain(
      'the laboratory covers 100',
    );
  });

  it('stops covering it once the line has lapsed', async () => {
    const added = await line().expect(201);
    await quality.post(`/api/scope/${added.body.id}/lapse?on=2025-06-30`).expect(201);

    const reference = await bookIn(25);
    const preview = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=MANAGED_RISK`)
      .expect(200);

    expect(preview.body.findings.map((f: { detail: string }) => f.detail).join(' ')).toContain(
      'not on the accredited scope',
    );
  });

  it('does not cover a line that has not started yet', async () => {
    await line({ validFrom: '2026-06-01' }).expect(201);

    const reference = await bookIn(25);
    const preview = await reviewer
      .get(`/api/jobs/${reference}/review/preview?policy=MANAGED_RISK`)
      .expect(200);

    expect(preview.body.findings.map((f: { detail: string }) => f.detail).join(' ')).toContain(
      'not on the accredited scope',
    );
  });

  it('hides a lapsed line from the schedule unless asked', async () => {
    const added = await line().expect(201);
    await quality.post(`/api/scope/${added.body.id}/lapse?on=2025-06-30`).expect(201);

    const live = await bench.get('/api/scope').expect(200);
    expect(live.body).toHaveLength(0);

    const all = await bench.get('/api/scope?includeLapsed=true').expect(200);
    expect(all.body).toHaveLength(1);
    expect(all.body[0].live).toBe(false);
  });

  it('filters the schedule by discipline', async () => {
    await line().expect(201);
    await line({
      scheduleRef: 'UKAS-0001/31',
      discipline: 'TORQUE',
      classCode: undefined,
      measurand: 'Torque wrench',
      unit: 'Nm',
      rangeHigh: 400,
    }).expect(201);

    const torque = await bench.get('/api/scope?discipline=TORQUE').expect(200);
    expect(torque.body).toHaveLength(1);
    expect(torque.body[0].classCode).toBeNull();
  });

  it('will not let the bench widen the schedule', async () => {
    await bench
      .post('/api/scope')
      .send({
        scheduleRef: 'MADE-UP',
        discipline: 'DIMENSIONAL',
        measurand: 'anything',
        unit: 'mm',
        rangeLow: 0,
        rangeHigh: 10000,
        cmcAbsolute: 0.1,
        validFrom: '2025-01-01',
      })
      .expect(403);
  });

  it('says so plainly when the line is not there', async () => {
    await quality.post('/api/scope/9999/lapse').expect(404);
  });
});

/**
 * What the certificate says about itself. Fixed when the sheet is filed, and
 * read back off the certificate rather than worked out again.
 */
describe('what a certificate states', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let register: RegisterFixtures;
  let seeded: ReferenceDataSnapshot;

    beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    register = new RegisterFixtures(harness.dataSource);
    seeded = scopeSnapshot(harness.dataSource);
    await seeded.take();
  });

  afterAll(async () => {
    await seeded.restore();
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await seeded.clear();
    await new CompetenceFixtures(harness.dataSource).grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
    );
    await register.micrometer('SG-0001');
  });

  async function scopeTo(rangeHigh: number) {
    const type = await harness.dataSource.query(
      `select id from instrument_class where code = 'MIC-EXT'`,
    );
    await harness.dataSource.query(
      `insert into accreditation_scope
         (schedule_ref, discipline, class_id, measurand, unit, range_low, range_high,
          cmc_absolute, valid_from)
       values ('UKAS-0001/12', 'DIMENSIONAL', $1, 'External micrometer', 'mm', 0, $2,
               0.0005, '2025-01-06')`,
      [type[0].id, rangeHigh],
    );
  }

  function sheet(nominals: number[], overrides: Record<string, unknown> = {}) {
    return {
      certificateNumber: 'CAL-8001',
      assetTag: 'SG-0001',
      performedOn: '2025-11-18',
      issuedOn: '2025-11-19',
      performedBy: 'r.okonjo',
      issuingLab: 'Slipgauge Metrology',
      points: nominals.map((nominal, index) => ({
        sequenceNo: index + 1,
        nominal,
        asFound: nominal + 0.0004,
        expandedUncertainty: 0.0005,
      })),
      standards: [OUTSIDE_STANDARD],
      ...overrides,
    };
  }

  it('carries the mark and names the line when every point is covered', async () => {
    await scopeTo(25);

    const filed = await quality.post('/api/certificates').send(sheet([5, 20])).expect(201);

    expect(filed.body).toMatchObject({
      accredited: true,
      scopeRef: 'UKAS-0001/12',
      acceptancePolicy: 'MANAGED_RISK',
    });
    expect(filed.body.decisionRule).toContain('managed risk');
    expect(filed.body.decisionRule).toContain('reference UKAS-0001/12');
  });

  it('drops the mark when one point falls outside the range', async () => {
    await scopeTo(10);

    const filed = await quality.post('/api/certificates').send(sheet([5, 20])).expect(201);

    expect(filed.body.accredited).toBe(false);
    expect(filed.body.scopeRef).toBeNull();
    expect(filed.body.decisionRule).toContain('unaccredited result');
  });

  it('drops the mark when there is no schedule line at all', async () => {
    const filed = await quality.post('/api/certificates').send(sheet([20])).expect(201);

    expect(filed.body.accredited).toBe(false);
  });

  it('states whichever rule the sheet was filed under', async () => {
    await scopeTo(25);

    const filed = await quality
      .post('/api/certificates')
      .send(sheet([20], { acceptancePolicy: 'SHARED_RISK' }))
      .expect(201);

    expect(filed.body.acceptancePolicy).toBe('SHARED_RISK');
    expect(filed.body.decisionRule).toContain('simple acceptance');
  });

  it('never claims the mark for another laboratory work', async () => {
    await scopeTo(25);

    const filed = await quality
      .post('/api/certificates')
      .send(
        sheet([20], {
          externalLab: true,
          issuingLab: 'National Physical Laboratory',
          performedBy: 'somebody at NPL',
        }),
      )
      .expect(201);

    expect(filed.body.accredited).toBe(false);
  });

  it('does not change what an old certificate claimed when the schedule moves', async () => {
    await scopeTo(25);
    const filed = await quality.post('/api/certificates').send(sheet([20])).expect(201);

    await seeded.clear();

    const read = await quality.get(`/api/certificates/${filed.body.id}`).expect(200);
    expect(read.body).toMatchObject({ accredited: true, scopeRef: 'UKAS-0001/12' });
  });
});
