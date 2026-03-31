import { Role } from '@registry/security/role';

import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('proficiency rounds', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let metrologist: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    metrologist = harness.api(harness.tokenFor(Role.METROLOGIST));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    await new RegisterFixtures(harness.dataSource).micrometer('SG-0001');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await new RegisterFixtures(harness.dataSource).micrometer('SG-0001');
  });

  function openRound(body: Record<string, unknown> = {}) {
    return quality.post('/api/proficiency').send({
      reference: 'ILC-2025-DIM-04',
      scheme: 'Dimensional gauge block comparison 2025',
      provider: 'Anglia Comparison Services',
      discipline: 'DIMENSIONAL',
      classCode: 'MIC-EXT',
      measurand: 'Gauge block length',
      unit: 'mm',
      openedOn: '2025-09-01',
      closesOn: '2025-10-31',
      ...body,
    });
  }

  function submit(lines: Record<string, unknown>[]) {
    return metrologist.post('/api/proficiency/ILC-2025-DIM-04/submission').send({ lines });
  }

  const GOOD_LINE = {
    sequenceNo: 1,
    performedBy: '  R.Okonjo ',
    assetTag: 'SG-0001',
    nominal: 20,
    reported: 20.0003,
    reportedUncertainty: 0.0006,
  };

  it('opens a round and leaves it waiting for us', async () => {
    const opened = await openRound().expect(201);

    expect(opened.body).toMatchObject({
      reference: 'ILC-2025-DIM-04',
      state: 'OPEN',
      classCode: 'MIC-EXT',
      outcome: 'NOT_SCORED',
      open: true,
      overdue: true,
    });
    expect(opened.body.results).toHaveLength(0);
  });

  it('refuses a second round with the same reference', async () => {
    await openRound().expect(201);
    await openRound().expect(409);
  });

  it('refuses a round that closes before it opens', async () => {
    await openRound({ openedOn: '2025-10-31', closesOn: '2025-09-01' }).expect(422);
  });

  it('is not overdue while the closing date is still ahead', async () => {
    const opened = await openRound({ closesOn: '2025-12-31' }).expect(201);

    expect(opened.body.overdue).toBe(false);
  });

  it('records what we sent back and folds the name down', async () => {
    await openRound().expect(201);

    const submitted = await submit([GOOD_LINE]).expect(201);

    expect(submitted.body.state).toBe('SUBMITTED');
    expect(submitted.body.results[0]).toMatchObject({
      sequenceNo: 1,
      performedBy: 'r.okonjo',
      assetTag: 'SG-0001',
      outcome: 'NOT_SCORED',
      assigned: null,
    });
  });

  it('refuses the same line twice on one submission', async () => {
    await openRound().expect(201);

    await submit([GOOD_LINE, { ...GOOD_LINE }]).expect(422);
  });

  it('refuses to submit twice', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);
    await submit([GOOD_LINE]).expect(409);
  });

  it('scores every line off the scheme report', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);

    const scored = await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
        reportedOn: '2025-11-15',
      })
      .expect(201);

    expect(scored.body.state).toBe('SCORED');
    expect(scored.body.reportedOn).toBe('2025-11-15');
    expect(scored.body.outcome).toBe('SATISFACTORY');
    expect(scored.body.results[0]).toMatchObject({
      assigned: 20,
      enNumber: 0.4472,
      zScore: 0.3,
      outcome: 'SATISFACTORY',
    });
  });

  it('takes the worst line as the outcome of the round', async () => {
    await openRound().expect(201);
    await submit([
      GOOD_LINE,
      { ...GOOD_LINE, sequenceNo: 2, reported: 20.004, reportedUncertainty: 0.0002 },
    ]).expect(201);

    const scored = await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
          { sequenceNo: 2, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
      })
      .expect(201);

    expect(scored.body.results[1].outcome).toBe('UNSATISFACTORY');
    expect(scored.body.outcome).toBe('UNSATISFACTORY');
  });

  it('raises one high severity nonconformance when an en number goes past one', async () => {
    await openRound().expect(201);
    await submit([{ ...GOOD_LINE, reported: 20.004, reportedUncertainty: 0.0002 }]).expect(201);
    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
      })
      .expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
    expect(raised.body[0]).toMatchObject({
      source: 'PROFICIENCY',
      sourceRef: 'ILC-2025-DIM-04',
      severity: 'HIGH',
    });
    expect(raised.body[0].detail).toContain('r.okonjo');
    expect(raised.body[0].detail).toContain('stated uncertainty is in question');
  });

  it('raises only one nonconformance however many lines failed', async () => {
    await openRound().expect(201);
    await submit([
      { ...GOOD_LINE, reported: 20.004, reportedUncertainty: 0.0002 },
      { ...GOOD_LINE, sequenceNo: 2, reported: 20.005, reportedUncertainty: 0.0002 },
    ]).expect(201);
    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
          { sequenceNo: 2, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
      })
      .expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
  });

  it('raises nothing at all on a satisfactory round', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);
    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
      })
      .expect(201);

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(0);
  });

  it('will not score a round nobody has submitted', async () => {
    await openRound().expect(201);

    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({ lines: [{ sequenceNo: 1, assigned: 20 }] })
      .expect(409);
  });

  it('will not score a line that was never submitted', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);

    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({ lines: [{ sequenceNo: 9, assigned: 20 }] })
      .expect(404);
  });

  it('will not score the same round twice', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);

    const report = {
      lines: [
        { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
      ],
    };
    await quality.post('/api/proficiency/ILC-2025-DIM-04/score').send(report).expect(201);
    await quality.post('/api/proficiency/ILC-2025-DIM-04/score').send(report).expect(409);
  });

  it('withdraws a round with the reason kept on it', async () => {
    await openRound().expect(201);

    const withdrawn = await quality
      .post('/api/proficiency/ILC-2025-DIM-04/withdrawal?reason=artefact damaged in transit')
      .expect(201);

    expect(withdrawn.body.state).toBe('WITHDRAWN');
    expect(withdrawn.body.note).toContain('artefact damaged in transit');
  });

  it('lists everything one person has been scored on', async () => {
    await openRound().expect(201);
    await submit([GOOD_LINE]).expect(201);
    await quality
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({
        lines: [
          { sequenceNo: 1, assigned: 20, assignedUncertainty: 0.0003, standardDeviation: 0.001 },
        ],
      })
      .expect(201);

    const held = await bench.get('/api/proficiency/people/R.Okonjo').expect(200);
    expect(held.body).toHaveLength(1);
    expect(held.body[0].outcome).toBe('SATISFACTORY');
  });

  it('filters the list by state', async () => {
    await openRound().expect(201);
    await openRound({ reference: 'ILC-2025-DIM-05' }).expect(201);
    await submit([GOOD_LINE]).expect(201);

    const open = await bench.get('/api/proficiency?state=OPEN').expect(200);
    expect(open.body.map((row: { reference: string }) => row.reference)).toEqual([
      'ILC-2025-DIM-05',
    ]);
  });

  it('will not let the bench open or score a round', async () => {
    await openRound().expect(201);

    await bench.post('/api/proficiency').send({}).expect(403);
    await bench
      .post('/api/proficiency/ILC-2025-DIM-04/score')
      .send({ lines: [{ sequenceNo: 1, assigned: 20 }] })
      .expect(403);
  });

  it('says so plainly when the round is not on file', async () => {
    await bench.get('/api/proficiency/NOT-A-ROUND').expect(404);
  });
});
