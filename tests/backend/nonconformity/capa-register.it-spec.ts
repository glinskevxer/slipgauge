import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('the nonconformance register', () => {
  let harness: TestApp;
  let quality: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    quality = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  function raise(body: Record<string, unknown> = {}) {
    return bench.post('/api/nonconformities').send({
      source: 'COMPLAINT',
      severity: 'MEDIUM',
      title: 'customer says the certificate quotes the wrong serial',
      detail: 'Acme rang about CAL-2025-0100, the serial on it is not their micrometer.',
      ...body,
    });
  }

  it('raises one in three fields and works the due date out', async () => {
    const raised = await raise().expect(201);

    expect(raised.body).toMatchObject({
      reference: 'NC-2025-001',
      state: 'RAISED',
      severity: 'MEDIUM',
      raisedBy: 'suite.runner',
      open: true,
      answersGiven: 0,
      closesFrom: 'ACTION_TAKEN',
    });
    // Thirty working days from Thursday 20 November.
    expect(raised.body.dueOn).toBe('2026-01-01');
  });

  it('gives a high severity record ten working days rather than thirty', async () => {
    const raised = await raise({ severity: 'HIGH' }).expect(201);

    expect(raised.body.dueOn).toBe('2025-12-04');
    expect(raised.body.closesFrom).toBe('EFFECTIVENESS_CHECKED');
  });

  it('runs the reference sequence on inside the year', async () => {
    await raise().expect(201);
    const second = await raise().expect(201);

    expect(second.body.reference).toBe('NC-2025-002');
  });

  it('refuses a second record against the same source event', async () => {
    await raise({ source: 'EXCURSION', sourceRef: '41' }).expect(201);

    const refused = await raise({ source: 'EXCURSION', sourceRef: '41' }).expect(409);
    expect(refused.body.detail).toContain('was already raised against excursion 41');
  });

  it('allows the same reference under a different source', async () => {
    await raise({ source: 'EXCURSION', sourceRef: '41' }).expect(201);
    await raise({ source: 'AUDIT', sourceRef: '41' }).expect(201);
  });

  it('records each stage in order with its own text', async () => {
    await raise().expect(201);

    const contained = await bench
      .post('/api/nonconformities/NC-2025-001/containment')
      .send({ text: 'certificate withdrawn and the customer told' })
      .expect(201);
    expect(contained.body).toMatchObject({
      state: 'CONTAINED',
      containedOn: '2025-11-20',
      answersGiven: 1,
    });

    const caused = await bench
      .post('/api/nonconformities/NC-2025-001/cause')
      .send({ text: 'two micrometers of the same model booked in on one job line' })
      .expect(201);
    expect(caused.body).toMatchObject({ state: 'CAUSE_FOUND', answersGiven: 2 });

    const acted = await bench
      .post('/api/nonconformities/NC-2025-001/action')
      .send({ text: 'goods inwards now records a serial per line' })
      .expect(201);
    expect(acted.body).toMatchObject({ state: 'ACTION_TAKEN', answersGiven: 3 });
  });

  it('will not let a stage be jumped', async () => {
    await raise().expect(201);

    const refused = await bench
      .post('/api/nonconformities/NC-2025-001/cause')
      .send({ text: 'straight to the cause' })
      .expect(409);

    expect(refused.body.detail).toContain('the next stage is CONTAINED');
  });

  it('will not take a stage with a blank answer', async () => {
    await raise().expect(201);

    await bench
      .post('/api/nonconformities/NC-2025-001/containment')
      .send({ text: '   ' })
      .expect(422);
  });

  it('closes a medium record once something was done about it', async () => {
    await raise().expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/containment')
      .send({ text: 'certificate withdrawn' })
      .expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/cause')
      .send({ text: 'two of the same model on one line' })
      .expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/action')
      .send({ text: 'a serial per line at goods inwards' })
      .expect(201);

    const closed = await quality.post('/api/nonconformities/NC-2025-001/closure').expect(201);
    expect(closed.body).toMatchObject({
      state: 'CLOSED',
      closedBy: 'suite.runner',
      closedOn: '2025-11-20',
      open: false,
    });
  });

  it('will not close a high severity record before the effectiveness check', async () => {
    await raise({ severity: 'HIGH' }).expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/containment')
      .send({ text: 'work stopped' })
      .expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/cause')
      .send({ text: 'the chiller had no service contract' })
      .expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-001/action')
      .send({ text: 'service contract taken out' })
      .expect(201);

    const refused = await quality.post('/api/nonconformities/NC-2025-001/closure').expect(422);
    expect(refused.body.detail).toContain('cannot close until it reaches effectiveness_checked');

    await bench
      .post('/api/nonconformities/NC-2025-001/effectiveness')
      .send({ text: 'three months of logs, no excursion' })
      .expect(201);
    await quality.post('/api/nonconformities/NC-2025-001/closure').expect(201);
  });

  it('will not close the same record twice', async () => {
    await raise({ severity: 'LOW' }).expect(201);
    for (const stage of ['containment', 'cause', 'action']) {
      await bench
        .post(`/api/nonconformities/NC-2025-001/${stage}`)
        .send({ text: `something for ${stage}` })
        .expect(201);
    }
    await quality.post('/api/nonconformities/NC-2025-001/closure').expect(201);
    await quality.post('/api/nonconformities/NC-2025-001/closure').expect(422);
  });

  it('abandons with a reason kept on the record', async () => {
    await raise().expect(201);

    const abandoned = await quality
      .post('/api/nonconformities/NC-2025-001/abandonment')
      .send({ reason: 'raised twice, NC-2025-002 carries it' })
      .expect(201);

    expect(abandoned.body.state).toBe('ABANDONED');
    expect(abandoned.body.detail).toContain('abandoned: raised twice');
  });

  it('assigns an owner and a date, and refuses one before it was raised', async () => {
    await raise().expect(201);

    const assigned = await quality
      .post('/api/nonconformities/NC-2025-001/assignment')
      .send({ owner: 'h.whitcombe', dueOn: '2025-12-01' })
      .expect(201);
    expect(assigned.body).toMatchObject({ owner: 'h.whitcombe', dueOn: '2025-12-01' });

    await quality
      .post('/api/nonconformities/NC-2025-001/assignment')
      .send({ dueOn: '2025-01-01' })
      .expect(422);
  });

  /**
   * Lateness is a reading of the clock rather than a fact about the record, so
   * the only honest way to test it is to read the same row on a later day. A
   * second app on the same database is what a second morning looks like.
   */
  it('reads lateness and escalation off the due date on a later day', async () => {
    await raise({ severity: 'HIGH' }).expect(201);

    const onTheDay = await bench.get('/api/nonconformities').expect(200);
    expect(onTheDay.body[0]).toMatchObject({ dueOn: '2025-12-04', lateness: -14, escalate: false });

    const later = await createTestApp({ now: '2025-12-05T09:00:00Z' });

    try {
      const listed = await later
        .api(later.tokenFor(Role.TECHNICIAN))
        .get('/api/nonconformities')
        .expect(200);

      expect(listed.body[0]).toMatchObject({ lateness: 1, escalate: true });
    } finally {
      await later.close();
    }
  });

  it('stops the lateness clock once the record is closed', async () => {
    await raise({ severity: 'LOW' }).expect(201);
    for (const stage of ['containment', 'cause', 'action']) {
      await bench
        .post(`/api/nonconformities/NC-2025-001/${stage}`)
        .send({ text: `something for ${stage}` })
        .expect(201);
    }
    await quality.post('/api/nonconformities/NC-2025-001/closure').expect(201);

    const later = await createTestApp({ now: '2026-06-01T09:00:00Z' });

    try {
      const listed = await later
        .api(later.tokenFor(Role.TECHNICIAN))
        .get('/api/nonconformities?includeClosed=true')
        .expect(200);

      expect(listed.body[0].lateness).toBeLessThan(0);
      expect(listed.body[0].escalate).toBe(false);
    } finally {
      await later.close();
    }
  });

  it('lists open records worst first and hides the closed ones', async () => {
    await raise({ severity: 'LOW', title: 'a small one' }).expect(201);
    await raise({ severity: 'HIGH', title: 'a big one' }).expect(201);

    const open = await bench.get('/api/nonconformities').expect(200);
    expect(open.body.map((row: { severity: string }) => row.severity)).toEqual(['HIGH', 'LOW']);

    await quality
      .post('/api/nonconformities/NC-2025-001/abandonment')
      .send({ reason: 'not a nonconformance' })
      .expect(201);

    const after = await bench.get('/api/nonconformities').expect(200);
    expect(after.body).toHaveLength(1);

    const all = await bench.get('/api/nonconformities?includeClosed=true').expect(200);
    expect(all.body).toHaveLength(2);
  });

  it('filters by stage when asked', async () => {
    await raise().expect(201);
    await raise().expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-002/containment')
      .send({ text: 'stopped' })
      .expect(201);

    const contained = await bench.get('/api/nonconformities?state=CONTAINED').expect(200);
    expect(contained.body.map((row: { reference: string }) => row.reference)).toEqual([
      'NC-2025-002',
    ]);
  });

  it('counts the board across the top', async () => {
    await raise({ severity: 'HIGH' }).expect(201);
    await raise({ severity: 'LOW' }).expect(201);
    await bench
      .post('/api/nonconformities/NC-2025-002/containment')
      .send({ text: 'stopped' })
      .expect(201);

    const summary = await bench.get('/api/nonconformities/summary').expect(200);
    expect(summary.body).toMatchObject({ open: 2, high: 1, late: 0, escalating: 0 });
    expect(summary.body.byStage).toEqual({ RAISED: 1, CONTAINED: 1 });
  });

  it('will not let the bench close or assign one', async () => {
    await raise().expect(201);

    await bench.post('/api/nonconformities/NC-2025-001/closure').expect(403);
    await bench
      .post('/api/nonconformities/NC-2025-001/assignment')
      .send({ owner: 'somebody' })
      .expect(403);
  });

  it('says so plainly when the reference is not on file', async () => {
    await bench.get('/api/nonconformities/NC-2099-999').expect(404);
  });
});
