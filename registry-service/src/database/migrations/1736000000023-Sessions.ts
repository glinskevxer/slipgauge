import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sessions, so a token can be taken away.
 *
 * <p>A signed token is valid until it expires and nothing can stop it. That is
 * fine for the access token, which lives minutes. It is not fine for the
 * refresh token, which lives days: somebody who leaves, or a laptop that goes
 * missing, has to be off the system before the weekend rather than when the
 * token happens to run out.
 *
 * <p>The row is the authority. A refresh token carries the session id and is
 * only honoured while the row says the session is live, which turns a stateless
 * token into a revocable one at the cost of one indexed read per refresh.
 */
export class Sessions1736000000023 implements MigrationInterface {
  name = 'Sessions1736000000023';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table user_session (
        id           char(32)     primary key,
        user_id      integer      not null references app_user (id) on delete cascade,
        username     varchar(64)  not null,
        started_at   timestamptz  not null default now(),
        last_used_at timestamptz  not null default now(),
        expires_at   timestamptz  not null,
        signed_in_from varchar(120),
        revoked_at   timestamptz,
        revoked_by   varchar(120),
        revoke_reason varchar(200),
        constraint ck_session_id check (id ~ '^[0-9a-f]{32}$'),
        constraint ck_session_revoked
          check ((revoked_at is null) = (revoked_by is null))
      )
    `);

    // Every refresh reads one session by id, and every revocation writes every
    // session for one person. Those are the only two access patterns.
    await runner.query(`
      create index ix_session_user on user_session (user_id, started_at desc)
    `);

    await runner.query(`
      create index ix_session_live on user_session (expires_at)
        where revoked_at is null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table user_session`);
  }
}
