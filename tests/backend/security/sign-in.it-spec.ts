import request from 'supertest';
import { hashSync } from 'bcryptjs';

import { AppUser, MAX_FAILED_ATTEMPTS } from '@registry/security/app-user.entity';
import { ATTEMPT_LIMIT, AttemptLimiter } from '@registry/security/attempt-limiter.service';
import { AuditEvent, AuditOutcome } from '@registry/security/audit-event.entity';
import { Role } from '@registry/security/role';
import { TestApp, createTestApp } from '../support/test-app';

const TODAY = '2025-06-10T09:00:00Z';
const PASSWORD = 'a-long-enough-password';

describe('signing in and what a token then lets you do', () => {
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
    harness.app.get(AttemptLimiter).reset();
  });

  const raw = () => request(harness.app.getHttpServer());

  async function account(username: string, ...roles: Role[]): Promise<AppUser> {
    const user = new AppUser();

    user.username = username;
    user.displayName = username;
    user.email = `${username}@slipgauge.internal`;
    user.passwordHash = hashSync(PASSWORD, 4);
    user.enabled = true;
    user.lockedUntil = null;
    user.failedAttempts = 0;
    user.passwordSetAt = new Date(TODAY);
    user.lastLoginAt = null;

    const saved = await harness.dataSource.getRepository(AppUser).save(user);

    for (const role of roles) {
      await harness.dataSource.query(
        'insert into app_user_role (user_id, role) values ($1, $2)',
        [saved.id, role],
      );
    }
    return saved;
  }

  function signIn(username: string, password = PASSWORD): request.Test {
    return raw().post('/api/auth/sign-in').send({ username, password });
  }

  it('hands back a pair of tokens for a good password', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    const signedIn = await signIn('r.okonjo').expect(200);

    expect(signedIn.body.tokenType).toBe('Bearer');
    expect(signedIn.body.accessToken).toEqual(expect.any(String));
    expect(signedIn.body.refreshToken).toEqual(expect.any(String));
    expect(signedIn.body.expiresInSeconds).toBeGreaterThan(0);
  });

  it('says exactly the same thing whether the account exists or not', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    const wrongPassword = await signIn('r.okonjo', 'not-the-password').expect(401);
    const noSuchUser = await signIn('nobody.here').expect(401);

    expect(wrongPassword.body.detail).toBe(noSuchUser.body.detail);
    expect(wrongPassword.body.code).toBe('registry/unauthenticated');
  });

  it('refuses a caller going too fast before it even hashes a password', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    for (let attempt = 0; attempt < ATTEMPT_LIMIT; attempt++) {
      await signIn('r.okonjo', 'wrong').expect(401);
    }

    const limited = await signIn('r.okonjo', 'wrong').expect(429);

    expect(limited.body.detail).toContain('too many sign in attempts');
    expect(limited.body.context.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('clears the count on a good password so a fat finger costs nothing', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    await signIn('r.okonjo', 'wrong').expect(401);
    await signIn('r.okonjo').expect(200);

    for (let attempt = 0; attempt < ATTEMPT_LIMIT - 1; attempt++) {
      await signIn('r.okonjo').expect(200);
    }
  });

  it('locks the account after the run of wrong passwords the policy allows', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
      await signIn('r.okonjo', 'wrong').expect(401);
    }

    // The password is right this time and it still will not open.
    await signIn('r.okonjo').expect(401);
  });

  it('refuses a disabled account', async () => {
    const user = await account('r.okonjo', Role.TECHNICIAN);

    user.enabled = false;
    await harness.dataSource.getRepository(AppUser).save(user);

    await signIn('r.okonjo').expect(401);
  });

  it('writes both the good and the bad attempt to the audit trail', async () => {
    await account('r.okonjo', Role.TECHNICIAN);

    await signIn('r.okonjo', 'wrong').expect(401);
    await signIn('r.okonjo').expect(200);

    const events = await harness.dataSource
      .getRepository(AuditEvent)
      .find({ order: { id: 'ASC' } });

    expect(events.map((event) => event.outcome)).toEqual([
      AuditOutcome.DENIED,
      AuditOutcome.ALLOWED,
    ]);
    expect(events[0]?.action).toBe('auth.signIn');
    expect(events[0]?.detail).toContain('attempt 1');
  });

  it('refuses every route with no token at all', async () => {
    await raw().get('/api/instruments').expect(401);
    await raw().get('/api/recalls').expect(401);
    await raw().get('/api/impact').expect(401);
  });

  it('refuses a token that has been tampered with', async () => {
    const token = harness.tokenFor(Role.ADMIN);

    await raw()
      .get('/api/instruments')
      .set('Authorization', `Bearer ${token.slice(0, -2)}xx`)
      .expect(401);
  });

  it('refuses a refresh token used where an access token belongs', async () => {
    await account('r.okonjo', Role.TECHNICIAN);
    const signedIn = await signIn('r.okonjo').expect(200);

    await raw()
      .get('/api/instruments')
      .set('Authorization', `Bearer ${signedIn.body.refreshToken}`)
      .expect(401);
  });

  it('trades a refresh token for a fresh pair', async () => {
    await account('r.okonjo', Role.TECHNICIAN);
    const signedIn = await signIn('r.okonjo').expect(200);

    const refreshed = await raw()
      .post('/api/auth/refresh')
      .send({ refreshToken: signedIn.body.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toEqual(expect.any(String));
  });

  it('lets an auditor read the register and refuses them a write', async () => {
    const auditor = harness.api(harness.tokenFor(Role.AUDITOR));

    await auditor.get('/api/instruments').expect(200);
    await auditor.post('/api/usage').send({}).expect(403);
  });

  it('lets a technician log a use but not approve a certificate', async () => {
    const technician = harness.api(harness.tokenFor(Role.TECHNICIAN));

    await technician.get('/api/recalls').expect(200);
    await technician.post('/api/certificates/1/approval').query({ approver: 'x' }).expect(403);
  });

  it('lets a metrologist approve but not close an impact assessment', async () => {
    const metrologist = harness.api(harness.tokenFor(Role.METROLOGIST));

    await metrologist.post('/api/certificates/1/approval').query({ approver: 'x' }).expect(404);
    await metrologist.post('/api/impact/1/closure').send({}).expect(403);
  });

  it('lets a quality manager close an assessment and withdraw a certificate', async () => {
    const manager = harness.api(harness.tokenFor(Role.QUALITY_MANAGER));

    await manager.post('/api/impact/1/closure').send({ closedBy: 'q', conclusion: 'c' }).expect(404);
    await manager
      .post('/api/certificates/1/withdrawal')
      .query({ reason: 'because' })
      .expect(404);
  });

  it('gives an administrator everything the other roles have', async () => {
    const admin = harness.api(harness.tokenFor(Role.ADMIN));

    await admin.get('/api/instruments').expect(200);
    await admin.post('/api/impact/1/closure').send({ closedBy: 'q', conclusion: 'c' }).expect(404);
  });

  it('says which roles a route wanted when it refuses', async () => {
    const auditor = harness.api(harness.tokenFor(Role.AUDITOR));
    const refused = await auditor
      .post('/api/certificates/1/withdrawal')
      .query({ reason: 'because' })
      .expect(403);

    expect(refused.body.detail).toContain('QUALITY_MANAGER');
    expect(refused.body.detail).toContain('AUDITOR');
  });

  it('changes a password and refuses the old one afterwards', async () => {
    await account('r.okonjo', Role.TECHNICIAN);
    const signedIn = await signIn('r.okonjo').expect(200);

    await raw()
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Trawlerbank ledger 7' })
      .expect(204);

    await signIn('r.okonjo').expect(401);
    await signIn('r.okonjo', 'Trawlerbank ledger 7').expect(200);
  });

  it('refuses a new password that is too short to be worth having', async () => {
    await account('r.okonjo', Role.TECHNICIAN);
    const signedIn = await signIn('r.okonjo').expect(200);

    await raw()
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'short' })
      .expect(400);
  });

  it('reports who is signed in', async () => {
    await account('r.okonjo', Role.METROLOGIST);
    const signedIn = await signIn('r.okonjo').expect(200);

    const me = await raw()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .expect(200);

    expect(me.body.username).toBe('r.okonjo');
    expect(me.body.roles).toEqual([Role.METROLOGIST]);
    expect(me.body.locked).toBe(false);
  });
});

