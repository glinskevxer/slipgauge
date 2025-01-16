import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The register of physical measuring equipment the laboratory is accountable
 * for. Everything downstream, certificates, intervals, recalls and impact,
 * hangs off instrument.id, so this table is deliberately conservative.
 *
 * <p>Migrations are forward only and never edited once released. The check
 * constraints are written here as well as in the code, because the register
 * outlives any one version of the service.
 *
 * <p>Keys are serial rather than bigserial. A laboratory that calibrated one
 * instrument a second for seventy years would still not reach the ceiling, and
 * a bigint primary key arrives in JavaScript as a string, which is a class of
 * bug worth not having at all.
 */
export class InstrumentRegister1736000000001 implements MigrationInterface {
  name = 'InstrumentRegister1736000000001';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table instrument_class (
        id                  serial primary key,
        code                varchar(24)  not null,
        name                varchar(120) not null,
        discipline          varchar(32)  not null,
        base_interval_days  integer      not null,
        min_interval_days   integer      not null,
        max_interval_days   integer      not null,
        criticality         varchar(16)  not null,
        created_at          timestamptz  not null default now(),
        updated_at          timestamptz  not null default now(),
        constraint uq_instrument_class_code unique (code),
        constraint ck_instrument_class_interval_order
          check (min_interval_days <= base_interval_days
                 and base_interval_days <= max_interval_days),
        constraint ck_instrument_class_interval_positive check (min_interval_days > 0),
        constraint ck_instrument_class_criticality
          check (criticality in ('ROUTINE', 'IMPORTANT', 'CRITICAL')),
        constraint ck_instrument_class_discipline
          check (discipline in ('DIMENSIONAL', 'ELECTRICAL', 'MASS', 'PRESSURE',
                                'TEMPERATURE', 'FLOW', 'TORQUE', 'TIME'))
      )
    `);

    await runner.query(`
      create table storage_location (
        id          serial primary key,
        code        varchar(24)  not null,
        name        varchar(120) not null,
        site        varchar(64)  not null,
        parent_id   integer      references storage_location (id),
        created_at  timestamptz  not null default now(),
        updated_at  timestamptz  not null default now(),
        constraint uq_storage_location_code unique (code)
      )
    `);

    await runner.query(`create index ix_storage_location_parent on storage_location (parent_id)`);

    await runner.query(`
      create table instrument (
        id             serial primary key,
        asset_tag      varchar(32)  not null,
        class_id       integer      not null references instrument_class (id),
        manufacturer   varchar(120) not null,
        model          varchar(120) not null,
        serial_number  varchar(80)  not null,
        description    varchar(400),
        unit           varchar(24)  not null,
        range_low      numeric(18, 6) not null,
        range_high     numeric(18, 6) not null,
        resolution     numeric(18, 9) not null,
        location_id    integer      references storage_location (id),
        custodian      varchar(120),
        status         varchar(24)  not null,
        is_reference   boolean      not null default false,
        acquired_on    date         not null,
        retired_on     date,
        created_at     timestamptz  not null default now(),
        updated_at     timestamptz  not null default now(),
        row_version    integer      not null default 1,
        constraint uq_instrument_asset_tag unique (asset_tag),
        constraint uq_instrument_serial unique (manufacturer, model, serial_number),
        constraint ck_instrument_range check (range_low < range_high),
        constraint ck_instrument_resolution check (resolution > 0),
        constraint ck_instrument_status
          check (status in ('IN_SERVICE', 'IN_CALIBRATION', 'QUARANTINED',
                            'UNDER_REPAIR', 'ON_LOAN', 'RETIRED')),
        constraint ck_instrument_retired
          check (retired_on is null or retired_on >= acquired_on)
      )
    `);

    await runner.query(`create index ix_instrument_class on instrument (class_id)`);
    await runner.query(`create index ix_instrument_location on instrument (location_id)`);
    await runner.query(`create index ix_instrument_status on instrument (status)`);
    await runner.query(
      `create index ix_instrument_reference on instrument (is_reference) where is_reference`,
    );
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table instrument`);
    await runner.query(`drop table storage_location`);
    await runner.query(`drop table instrument_class`);
  }
}
