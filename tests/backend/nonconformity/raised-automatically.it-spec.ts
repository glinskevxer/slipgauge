import { CompetenceLevel } from '@registry/competence/competence-level';
import { Instrument } from '@registry/instrument/instrument.entity';
import { Discipline } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { CompetenceFixtures } from '../support/competence-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { OUTSIDE_STANDARD } from '../support/sheet-fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-25T09:00:00Z';

function sample(hour: number, temperature: number) {
  return {
    takenAt: new Date(Date.UTC(2025, 10, 20, hour, 0, 0)).toISOString(),
    temperature,
  };
}

/**
 * The register is supposed to raise its own nonconformances. A laboratory where
 * somebody has to remember to open one is a laboratory whose CAPA register is a
 * record of what people remembered.
 */
describe('nonconformances the registry raises for itself', () => {
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

    await quality
      .put('/api/environment/limits')
      .send({ locationCode: 'HARLOW-DIM', temperatureMin: 19, temperatureMax: 21 })
      .expect(200);
  });

  function upload(readings: ReturnType<typeof sample>[]) {
    return bench
      .post('/api/environment/readings')
      .send({ locationCode: 'HARLOW-DIM', loggerRef: 'LOG-1', readings });
  }

  it('raises one off a significant excursion', async () => {
    await upload([sample(8, 20), sample(9, 21.3), sample(10, 21.3), sample(11, 20)]).expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
    expect(raised.body[0]).toMatchObject({
      source: 'EXCURSION',
      severity: 'MEDIUM',
      title: 'HARLOW-DIM outside its band',
      raisedBy: 'registry',
      state: 'RAISED',
    });
    expect(raised.body[0].detail).toContain('TEMPERATURE_HIGH in Dimensional room');
  });

  it('raises a high severity one off a major excursion', async () => {
    await upload([sample(8, 20), sample(9, 24), sample(10, 20)]).expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body[0]).toMatchObject({
      severity: 'HIGH',
      closesFrom: 'EFFECTIVENESS_CHECKED',
    });
  });

  it('raises nothing at all for a minor one', async () => {
    await upload([sample(8, 20), sample(9, 21.05), sample(10, 20)]).expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(0);
  });

  it('does not raise a second one when the window is swept again', async () => {
    await upload([sample(8, 20), sample(9, 21.3), sample(10, 21.3), sample(11, 20)]).expect(201);
    await upload([sample(14, 20)]).expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
  });

  it('raises one off an out of tolerance certificate, beside the assessment', async () => {
    await quality
      .post('/api/certificates')
      .send({
        certificateNumber: 'CAL-9001',
        assetTag: 'SG-0001',
        performedOn: '2025-11-21',
        issuedOn: '2025-11-21',
        performedBy: 'r.okonjo',
        issuingLab: 'Slipgauge Metrology',
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0091, expandedUncertainty: 0.0005 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);

    const assessments = await quality.get('/api/impact').expect(200);
    expect(assessments.body).toHaveLength(1);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
    expect(raised.body[0]).toMatchObject({
      source: 'OUT_OF_TOLERANCE',
      sourceRef: 'CAL-9001',
      title: 'SG-0001 came back out of tolerance',
    });
    expect(raised.body[0].detail).toContain('Certificate CAL-9001 found');
  });

  it('raises nothing for a certificate that passed', async () => {
    await quality
      .post('/api/certificates')
      .send({
        certificateNumber: 'CAL-9002',
        assetTag: 'SG-0001',
        performedOn: '2025-11-21',
        issuedOn: '2025-11-21',
        performedBy: 'r.okonjo',
        issuingLab: 'Slipgauge Metrology',
        points: [{ sequenceNo: 1, nominal: 20, asFound: 20.0004, expandedUncertainty: 0.0005 }],
        standards: [OUTSIDE_STANDARD],
      })
      .expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(0);
  });

  it('leaves the raised one to be worked through like any other', async () => {
    await upload([sample(8, 20), sample(9, 21.3), sample(10, 21.3), sample(11, 20)]).expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    const reference = raised.body[0].reference;

    await bench
      .post(`/api/nonconformities/${reference}/containment`)
      .send({ text: 'work in the room stopped until the chiller was fixed' })
      .expect(201);
    await bench
      .post(`/api/nonconformities/${reference}/cause`)
      .send({ text: 'the chiller had no service contract' })
      .expect(201);
    await bench
      .post(`/api/nonconformities/${reference}/action`)
      .send({ text: 'annual service contract taken out' })
      .expect(201);

    const closed = await quality.post(`/api/nonconformities/${reference}/closure`).expect(201);
    expect(closed.body.state).toBe('CLOSED');
  });
});
