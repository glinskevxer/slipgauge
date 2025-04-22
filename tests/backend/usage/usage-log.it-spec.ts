import request from 'supertest';

import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { UsageService } from '@registry/usage/usage.service';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('logging what an instrument was used on', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let usage: UsageService;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
    usage = harness.app.get(UsageService);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await register.micrometer('SG-700001');
  });

  const http = () => request(harness.app.getHttpServer());

  function use(overrides: Record<string, unknown> = {}) {
    return {
      assetTag: 'SG-700001',
      usedOn: '2025-05-06',
      usedBy: 'A Technician',
      workOrder: 'WO-4417',
      customer: 'Fenwick Aerospace',
      purpose: 'first article inspection',
      readingCount: 12,
      ...overrides,
    };
  }

  it('records a use and reads back a line a chaser can act on', async () => {
    const logged = await http().post('/api/usage').send(use()).expect(201);

    expect(logged.body.assetTag).toBe('SG-700001');
    expect(logged.body.readingCount).toBe(12);
    expect(logged.body.summary).toBe('A Technician on WO-4417 for Fenwick Aerospace');
  });

  it('defaults to a single reading when the bench does not say', async () => {
    const logged = await http()
      .post('/api/usage')
      .send(use({ readingCount: undefined }))
      .expect(201);

    expect(logged.body.readingCount).toBe(1);
  });

  it('refuses a use by an instrument that is quarantined', async () => {
    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-700001' });

    instrument.transitionTo(InstrumentStatus.QUARANTINED);
    await harness.dataSource.getRepository(Instrument).save(instrument);

    const refused = await http().post('/api/usage').send(use()).expect(422);

    expect(refused.body.detail).toContain('must not be used to take a reading');
  });

  it('refuses a use by an instrument that is away at calibration', async () => {
    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-700001' });

    instrument.transitionTo(InstrumentStatus.IN_CALIBRATION);
    await harness.dataSource.getRepository(Instrument).save(instrument);

    await http().post('/api/usage').send(use()).expect(422);
  });

  it('refuses a use dated in the future or before the instrument existed', async () => {
    await http().post('/api/usage').send(use({ usedOn: '2025-06-11' })).expect(422);
    await http().post('/api/usage').send(use({ usedOn: '2019-01-01' })).expect(422);
  });

  it('refuses a reading count of zero at the edge of the request', async () => {
    await http().post('/api/usage').send(use({ readingCount: 0 })).expect(400);
  });

  it('reports an unknown asset tag as not found', async () => {
    await http().post('/api/usage').send(use({ assetTag: 'SG-999999' })).expect(404);
  });

  it('lists an instrument history newest use first', async () => {
    await http().post('/api/usage').send(use({ usedOn: '2025-01-06' })).expect(201);
    await http().post('/api/usage').send(use({ usedOn: '2025-05-06' })).expect(201);
    await http().post('/api/usage').send(use({ usedOn: '2025-03-06' })).expect(201);

    const history = await http().get('/api/usage/instruments/SG-700001').expect(200);

    expect(history.body.items.map((each: { usedOn: string }) => each.usedOn)).toEqual([
      '2025-05-06',
      '2025-03-06',
      '2025-01-06',
    ]);
    expect(history.body.totalItems).toBe(3);
  });

  it('pages the instrument history', async () => {
    for (let day = 1; day <= 5; day++) {
      await http()
        .post('/api/usage')
        .send(use({ usedOn: `2025-05-0${day}` }))
        .expect(201);
    }

    const first = await http()
      .get('/api/usage/instruments/SG-700001')
      .query({ page: 0, size: 2 })
      .expect(200);

    expect(first.body.items).toHaveLength(2);
    expect(first.body.totalPages).toBe(3);
    expect(first.body.first).toBe(true);
    expect(first.body.last).toBe(false);
  });

  it('refuses a sort by a column nobody allowed', async () => {
    await http()
      .get('/api/usage/instruments/SG-700001')
      .query({ sort: 'instrument.assetTag' })
      .expect(400);
  });

  it('gathers everything logged against one work order across instruments', async () => {
    await register.multimeter('SG-700002');

    await http().post('/api/usage').send(use()).expect(201);
    await http()
      .post('/api/usage')
      .send(use({ assetTag: 'SG-700002', usedOn: '2025-05-07' }))
      .expect(201);
    await http().post('/api/usage').send(use({ workOrder: 'WO-9000' })).expect(201);

    const job = await http().get('/api/usage/work-orders/WO-4417').expect(200);

    expect(job.body).toHaveLength(2);
    expect(job.body.map((each: { assetTag: string }) => each.assetTag)).toEqual([
      'SG-700001',
      'SG-700002',
    ]);
  });

  it('finds every use inside a suspect window, both ends included', async () => {
    await http().post('/api/usage').send(use({ usedOn: '2025-03-31' })).expect(201);
    await http().post('/api/usage').send(use({ usedOn: '2025-04-01' })).expect(201);
    await http().post('/api/usage').send(use({ usedOn: '2025-05-06' })).expect(201);
    await http().post('/api/usage').send(use({ usedOn: '2025-05-07' })).expect(201);

    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-700001' });

    const caught = await usage.inWindow(instrument.id, '2025-04-01', '2025-05-06');

    expect(caught.map((each) => each.usedOn)).toEqual(['2025-04-01', '2025-05-06']);
  });

  it('counts the separate jobs a window catches, ignoring internal checks', async () => {
    await http().post('/api/usage').send(use({ workOrder: 'WO-1' })).expect(201);
    await http().post('/api/usage').send(use({ workOrder: 'WO-1' })).expect(201);
    await http().post('/api/usage').send(use({ workOrder: 'WO-2' })).expect(201);
    await http()
      .post('/api/usage')
      .send(use({ workOrder: undefined, customer: undefined }))
      .expect(201);

    const instrument = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag: 'SG-700001' });

    expect(await usage.distinctWorkOrders(instrument.id, '2025-01-01', '2025-06-10')).toBe(2);
  });
});
