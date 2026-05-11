import { AuditEvent } from '@registry/security/audit-event.entity';
import { Role } from '@registry/security/role';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';

describe('administering accounts', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ now: TODAY });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.dataSource.query("delete from app_user where username <> 'admin'");
    await harness.dataSource.query('delete from audit_event');
  });

  const admin = () => harness.api(harness.tokenFor(Role.ADMIN));

  function account(overrides: Record<string, unknown> = {}) {
    return {
      username: 'r.okonjo',
      displayName: 'R Okonjo',
      email: 'r.okonjo@slipgauge.internal',
      password: 'a-long-enough-password',
      roles: [Role.TECHNICIAN],
      ...overrides,
    };
  }

  it('lists the bootstrap administrator the migration shipped', async () => {
    const listed = await admin().get('/api/accounts').expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].username).toBe('admin');
    expect(listed.body[0].roles).toEqual([Role.ADMIN]);
  });

  it('never sends a password hash back out', async () => {
    const listed = await admin().get('/api/accounts').expect(200);

    expect(JSON.stringify(listed.body)).not.toContain('$2a$');
    expect(listed.body[0].passwordHash).toBeUndefined();
  });

  it('creates an account with the roles it was asked for', async () => {
    const created = await admin().post('/api/accounts').send(account()).expect(201);

    expect(created.body.username).toBe('r.okonjo');
    expect(created.body.roles).toEqual([Role.TECHNICIAN]);
    expect(created.body.enabled).toBe(true);
    expect(created.body.lastLoginAt).toBeNull();
  });

  it('refuses a second account on the same username or the same address', async () => {
    await admin().post('/api/accounts').send(account()).expect(201);

    await admin().post('/api/accounts').send(account({ email: 'other@x.internal' })).expect(409);
    await admin().post('/api/accounts').send(account({ username: 'other' })).expect(409);
  });

  it('refuses an account with no role at all', async () => {
    await admin().post('/api/accounts').send(account({ roles: [] })).expect(409);
  });

  it('refuses a password shorter than the policy allows', async () => {
    await admin().post('/api/accounts').send(account({ password: 'short' })).expect(400);
  });

  it('refuses an address that is not one', async () => {
    await admin().post('/api/accounts').send(account({ email: 'not-an-address' })).expect(400);
  });

  it('refuses a role nobody defined', async () => {
    await admin().post('/api/accounts').send(account({ roles: ['SUPERUSER'] })).expect(400);
  });

  it('replaces the roles on an account and says who did it', async () => {
    const created = await admin().post('/api/accounts').send(account()).expect(201);

    const updated = await admin()
      .post(`/api/accounts/${created.body.id}/roles`)
      .send({ roles: [Role.METROLOGIST, Role.QUALITY_MANAGER], reason: 'covering the shift' })
      .expect(201);

    expect(updated.body.roles).toEqual([Role.METROLOGIST, Role.QUALITY_MANAGER]);

    const trail = await harness.dataSource
      .getRepository(AuditEvent)
      .find({ where: { action: 'user.setRoles' } });

    expect(trail).toHaveLength(1);
    expect(trail[0]?.detail).toContain('covering the shift');
  });

  it('drops a duplicate role rather than storing it twice', async () => {
    const created = await admin().post('/api/accounts').send(account()).expect(201);

    const updated = await admin()
      .post(`/api/accounts/${created.body.id}/roles`)
      .send({ roles: [Role.TECHNICIAN, Role.TECHNICIAN] })
      .expect(201);

    expect(updated.body.roles).toEqual([Role.TECHNICIAN]);
  });

  it('refuses to leave an account with no role', async () => {
    const created = await admin().post('/api/accounts').send(account()).expect(201);

    await admin().post(`/api/accounts/${created.body.id}/roles`).send({ roles: [] }).expect(409);
  });

  it('disables and re-enables an account', async () => {
    const created = await admin().post('/api/accounts').send(account()).expect(201);

    const disabled = await admin()
      .post(`/api/accounts/${created.body.id}/enablement`)
      .query({ enabled: 'false' })
      .expect(201);

    expect(disabled.body.enabled).toBe(false);

    const enabled = await admin()
      .post(`/api/accounts/${created.body.id}/enablement`)
      .query({ enabled: 'true' })
      .expect(201);

    expect(enabled.body.enabled).toBe(true);
  });

  it('reports an unknown account rather than creating one', async () => {
    await admin().post('/api/accounts/999999/roles').send({ roles: [Role.ADMIN] }).expect(404);
  });

  it('keeps account administration away from everybody but an administrator', async () => {
    const manager = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));

    await manager.get('/api/accounts').expect(403);
    await manager.post('/api/accounts').send(account()).expect(403);
  });

  it('lets an auditor read the trail and refuses them the accounts', async () => {
    const auditor = harness.api(harness.tokenFor(Role.AUDITOR));

    await auditor.get('/api/audit').expect(200);
    await auditor.get('/api/accounts').expect(403);
  });

  it('pages and filters the audit trail', async () => {
    await admin().post('/api/accounts').send(account()).expect(201);
    await admin().post('/api/accounts').send(account({ username: 'd.ferreira', email: 'd@x.io' }))
      .expect(201);

    const all = await admin().get('/api/audit').expect(200);
    const mine = await admin().get('/api/audit').query({ actor: 'suite.runner' }).expect(200);
    const paged = await admin().get('/api/audit').query({ size: 1 }).expect(200);

    expect(all.body.totalItems).toBe(2);
    expect(mine.body.totalItems).toBe(2);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.totalPages).toBe(2);
  });

  it('refuses a sort by an audit column nobody allowed', async () => {
    await admin().get('/api/audit').query({ sort: 'detail' }).expect(400);
  });
});