/**
 * The password policy, at the edge rather than in the unit test. What matters
 * here is that a refusal comes back as something a console can show and that
 * the sign in reply says when a password is running out.
 */
describe('the password policy at the edge', () => {
  let harness: TestApp;
  const PASSWORD = 'harbour ledger 7';

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();

    // Only the account this suite makes. The bootstrap administrator is
    // reference data the migration ships, and the accounts suite reads it.
    await harness.dataSource.query(
      `delete from app_user_role where user_id in
         (select id from app_user where username = 'r.okonjo')`,
    );
    await harness.dataSource.query(`delete from app_user where username = 'r.okonjo'`);
  });

  async function account(setAt = '2025-06-01T09:00:00Z') {
    const admin = harness.api(harness.tokenFor(Role.ADMIN));

    await admin
      .post('/api/accounts')
      .send({
        username: 'r.okonjo',
        displayName: 'Rachel Okonjo',
        email: 'r.okonjo@slipgauge.internal',
        password: PASSWORD,
        roles: ['TECHNICIAN'],
      })
      .expect(201);

    await harness.dataSource.query('update app_user set password_set_at = $1 where username = $2', [
      setAt,
      'r.okonjo',
    ]);
  }

  function signIn(password = PASSWORD) {
    return request(harness.app.getHttpServer())
      .post('/api/auth/sign-in')
      .send({ username: 'r.okonjo', password });
  }

  it('says nothing about the password when it has months left', async () => {
    await account();

    const signedIn = await signIn().expect(200);
    expect(signedIn.body.mustChangePassword).toBe(false);
    expect(signedIn.body.passwordNotice).toBeNull();
  });

  it('warns when it is nearly up', async () => {
    await account('2024-12-05T09:00:00Z');

    const signedIn = await signIn().expect(200);
    expect(signedIn.body.mustChangePassword).toBe(false);
    expect(signedIn.body.passwordNotice).toContain('expires in');
  });

  it('still issues a token when it has expired, so it can be changed', async () => {
    await account('2024-01-06T09:00:00Z');

    const signedIn = await signIn().expect(200);
    expect(signedIn.body.mustChangePassword).toBe(true);
    expect(signedIn.body.accessToken).toBeTruthy();
    expect(signedIn.body.passwordNotice).toContain('has expired');
  });

  it('refuses a new password the policy will not have, and says which rules', async () => {
    await account();
    const signedIn = await signIn().expect(200);

    const refused = await request(harness.app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'r.okonjo2025' })
      .expect(422);

    expect(refused.body.detail).toContain('cannot contain the username');
    expect(refused.body.context.rules).toContain('username');
  });

  it('refuses a change back to the same password', async () => {
    await account();
    const signedIn = await signIn().expect(200);

    const refused = await request(harness.app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
      .expect(422);

    expect(refused.body.detail).toContain('different from the old one');
  });

  it('clears the expiry once the password is changed', async () => {
    await account('2024-01-06T09:00:00Z');
    const signedIn = await signIn().expect(200);
    expect(signedIn.body.mustChangePassword).toBe(true);

    await request(harness.app.getHttpServer())
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Trawlerbank ledger 7' })
      .expect(204);

    const again = await signIn('Trawlerbank ledger 7').expect(200);
    expect(again.body.mustChangePassword).toBe(false);
  });
});
