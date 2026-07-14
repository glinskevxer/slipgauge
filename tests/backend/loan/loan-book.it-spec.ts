import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentStatus } from '@registry/instrument/instrument.enums';
import { Role } from '@registry/security/role';

import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-11-20T09:00:00Z';

describe('the loan book', () => {
  let harness: TestApp;
  let bench: ReturnType<TestApp['api']>;
  let auditor: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    bench = harness.api(harness.tokenFor(Role.TECHNICIAN));
    auditor = harness.api(harness.tokenFor(Role.AUDITOR));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    const register = new RegisterFixtures(harness.dataSource);
    await register.micrometer('SG-0001');
    await register.micrometer('SG-0002');
  });

  function issue(body: Record<string, unknown> = {}) {
    return bench.post('/api/loans').send({
      assetTag: 'SG-0001',
      borrower: 'J Fenwick',
      destination: 'Acme Pressings, Harlow',
      purpose: 'setting a press on site',
      issuedOn: '2025-11-18',
      dueBackOn: '2025-11-25',
      ...body,
    });
  }

  async function statusOf(assetTag: string): Promise<string> {
    const held = await harness.dataSource
      .getRepository(Instrument)
      .findOneByOrFail({ assetTag });

    return held.status;
  }

  it('books an instrument out and moves its status with it', async () => {
    const loan = await issue().expect(201);

    expect(loan.body).toMatchObject({
      assetTag: 'SG-0001',
      borrower: 'J Fenwick',
      out: true,
      overdue: false,
      lateness: -5,
      conditionOut: 'SERVICEABLE',
    });
    expect(loan.body.summary).toBe('J Fenwick, Acme Pressings, Harlow, due back 2025-11-25');
    expect(await statusOf('SG-0001')).toBe('ON_LOAN');
  });

  it('refuses to send the same instrument to two places', async () => {
    await issue().expect(201);

    const refused = await issue({ borrower: 'somebody else' }).expect(409);
    expect(refused.body.detail).toContain('already out with J Fenwick');
  });

  it('lets a second instrument go out at the same time', async () => {
    await issue().expect(201);
    await issue({ assetTag: 'SG-0002' }).expect(201);

    const out = await auditor.get('/api/loans').expect(200);
    expect(out.body).toHaveLength(2);
  });

  it('refuses a loan due back before it went out', async () => {
    await issue({ dueBackOn: '2025-11-01' }).expect(422);
  });

  it('refuses a loan issued in the future', async () => {
    await issue({ issuedOn: '2026-01-05', dueBackOn: '2026-01-12' }).expect(422);
  });

  it('refuses to lend something that is quarantined', async () => {
    await harness.dataSource
      .getRepository(Instrument)
      .update({ assetTag: 'SG-0001' }, { status: InstrumentStatus.QUARANTINED });

    await issue().expect(409);
  });

  it('books it back in and returns it to service', async () => {
    const loan = await issue().expect(201);

    const back = await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-24', conditionBack: 'SERVICEABLE' })
      .expect(201);

    expect(back.body).toMatchObject({
      out: false,
      returnedOn: '2025-11-24',
      receivedBy: 'suite.runner',
      lateness: -1,
      cameBackWorse: false,
    });
    expect(await statusOf('SG-0001')).toBe('IN_SERVICE');
  });

  it('quarantines one that came back worse, and raises a finding', async () => {
    const loan = await issue().expect(201);

    const back = await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({
        returnedOn: '2025-11-24',
        conditionBack: 'DAMAGED',
        note: 'the anvil is chipped',
      })
      .expect(201);

    expect(back.body.cameBackWorse).toBe(true);
    expect(await statusOf('SG-0001')).toBe('QUARANTINED');

    const raised = await bench.get('/api/nonconformities').expect(200);
    expect(raised.body).toHaveLength(1);
    expect(raised.body[0].title).toBe('SG-0001 came back damaged');
    expect(raised.body[0].detail).toContain('quarantined until somebody has looked at it');
  });

  it('does not call it worse when it went out damaged in the first place', async () => {
    const loan = await issue({ conditionOut: 'DAMAGED' }).expect(201);

    const back = await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-24', conditionBack: 'DAMAGED' })
      .expect(201);

    expect(back.body.cameBackWorse).toBe(false);
    expect(await statusOf('SG-0001')).toBe('IN_SERVICE');
  });

  it('will not take it back without saying what state it is in', async () => {
    const loan = await issue().expect(201);

    await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-24' })
      .expect(400);
  });

  it('will not book the same loan back twice', async () => {
    const loan = await issue().expect(201);
    const body = { returnedOn: '2025-11-24', conditionBack: 'SERVICEABLE' };

    await bench.post(`/api/loans/${loan.body.id}/return`).send(body).expect(201);
    await bench.post(`/api/loans/${loan.body.id}/return`).send(body).expect(422);
  });

  it('frees the instrument to go out again once it is back', async () => {
    const loan = await issue().expect(201);
    await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-24', conditionBack: 'SERVICEABLE' })
      .expect(201);

    await issue({ borrower: 'somebody else' }).expect(201);
  });

  it('hides what has come back unless asked for', async () => {
    const loan = await issue().expect(201);
    await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-24', conditionBack: 'SERVICEABLE' })
      .expect(201);

    expect((await auditor.get('/api/loans').expect(200)).body).toHaveLength(0);
    expect((await auditor.get('/api/loans?includeReturned=true').expect(200)).body).toHaveLength(1);
  });

  it('lists everything one instrument has been out on', async () => {
    const loan = await issue().expect(201);
    await bench
      .post(`/api/loans/${loan.body.id}/return`)
      .send({ returnedOn: '2025-11-19', conditionBack: 'SERVICEABLE' })
      .expect(201);
    await issue({ issuedOn: '2025-11-20', dueBackOn: '2025-11-27' }).expect(201);

    const history = await auditor.get('/api/loans/instruments/SG-0001').expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body[0].issuedOn).toBe('2025-11-20');
  });

  it('says so plainly when the instrument is not on the register', async () => {
    await issue({ assetTag: 'SG-9999' }).expect(404);
  });

  it('will not let an auditor lend anything', async () => {
    await auditor
      .post('/api/loans')
      .send({
        assetTag: 'SG-0001',
        borrower: 'J Fenwick',
        destination: 'anywhere',
        issuedOn: '2025-11-18',
        dueBackOn: '2025-11-25',
      })
      .expect(403);
  });
});
