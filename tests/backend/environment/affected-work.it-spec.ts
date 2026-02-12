import { CalibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-25T09:00:00Z';

const OUTSIDE_STANDARD = {
  externalRef: 'NPL 2024/117',
  externalLab: 'National Physical Laboratory',
  externalCertificateNumber: 'NPL-2024-117',
  externalAccreditation: 'UKAS 0001',
  externalValidFrom: '2024-11-01',
  externalValidTo: '2026-10-31',
  role: 'REFERENCE',
};

function sample(day: number, hour: number, temperature: number) {
  return {
    takenAt: new Date(Date.UTC(2025, 10, day, hour, 0, 0)).toISOString(),
    temperature,
  };
}

/**
 * The composition the room log exists for: an excursion in a room puts the work
 * done in that room in question, withdrawing it replays the intervals, and the
 * recall dates move on their own.
 */
describe('what an excursion put in question', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;
  let register: RegisterFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER, Role.METROLOGIST));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    register = new RegisterFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await new CompetenceFixtures(harness.dataSource).grant(
      'r.okonjo',
      Discipline.DIMENSIONAL,
      CompetenceLevel.AUTHORISED,
    );

    await register.micrometer('SG-0001');
    await register.micrometer('SG-0002');

    await quality
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 19, temperatureMax: 21 })
      .expect(200);
  });

  async function file(number: string, assetTag: string, performedOn: string, room?: string) {
    const response = await quality
      .post('/api/certificates')
      .send({
        certificateNumber: number,
        assetTag,
        performedOn,
        issuedOn: performedOn,
        performedBy: 'r.okonjo',
        issuingLab: 'Slipgauge Metrology',
        ...(room ? { performedInLocationCode: room } : {}),
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0004, expandedUncertainty: 0.0005 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);
    return response.body;
  }

  /** A three hour excursion on the 20th, closed. */
  async function excursionOnThe20th(): Promise<number> {
    await bench
      .post('/api/environment/readings')
      .send({
        locationCode: 'HARLOW-DIM',
        loggerRef: 'LOG-1',
        readings: [
          sample(20, 8, 20),
          sample(20, 9, 22.4),
          sample(20, 10, 22.6),
          sample(20, 11, 22.1),
          sample(20, 12, 20),
        ],
      })
      .expect(201);

    const excursions = await bench.get('/api/environment/excursions').expect(200);
    return excursions.body[0].id as number;
  }

  it('records the room the work was done in', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20');

    const held = await harness.dataSource
      .getRepository(CalibrationCertificate)
      .findOneOrFail({ where: { certificateNumber: 'CAL-1' }, relations: { performedIn: true } });

    expect(held.performedIn?.code).toBe('HARLOW-DIM');
  });

  it('takes the room off the sheet when the sheet says one', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20', 'CREWE-TOOL');

    const held = await harness.dataSource
      .getRepository(CalibrationCertificate)
      .findOneOrFail({ where: { certificateNumber: 'CAL-1' }, relations: { performedIn: true } });

    expect(held.performedIn?.code).toBe('CREWE-TOOL');
  });

  it('lists the certificates issued in the room while it was out', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20');
    await file('CAL-2', 'SG-0002', '2025-11-18');

    const id = await excursionOnThe20th();
    const affected = await quality.get(`/api/environment/excursions/${id}/affected`).expect(200);

    expect(affected.body.locationCode).toBe('HARLOW-DIM');
    expect(affected.body.certificates.map((row: { certificateNumber: string }) => row.certificateNumber)).toEqual([
      'CAL-1',
    ]);
  });

  it('leaves work done in another room out of it', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20', 'CREWE-TOOL');

    const id = await excursionOnThe20th();
    const affected = await quality.get(`/api/environment/excursions/${id}/affected`).expect(200);

    expect(affected.body.certificates).toHaveLength(0);
  });

  it('withdraws everything the excursion put in question', async () => {
    const first = await file('CAL-1', 'SG-0001', '2025-11-20');
    await file('CAL-2', 'SG-0002', '2025-11-20');

    const id = await excursionOnThe20th();
    const result = await quality
      .post(`/api/environment/excursions/${id}/withdrawals`)
      .send({ reason: 'dimensional room outside band, chiller tripped' })
      .expect(201);

    expect(result.body).toEqual({ withdrawn: 2, alreadyWithdrawn: 0 });

    const held = await quality.get(`/api/certificates/${first.id}`).expect(200);
    expect(held.body.withdrawnAt).not.toBeNull();
    expect(held.body.withdrawnReason).toContain('chiller tripped');
  });

  it('moves the recall date because the evidence behind it is gone', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20');

    const before = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-0001' });
    expect(before.lastCalibratedOn).toBe('2025-11-20');
    expect(before.nextDueOn).not.toBeNull();

    const id = await excursionOnThe20th();
    await quality
      .post(`/api/environment/excursions/${id}/withdrawals`)
      .send({ reason: 'room outside band' })
      .expect(201);

    // The interval engine replays what is left, which is nothing, so the
    // instrument falls back to never having been calibrated and the recall
    // date it had is gone rather than merely stale.
    const after = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-0001' });
    expect(after.lastCalibratedOn).toBeNull();
    expect(after.nextDueOn).not.toBe(before.nextDueOn);
  });

  it('counts a certificate that was already withdrawn rather than failing on it', async () => {
    const first = await file('CAL-1', 'SG-0001', '2025-11-20');
    await file('CAL-2', 'SG-0002', '2025-11-20');

    await quality
      .post(`/api/certificates/${first.id}/withdrawal`)
      .query({ reason: 'wrong standard quoted' })
      .expect(201);

    const id = await excursionOnThe20th();
    const result = await quality
      .post(`/api/environment/excursions/${id}/withdrawals`)
      .send({ reason: 'room outside band' })
      .expect(201);

    expect(result.body).toEqual({ withdrawn: 1, alreadyWithdrawn: 1 });
  });

  it('will not let the bench withdraw a room full of work', async () => {
    await file('CAL-1', 'SG-0001', '2025-11-20');
    const id = await excursionOnThe20th();

    await bench
      .post(`/api/environment/excursions/${id}/withdrawals`)
      .send({ reason: 'room outside band' })
      .expect(403);
  });

  it('says so plainly when the excursion is not there', async () => {
    await quality.get('/api/environment/excursions/9999/affected').expect(404);
  });

  it('leaves a certificate from another laboratory with no room at all', async () => {
    await quality
      .post('/api/certificates')
      .send({
        certificateNumber: 'NPL-9',
        assetTag: 'SG-0001',
        performedOn: '2025-11-20',
        issuedOn: '2025-11-20',
        performedBy: 'somebody at NPL',
        issuingLab: 'National Physical Laboratory',
        externalLab: true,
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0004, expandedUncertainty: 0.0005 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);

    const id = await excursionOnThe20th();
    const affected = await quality.get(`/api/environment/excursions/${id}/affected`).expect(200);

    expect(affected.body.certificates).toHaveLength(0);
  });
});
