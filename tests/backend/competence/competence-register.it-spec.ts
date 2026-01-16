import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('the authorisation register', () => {
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

  function grant(body: Record<string, unknown> = {}) {
    return {
      person: 'r.okonjo',
      discipline: 'DIMENSIONAL',
      level: 'AUTHORISED',
      authorisedFrom: '2025-01-01',
      authorisedTo: '2026-12-31',
      evidence: 'witnessed against SG-9001 on 2024-12-18',
      ...body,
    };
  }

  it('grants an authorisation and reads it back', async () => {
    const granted = await quality.post('/api/competence').send(grant()).expect(201);

    expect(granted.body).toMatchObject({
      person: 'r.okonjo',
      discipline: 'DIMENSIONAL',
      level: 'AUTHORISED',
      classCode: null,
      live: true,
      withdrawn: false,
    });
    expect(granted.body.daysRemaining).toBe(406);
    expect(granted.body.grantedBy).toBe('suite.runner');
  });

  it('folds the name down so two spellings are one person', async () => {
    await quality.post('/api/competence').send(grant({ person: '  R.Okonjo ' })).expect(201);

    const held = await bench.get('/api/competence/people/R.OKONJO').expect(200);
    expect(held.body).toHaveLength(1);
  });

  it('refuses a second live grant at the same level for the same discipline', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);

    const refused = await quality.post('/api/competence').send(grant()).expect(409);
    expect(refused.body.detail).toContain('withdraw it before granting another');
  });

  it('allows a second grant at a different level', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);
    await quality.post('/api/competence').send(grant({ level: 'APPROVER' })).expect(201);

    const held = await bench.get('/api/competence/people/r.okonjo').expect(200);
    expect(held.body).toHaveLength(2);
  });

  it('allows a class narrowed grant beside a discipline wide one', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);
    await quality
      .post('/api/competence')
      .send(grant({ classCode: 'MIC-EXT', rangeLow: 0, rangeHigh: 25 }))
      .expect(201);

    const held = await bench.get('/api/competence/people/r.okonjo').expect(200);
    expect(held.body.map((row: { classCode: string | null }) => row.classCode).sort()).toEqual([
      'MIC-EXT',
      null,
    ]);
  });

  it('refuses a class code nobody has heard of', async () => {
    await quality.post('/api/competence').send(grant({ classCode: 'NOPE' })).expect(404);
  });

  it('refuses one end of a span on its own', async () => {
    await quality.post('/api/competence').send(grant({ rangeLow: 0 })).expect(422);
  });

  it('refuses a span that reads downwards', async () => {
    await quality
      .post('/api/competence')
      .send(grant({ rangeLow: 100, rangeHigh: 10 }))
      .expect(422);
  });

  it('refuses an authorisation that runs out before it starts', async () => {
    await quality
      .post('/api/competence')
      .send(grant({ authorisedFrom: '2026-01-01', authorisedTo: '2025-06-30' }))
      .expect(422);
  });

  it('withdraws rather than deletes, and says why', async () => {
    const granted = await quality.post('/api/competence').send(grant()).expect(201);

    const withdrawn = await quality
      .post(`/api/competence/${granted.body.id}/withdrawal`)
      .send({ reason: 'failed the annual witness check' })
      .expect(201);

    expect(withdrawn.body).toMatchObject({
      withdrawn: true,
      withdrawnReason: 'failed the annual witness check',
      live: false,
    });

    const live = await bench.get('/api/competence/people/r.okonjo').expect(200);
    expect(live.body).toHaveLength(0);

    const all = await bench
      .get('/api/competence/people/r.okonjo?includeWithdrawn=true')
      .expect(200);
    expect(all.body).toHaveLength(1);
  });

  it('will not withdraw the same authorisation twice', async () => {
    const granted = await quality.post('/api/competence').send(grant()).expect(201);

    await quality
      .post(`/api/competence/${granted.body.id}/withdrawal`)
      .send({ reason: 'left the laboratory' })
      .expect(201);
    await quality
      .post(`/api/competence/${granted.body.id}/withdrawal`)
      .send({ reason: 'again' })
      .expect(422);
  });

  it('frees the level up again once the old grant is withdrawn', async () => {
    const granted = await quality.post('/api/competence').send(grant()).expect(201);
    await quality
      .post(`/api/competence/${granted.body.id}/withdrawal`)
      .send({ reason: 'moved to the torque bench' })
      .expect(201);

    await quality.post('/api/competence').send(grant()).expect(201);
  });

  it('lists everybody live in a discipline', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);
    await quality
      .post('/api/competence')
      .send(grant({ person: 'a.pereira', authorisedTo: '2025-06-30' }))
      .expect(201);

    const live = await bench.get('/api/competence/disciplines/DIMENSIONAL').expect(200);
    expect(live.body.map((row: { person: string }) => row.person)).toEqual(['r.okonjo']);
  });

  it('builds the matrix with the highest level each person holds', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);
    await quality.post('/api/competence').send(grant({ level: 'APPROVER' })).expect(201);
    await quality
      .post('/api/competence')
      .send(grant({ person: 'a.pereira', discipline: 'TORQUE', level: 'TRAINEE' }))
      .expect(201);

    const matrix = await bench.get('/api/competence/matrix').expect(200);

    expect(matrix.body.people).toEqual(['a.pereira', 'r.okonjo']);
    expect(matrix.body.disciplines).toContain('TORQUE');
    expect(matrix.body.cells).toHaveLength(2);
    expect(matrix.body.cells).toContainEqual({
      person: 'r.okonjo',
      discipline: 'DIMENSIONAL',
      level: 'APPROVER',
      expiresOn: '2026-12-31',
      grants: 2,
    });
  });

  it('lists what runs out inside the horizon, soonest first', async () => {
    await quality.post('/api/competence').send(grant({ authorisedTo: '2026-01-10' })).expect(201);
    await quality
      .post('/api/competence')
      .send(grant({ person: 'a.pereira', authorisedTo: '2025-12-05' }))
      .expect(201);
    await quality
      .post('/api/competence')
      .send(grant({ person: 'j.fenwick', authorisedTo: null }))
      .expect(201);

    const soon = await bench.get('/api/competence/expiring?withinDays=60').expect(200);
    expect(soon.body.map((row: { person: string }) => row.person)).toEqual([
      'a.pereira',
      'r.okonjo',
    ]);
  });

  it('leaves the horizon out of it when nothing runs out soon', async () => {
    await quality.post('/api/competence').send(grant()).expect(201);

    const soon = await bench.get('/api/competence/expiring?withinDays=7').expect(200);
    expect(soon.body).toHaveLength(0);
  });

  it('lets the bench read the register but not grant anything', async () => {
    await bench.get('/api/competence/matrix').expect(200);
    await bench.post('/api/competence').send(grant()).expect(403);
  });
});
