import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

// 2025-11-20 is a Thursday, so a ten working day promise lands on 2025-12-04.
const TODAY = '2025-11-20T09:00:00Z';

describe('booking customer work in', () => {
  let harness: TestApp;
  let bench: ReturnType<TestApp['api']>;
  let desk: ReturnType<TestApp['api']>;
  let auditor: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    desk = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));
    auditor = harness.api(harness.tokenFor(Role.AUDITOR));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await desk
      .post('/api/customers')
      .send({ code: 'ACME', name: 'Acme Pressings', turnaroundDays: 10 })
      .expect(201);
  });

  function delivery(body: Record<string, unknown> = {}) {
    return {
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
      ...body,
    };
  }

  it('books a delivery in and quotes the customer turnaround in working days', async () => {
    const booked = await bench.post('/api/jobs').send(delivery()).expect(201);

    expect(booked.body).toMatchObject({
      reference: 'J-2025-0001',
      customerCode: 'ACME',
      state: 'RECEIVED',
      priority: 'STANDARD',
      receivedOn: '2025-11-20',
      promisedOn: '2025-12-04',
      open: true,
    });
    expect(booked.body.items).toHaveLength(1);
    expect(booked.body.items[0]).toMatchObject({
      lineNumber: 1,
      classCode: 'MIC-EXT',
      calibratable: true,
      assetTag: null,
    });
  });

  it('cuts the promise for a priority job and drops it to the day for a same day one', async () => {
    const priority = await bench
      .post('/api/jobs')
      .send(delivery({ priority: 'PRIORITY' }))
      .expect(201);
    expect(priority.body.promisedOn).toBe('2025-11-26');

    const sameDay = await bench
      .post('/api/jobs')
      .send(delivery({ priority: 'SAME_DAY' }))
      .expect(201);
    expect(sameDay.body.promisedOn).toBe('2025-11-20');
  });

  it('never promises a weekend', async () => {
    const saturday = await bench
      .post('/api/jobs')
      .send(delivery({ receivedOn: '2025-11-15', priority: 'SAME_DAY' }))
      .expect(201);

    expect(saturday.body.promisedOn).toBe('2025-11-17');
  });

  it('runs the reference sequence on inside the year', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);
    const second = await bench.post('/api/jobs').send(delivery()).expect(201);

    expect(second.body.reference).toBe('J-2025-0002');
  });

  it('starts a fresh sequence in a new year', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);
    const older = await bench
      .post('/api/jobs')
      .send(delivery({ receivedOn: '2024-06-03' }))
      .expect(201);

    expect(older.body.reference).toBe('J-2024-0001');
  });

  it('refuses a delivery that has not arrived yet', async () => {
    await bench
      .post('/api/jobs')
      .send(delivery({ receivedOn: '2026-01-05' }))
      .expect(422);
  });

  it('refuses a class code nobody has heard of', async () => {
    const response = await bench
      .post('/api/jobs')
      .send(delivery({ items: [{ service: 'CALIBRATION', description: 'thing', classCode: 'NOPE' }] }))
      .expect(404);

    expect(response.body.detail).toContain('instrument class NOPE');
  });

  it('refuses a delivery with no lines on it', async () => {
    await bench.post('/api/jobs').send(delivery({ items: [] })).expect(400);
  });

  it('refuses to book work in for a closed account', async () => {
    await desk.post('/api/customers/ACME/close').expect(201);

    const refused = await bench.post('/api/jobs').send(delivery()).expect(422);
    expect(refused.body.detail).toContain('reopen the account');
  });

  it('will not let the account be closed while the job is open', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    const refused = await desk.post('/api/customers/ACME/close').expect(422);
    expect(refused.body.detail).toContain('1 open job');
  });

  it('adds a line to a job that has not been reviewed', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    const updated = await bench
      .post('/api/jobs/J-2025-0001/items')
      .send({ service: 'REPAIR', description: 'vernier with a bent jaw' })
      .expect(201);

    expect(updated.body.items.map((item: { lineNumber: number }) => item.lineNumber)).toEqual([
      1, 2,
    ]);
    expect(updated.body.items[1].calibratable).toBe(false);
  });

  it('moves the promise and writes the reason where the bench will see it', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    const moved = await bench
      .post('/api/jobs/J-2025-0001/promise')
      .send({ promisedOn: '2025-12-12', reason: 'customer asked for it after the shutdown' })
      .expect(201);

    expect(moved.body.promisedOn).toBe('2025-12-12');
    expect(moved.body.instructions).toContain('repromised: customer asked for it');
  });

  it('refuses a promise earlier than the day it arrived', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    await bench
      .post('/api/jobs/J-2025-0001/promise')
      .send({ promisedOn: '2025-11-01', reason: 'typing mistake' })
      .expect(422);
  });

  it('reads lateness in working days, negative while there is time', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    const job = await bench.get('/api/jobs/J-2025-0001').expect(200);
    expect(job.body.lateness).toBe(-10);
  });

  it('lists what is open and counts it on the desk', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);
    await bench.post('/api/jobs').send(delivery({ priority: 'SAME_DAY' })).expect(201);

    const listed = await bench.get('/api/jobs').expect(200);
    expect(listed.body.totalItems).toBe(2);
    expect(listed.body.items[0]).toMatchObject({ itemCount: 1, open: true });

    const desk = await bench.get('/api/jobs/desk').expect(200);
    expect(desk.body).toMatchObject({ open: 2, awaitingReview: 0, dueToday: 1, late: 0 });
  });

  it('filters the list by customer', async () => {
    await desk.post('/api/customers').send({ code: 'ZED', name: 'Zedbury' }).expect(201);
    await bench.post('/api/jobs').send(delivery()).expect(201);
    await bench.post('/api/jobs').send(delivery({ customerCode: 'ZED' })).expect(201);

    const filtered = await bench.get('/api/jobs?customer=ZED').expect(200);
    expect(filtered.body.totalItems).toBe(1);
    expect(filtered.body.items[0].customerCode).toBe('ZED');
  });

  it('refuses a sort column that is not on the whitelist', async () => {
    await bench.get('/api/jobs?sort=receivedBy').expect(400);
  });

  it('lets an auditor read the desk but not book anything in', async () => {
    await bench.post('/api/jobs').send(delivery()).expect(201);

    await auditor.get('/api/jobs/J-2025-0001').expect(200);
    await auditor.post('/api/jobs').send(delivery()).expect(403);
  });
});
