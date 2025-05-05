import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who may do what.
 *
 * <p>The laboratory is audited on separation of duties, so the roles are not a
 * convenience: a technician recording a result must not be able to approve it,
 * and only a quality manager may close an assessment.
 */
export class Accounts1736000000010 implements MigrationInterface {
  name = 'Accounts1736000000010';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table app_user (
        id                serial primary key,
        username          varchar(64)  not null,
        display_name      varchar(120) not null,
        email             varchar(160) not null,
        password_hash     varchar(120) not null,
        enabled           boolean      not null default true,
        locked_until      timestamptz,
        failed_attempts   integer      not null default 0,
        password_set_at   timestamptz  not null default now(),
        last_login_at     timestamptz,
        created_at        timestamptz  not null default now(),
        updated_at        timestamptz  not null default now(),
        constraint uq_app_user_username unique (username),
        constraint uq_app_user_email unique (email),
        constraint ck_app_user_attempts check (failed_attempts >= 0)
      )
    `);

    await runner.query(`
      create table app_user_role (
        user_id  integer     not null references app_user (id) on delete cascade,
        role     varchar(32) not null,
        primary key (user_id, role),
        constraint ck_app_user_role
          check (role in ('TECHNICIAN', 'METROLOGIST', 'QUALITY_MANAGER', 'AUDITOR', 'ADMIN'))
      )
    `);

    await runner.query(`create index ix_app_user_role_role on app_user_role (role)`);

    await runner.query(`
      create table audit_event (
        id          serial primary key,
        occurred_at timestamptz  not null default now(),
        actor       varchar(64)  not null,
        action      varchar(64)  not null,
        subject     varchar(64)  not null,
        subject_id  varchar(64),
        outcome     varchar(16)  not null,
        detail      varchar(1000),
        correlation varchar(64),
        constraint ck_audit_event_outcome check (outcome in ('ALLOWED', 'DENIED', 'FAILED'))
      )
    `);

    await runner.query(`create index ix_audit_event_occurred on audit_event (occurred_at desc)`);
    await runner.query(`create index ix_audit_event_actor on audit_event (actor, occurred_at desc)`);
    await runner.query(`create index ix_audit_event_subject on audit_event (subject, subject_id)`);

    // The bootstrap account. The hash is for a password the runbook says to
    // change on first login, and the account is useless until somebody does:
    // password_set_at is in the past, so the change is forced.
    await runner.query(`
      insert into app_user (username, display_name, email, password_hash)
      values ('admin', 'Registry administrator', 'admin@slipgauge.internal',
              '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
    `);

    await runner.query(`
      insert into app_user_role (user_id, role)
      select id, 'ADMIN' from app_user where username = 'admin'
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table audit_event`);
    await runner.query(`drop table app_user_role`);
    await runner.query(`drop table app_user`);
  }
}
