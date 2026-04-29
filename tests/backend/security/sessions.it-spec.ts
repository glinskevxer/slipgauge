import request from 'supertest';

import { Role } from '@registry/security/role';

import { TestApp, createTestApp } from '../support/test-app';

const PASSWORD = 'harbour ledger 7';

/**
 * A signed token is valid until it expires and nothing can stop it. These are
 * the tests for the row that can.
 */
describe('sessions and taking a token away', () => {
  let harness: TestApp;
  let admin: ReturnType<TestApp['api']>;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
    admin = harness.api(harness.tokenFor(Role.ADMIN));
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await harness.dataSource.query(
      `delete from app_user_role where user_id in
         (select id from app_user where username = 'r.okonjo')`,
    );
    await harness.dataSource.query(`delete from app_user where username = 'r.okonjo'`);

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
  });

  function http() {
    return request(harness.app.getHttpServer());
  }

  async function signIn(password = PASSWORD) {
    const response = await http()
      .post('/api/auth/sign-in')
      .send({ username: 'r.okonjo', password })
      .expect(200);

    return response.body as { accessToken: string; refreshToken: string };
  }

  it('opens a session on every sign in and lists it', async () => {
    await signIn();

    const listed = await admin.get('/api/accounts/r.okonjo/sessions').expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0]).toMatchObject({ username: 'r.okonjo', standing: 'live' });
    expect(listed.body[0].id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('trades a refresh token for a fresh pair', async () => {
    const pair = await signIn();

    const refreshed = await http()
      .post('/api/auth/refresh')
      .send({ refreshToken: pair.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();
  });

  it('refuses the refresh once an administrator ends the session', async () => {
    const pair = await signIn();

    const ended = await admin
      .post('/api/accounts/r.okonjo/session-revocation?reason=laptop lost on a train')
      .expect(201);
    expect(ended.body).toEqual({ revoked: 1 });

    await http().post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(401);
  });

  it('says who ended it and why', async () => {
    await signIn();
    await admin
      .post('/api/accounts/r.okonjo/session-revocation?reason=laptop lost on a train')
      .expect(201);

    const listed = await admin.get('/api/accounts/r.okonjo/sessions').expect(200);
    expect(listed.body[0]).toMatchObject({
      standing: 'revoked',
      revokedBy: 'suite.runner',
      revokeReason: 'laptop lost on a train',
    });
  });

  it('ends only the sessions that are still live', async () => {
    await signIn();
    await signIn();

    await admin.post('/api/accounts/r.okonjo/session-revocation?reason=first').expect(201);
    const again = await admin
      .post('/api/accounts/r.okonjo/session-revocation?reason=second')
      .expect(201);

    expect(again.body).toEqual({ revoked: 0 });
  });

  it('ends this session on sign out and leaves the other one alone', async () => {
    const first = await signIn();
    const second = await signIn();

    await http()
      .post('/api/auth/sign-out')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ refreshToken: first.refreshToken })
      .expect(204);

    await http().post('/api/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await http().post('/api/auth/refresh').send({ refreshToken: second.refreshToken }).expect(200);
  });

  it('takes a sign out of something already gone without complaining', async () => {
    const pair = await signIn();

    await http()
      .post('/api/auth/sign-out')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ refreshToken: pair.refreshToken })
      .expect(204);
    await http()
      .post('/api/auth/sign-out')
      .set('Authorization', `Bearer ${pair.accessToken}`)
      .send({ refreshToken: pair.refreshToken })
      .expect(204);
  });

  it('ends every session when the password is changed', async () => {
    const first = await signIn();
    const second = await signIn();

    await http()
      .post('/api/auth/password')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'Trawlerbank ledger 7' })
      .expect(204);

    await http().post('/api/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await http().post('/api/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);
  });

  it('ends every session when the account is disabled', async () => {
    const pair = await signIn();
    const account = await admin.get('/api/accounts').expect(200);
    const id = account.body.find((row: { username: string }) => row.username === 'r.okonjo').id;

    await admin.post(`/api/accounts/${id}/enablement?enabled=false`).expect(201);

    await http().post('/api/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(401);
  });

  it('refuses a refresh token that is not one of ours at all', async () => {
    await http().post('/api/auth/refresh').send({ refreshToken: 'not.a.token' }).expect(401);
  });

  it('refuses an access token used where a refresh token belongs', async () => {
    const pair = await signIn();

    await http().post('/api/auth/refresh').send({ refreshToken: pair.accessToken }).expect(401);
  });

  it('will not let the bench read somebody else sessions', async () => {
    await signIn();

    await harness
      .api(harness.tokenFor(Role.TECHNICIAN))
      .get('/api/accounts/r.okonjo/sessions')
      .expect(403);
  });
});
