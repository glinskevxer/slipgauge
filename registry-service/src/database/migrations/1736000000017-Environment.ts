import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the rooms were doing while the work was done.
 *
 * <p>Clause 6.3 asks the laboratory to monitor the conditions its methods
 * depend on, and to stop work when they go outside what the method allows. A
 * dimensional room at twenty three degrees is not a nuisance, it is a
 * micrometre on a hundred millimetre gauge, and a certificate issued in one is
 * a certificate whose uncertainty budget was written for a different room.
 *
 * <p>Limits hang off the storage location, because that is what the register
 * already calls a room. Readings hang off the same, so a logger can be pointed
 * at a room and nothing else has to know it exists.
 */
export class Environment1736000000017 implements MigrationInterface {
  name = 'Environment1736000000017';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table environment_limit (
        id                serial primary key,
        location_id       integer      not null references storage_location (id),
        discipline        varchar(32),
        temperature_min   numeric(6, 2) not null,
        temperature_max   numeric(6, 2) not null,
        humidity_min      numeric(6, 2),
        humidity_max      numeric(6, 2),
        drift_per_hour    numeric(6, 3),
        soak_hours        integer      not null default 0,
        method_reference  varchar(120),
        created_at        timestamptz  not null default now(),
        updated_at        timestamptz  not null default now(),
        constraint ck_env_limit_temperature check (temperature_max > temperature_min),
        constraint ck_env_limit_humidity
          check ((humidity_min is null and humidity_max is null)
                 or (humidity_min is not null and humidity_max is not null
                     and humidity_max > humidity_min)),
        constraint ck_env_limit_soak check (soak_hours between 0 and 168)
      )
    `);

    // One limit per room per discipline. A room with two limits for the same
    // discipline has no limit at all, because nothing decides which one wins.
    await runner.query(`
      create unique index ux_env_limit_room
        on environment_limit (location_id, coalesce(discipline, 'ANY'))
    `);

    await runner.query(`
      create table environment_reading (
        id           serial primary key,
        location_id  integer      not null references storage_location (id),
        taken_at     timestamptz  not null,
        temperature  numeric(6, 2) not null,
        humidity     numeric(6, 2),
        logger_ref   varchar(64),
        source       varchar(16)  not null default 'LOGGER',
        constraint ck_env_reading_source check (source in ('LOGGER', 'MANUAL')),
        constraint ck_env_reading_humidity
          check (humidity is null or humidity between 0 and 100)
      )
    `);

    // Every question about a reading is "what was this room doing between these
    // two times", so the index is the room and the clock in that order.
    await runner.query(`
      create index ix_env_reading_room on environment_reading (location_id, taken_at desc)
    `);

    // A logger that resends is a logger that has been power cycled, and the
    // duplicate would otherwise widen an excursion that had already closed.
    await runner.query(`
      create unique index ux_env_reading_sample
        on environment_reading (location_id, taken_at, coalesce(logger_ref, ''))
    `);

    await runner.query(`
      create table environment_excursion (
        id            serial primary key,
        location_id   integer      not null references storage_location (id),
        started_at    timestamptz  not null,
        ended_at      timestamptz,
        kind          varchar(24)  not null,
        severity      varchar(16)  not null,
        worst_value   numeric(6, 2) not null,
        limit_value   numeric(6, 2) not null,
        readings      integer      not null,
        assessed_at   timestamptz,
        assessed_by   varchar(120),
        finding       varchar(400),
        created_at    timestamptz  not null default now(),
        updated_at    timestamptz  not null default now(),
        constraint ck_excursion_kind
          check (kind in ('TEMPERATURE_HIGH', 'TEMPERATURE_LOW', 'HUMIDITY_HIGH',
                          'HUMIDITY_LOW', 'DRIFT')),
        constraint ck_excursion_severity
          check (severity in ('MINOR', 'SIGNIFICANT', 'MAJOR')),
        constraint ck_excursion_window check (ended_at is null or ended_at >= started_at),
        constraint ck_excursion_assessed
          check ((assessed_at is null and assessed_by is null)
                 or (assessed_at is not null and assessed_by is not null))
      )
    `);

    await runner.query(`
      create index ix_excursion_room on environment_excursion (location_id, started_at desc)
    `);

    // The quality manager's list is everything nobody has looked at yet.
    await runner.query(`
      create index ix_excursion_unassessed on environment_excursion (started_at desc)
        where assessed_at is null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table environment_excursion`);
    await runner.query(`drop table environment_reading`);
    await runner.query(`drop table environment_limit`);
  }
}