/**
 * Trimming the trail. The rules are unit tested; what matters here is that the
 * sweep applies each of them to the rows they cover and nothing else.
 */
describe('trimming the audit trail', () => {
  let harness: TestApp;
  let admin: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2026-01-06T09:00:00Z' });
    admin = harness.api(harness.tokenFor(Role.ADMIN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /**
   * Counted back from the clock the app is pinned to, not from the database's
   * own now(). The two are years apart in a suite with a fixed clock, and a row
   * inserted against the wrong one is never old enough to sweep.
   */
  async function line(action: string, outcome: string, daysAgo: number): Promise<void> {
    const at = new Date(Date.parse('2026-01-06T09:00:00Z') - daysAgo * 86_400_000);

    await harness.dataSource.query(
      `insert into audit_event (occurred_at, actor, action, subject, subject_id, outcome, detail)
       values ($1, 'somebody', $2, 'user', null, $3, null)`,
      [at.toISOString(), action, outcome],
    );
  }

  async function held(): Promise<{ action: string; outcome: string }[]> {
    return harness.dataSource.query('select action, outcome from audit_event order by id');
  }

  it('drops a refused sign in older than a month', async () => {
    await line('auth.signIn', 'DENIED', 40);
    await line('auth.signIn', 'DENIED', 5);

    const swept = await admin.post('/api/accounts/audit/sweep').expect(201);

    expect(swept.body.total).toBeGreaterThanOrEqual(1);
    const left = await held();
    expect(left.filter((row) => row.action === 'auth.signIn')).toHaveLength(1);
  });

  it('keeps a successful sign in of the same age', async () => {
    await line('auth.signIn', 'ALLOWED', 40);
    await line('auth.signIn', 'DENIED', 40);

    await admin.post('/api/accounts/audit/sweep').expect(201);

    const left = await held();
    expect(left.filter((row) => row.action === 'auth.signIn')).toEqual([
      { action: 'auth.signIn', outcome: 'ALLOWED' },
    ]);
  });

  it('drops a refresh older than the session could have lived', async () => {
    await line('auth.refresh', 'ALLOWED', 120);
    await line('auth.refresh', 'ALLOWED', 30);

    await admin.post('/api/accounts/audit/sweep').expect(201);

    const left = await held();
    expect(left.filter((row) => row.action === 'auth.refresh')).toHaveLength(1);
  });

  it('keeps a withdrawal from five years ago', async () => {
    await line('certificate.withdraw', 'ALLOWED', 5 * 365);

    await admin.post('/api/accounts/audit/sweep').expect(201);

    const left = await held();
    expect(left.some((row) => row.action === 'certificate.withdraw')).toBe(true);
  });

  it('drops one from ten years ago', async () => {
    await line('certificate.withdraw', 'ALLOWED', 10 * 365);

    await admin.post('/api/accounts/audit/sweep').expect(201);

    const left = await held();
    expect(left.some((row) => row.action === 'certificate.withdraw')).toBe(false);
  });

  it('says which rule dropped what', async () => {
    await line('auth.signIn', 'DENIED', 40);

    const swept = await admin.post('/api/accounts/audit/sweep').expect(201);

    expect(swept.body.dropped[0].rule).toContain('noise after a month');
    expect(swept.body.dropped[0].rows).toBeGreaterThanOrEqual(1);
  });

  it('writes its own line, so a sweep is itself auditable', async () => {
    await line('auth.signIn', 'DENIED', 40);
    await admin.post('/api/accounts/audit/sweep').expect(201);

    const left = await held();
    expect(left.some((row) => row.action === 'audit.sweep')).toBe(true);
  });

  it('does nothing at all to a trail that is all inside its rules', async () => {
    await line('auth.signIn', 'DENIED', 5);
    await line('certificate.withdraw', 'ALLOWED', 100);

    const swept = await admin.post('/api/accounts/audit/sweep').expect(201);
    expect(swept.body.total).toBe(0);
    expect(swept.body.dropped).toHaveLength(0);
  });

  it('will not let the bench sweep the trail', async () => {
    await harness
      .api(harness.tokenFor(Role.TECHNICIAN))
      .post('/api/accounts/audit/sweep')
      .expect(403);
  });
});
