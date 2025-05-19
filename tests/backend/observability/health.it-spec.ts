import request from 'supertest';

import { CORRELATION_HEADER } from '@registry/observability';
import { Role } from '@registry/security/role';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('what an operator can see without a token', () => {
  let harness: TestApp;
  let register: RegisterFixtures;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
    register = new RegisterFixtures(harness.dataSource);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  const raw = () => request(harness.app.getHttpServer());

  it('answers liveness with no token and no database question', async () => {
    const live = await raw().get('/health').expect(200);

    expect(live.body.status).toBe('up');
    expect(live.body.checks).toEqual({ process: 'up' });
    expect(live.body.checkedAt).toBe('2025-06-10T09:00:00.000Z');
  });

  it('answers readiness by actually asking the database', async () => {
    const ready = await raw().get('/health/readiness').expect(200);

    expect(ready.body.status).toBe('up');
    expect(ready.body.checks.database).toBe('up');
  });

  it('serves health outside the api prefix', async () => {
    await raw().get('/api/health').expect(404);
  });

  it('scrapes metrics in the text format a collector reads', async () => {
    const scraped = await raw().get('/metrics').expect(200);

    expect(scraped.headers['content-type']).toContain('text/plain');
    expect(scraped.text).toContain('# TYPE registry_certificates_total counter');
    expect(scraped.text).toContain('registry_overdue_instruments 0');
  });

  it('counts the overdue instruments at scrape time', async () => {
    const overdue = await register.micrometer('SG-900001');
    overdue.nextDueOn = '2025-01-01';
    overdue.intervalDays = 365;

    const fine = await register.multimeter('SG-900002');
    fine.nextDueOn = '2026-01-01';
    fine.intervalDays = 365;

    await harness.dataSource.getRepository(overdue.constructor as never).save([overdue, fine]);

    const scraped = await raw().get('/metrics').expect(200);

    expect(scraped.text).toContain('registry_overdue_instruments 1');
  });

  it('echoes a correlation id the caller supplied', async () => {
    const answered = await raw()
      .get('/health')
      .set(CORRELATION_HEADER, 'console-4417')
      .expect(200);

    expect(answered.headers[CORRELATION_HEADER]).toBe('console-4417');
  });

  it('mints a correlation id when the caller sent none', async () => {
    const answered = await raw().get('/health').expect(200);

    expect(answered.headers[CORRELATION_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('strips a correlation id that is trying to be something else', async () => {
    const answered = await raw()
      .get('/health')
      .set(CORRELATION_HEADER, 'ok<script>alert(1)</script>')
      .expect(200);

    expect(answered.headers[CORRELATION_HEADER]).toBe('okscriptalert1script');
  });

  it('puts a correlation id on an authenticated call as well', async () => {
    const answered = await harness
      .api(harness.tokenFor(Role.AUDITOR))
      .get('/api/instruments')
      .expect(200);

    expect(answered.headers[CORRELATION_HEADER]).toBeDefined();
  });

  it('still refuses the register itself without a token', async () => {
    await raw().get('/api/instruments').expect(401);
  });
});
