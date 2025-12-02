import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

describe('the customer list', () => {
  let harness: TestApp;
  let desk: ReturnType<TestApp['api']>;
  let bench: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
    desk = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  async function open(code: string, name: string, body: Record<string, unknown> = {}) {
    const response = await desk.post('/api/customers').send({ code, name, ...body }).expect(201);
    return response.body;
  }

  it('opens a customer and reads it straight back', async () => {
    const created = await open('ACME', 'Acme Pressings', {
      contactName: 'J Fenwick',
      contactEmail: 'quality@acme.example',
      turnaroundDays: 15,
      accreditedRequired: true,
    });

    expect(created).toMatchObject({
      code: 'ACME',
      name: 'Acme Pressings',
      turnaroundDays: 15,
      accreditedRequired: true,
      active: true,
      reachable: true,
    });

    const fetched = await desk.get('/api/customers/ACME').expect(200);
    expect(fetched.body.id).toBe(created.id);
  });

  it('folds a lower case code up so the desk cannot open two of the same firm', async () => {
    await open('acme', 'Acme Pressings');

    await desk.post('/api/customers').send({ code: 'ACME', name: 'Acme again' }).expect(409);
    await desk.get('/api/customers/acme').expect(200);
  });

  it('refuses a code with a space in it before it reaches the database', async () => {
    await desk
      .post('/api/customers')
      .send({ code: 'ACME LTD', name: 'Acme Pressings' })
      .expect(400);
  });

  it('refuses a turnaround nobody could work to', async () => {
    await desk
      .post('/api/customers')
      .send({ code: 'ACME', name: 'Acme Pressings', turnaroundDays: 400 })
      .expect(400);
  });

  it('refuses an address that is not an email address', async () => {
    await desk
      .post('/api/customers')
      .send({ code: 'ACME', name: 'Acme', contactEmail: 'not an address' })
      .expect(400);
  });

  it('leaves the contact alone when the patch says nothing about it', async () => {
    await open('ACME', 'Acme Pressings', { contactName: 'J Fenwick', contactPhone: '01279 000' });

    const updated = await desk
      .patch('/api/customers/ACME')
      .send({ name: 'Acme Pressings Limited' })
      .expect(200);

    expect(updated.body).toMatchObject({
      name: 'Acme Pressings Limited',
      contactName: 'J Fenwick',
      contactPhone: '01279 000',
    });
  });

  it('lists the open customers by name with no jobs against them yet', async () => {
    await open('ZED', 'Zedbury Tooling');
    await open('ACME', 'Acme Pressings');

    const listed = await desk.get('/api/customers').expect(200);

    expect(listed.body.map((row: { code: string }) => row.code)).toEqual(['ACME', 'ZED']);
    expect(listed.body[0]).toMatchObject({ openJobs: 0, lateJobs: 0, lastReceivedOn: null });
  });

  it('hides a closed customer unless asked for', async () => {
    await open('ACME', 'Acme Pressings');
    await desk.post('/api/customers/ACME/close').expect(201);

    const hidden = await desk.get('/api/customers').expect(200);
    expect(hidden.body).toHaveLength(0);

    const shown = await desk.get('/api/customers?includeClosed=true').expect(200);
    expect(shown.body).toHaveLength(1);
    expect(shown.body[0].active).toBe(false);
  });

  it('brings a closed customer back', async () => {
    await open('ACME', 'Acme Pressings');
    await desk.post('/api/customers/ACME/close').expect(201);

    const reopened = await desk.post('/api/customers/ACME/reopen').expect(201);
    expect(reopened.body.active).toBe(true);
  });

  it('says so plainly when the code is not on file', async () => {
    const missing = await desk.get('/api/customers/NOBODY').expect(404);

    expect(missing.body.detail).toContain('customer NOBODY does not exist');
  });

  it('lets the bench read the list but not change it', async () => {
    await open('ACME', 'Acme Pressings');

    await bench.get('/api/customers').expect(200);
    await bench.post('/api/customers').send({ code: 'NEW', name: 'Somebody' }).expect(403);
    await bench.patch('/api/customers/ACME').send({ name: 'Renamed' }).expect(403);
  });
});
