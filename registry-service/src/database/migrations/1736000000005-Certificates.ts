import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Calibration results. A certificate is the immutable record of one visit to
 * the bench; the points are what was actually measured.
 *
 * <p>Nothing here is ever updated in place once approved, which is why
 * withdrawal is a column rather than a delete. An accreditation audit has to
 * be able to see the mistake and the correction, in that order.
 */
export class Certificates1736000000005 implements MigrationInterface {
  name = 'Certificates1736000000005';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table calibration_certificate (
        id                  serial primary key,
        certificate_number  varchar(48)  not null,
        instrument_id       integer      not null references instrument (id),
        performed_on        date         not null,
        issued_on           date         not null,
        performed_by        varchar(120) not null,
        approved_by         varchar(120),
        issuing_lab         varchar(120) not null,
        external_lab        boolean      not null default false,
        ambient_temp_c      numeric(6, 2),
        ambient_humidity    numeric(6, 2),
        as_found_verdict    varchar(24)  not null,
        as_left_verdict     varchar(24)  not null,
        adjusted            boolean      not null default false,
        remarks             varchar(2000),
        withdrawn_at        timestamptz,
        withdrawn_reason    varchar(400),
        superseded_by_id    integer      references calibration_certificate (id),
        created_at          timestamptz  not null default now(),
        updated_at          timestamptz  not null default now(),
        row_version         integer      not null default 1,
        constraint uq_certificate_number unique (issuing_lab, certificate_number),
        constraint ck_certificate_dates check (issued_on >= performed_on),
        constraint ck_certificate_as_found
          check (as_found_verdict in ('PASS', 'MARGINAL', 'OUT_OF_TOLERANCE',
                                      'INDETERMINATE', 'NOT_ASSESSED')),
        constraint ck_certificate_as_left
          check (as_left_verdict in ('PASS', 'MARGINAL', 'OUT_OF_TOLERANCE',
                                     'INDETERMINATE', 'NOT_ASSESSED')),
        constraint ck_certificate_withdrawal
          check ((withdrawn_at is null) = (withdrawn_reason is null)),
        constraint ck_certificate_not_self_superseding
          check (superseded_by_id is null or superseded_by_id <> id)
      )
    `);

    await runner.query(`
      create index ix_certificate_instrument on calibration_certificate (instrument_id)
    `);
    await runner.query(`
      create index ix_certificate_performed on calibration_certificate (performed_on desc)
    `);

    // The lookup every read path makes is "the newest certificate still
    // speaking for this instrument", so the partial index carries that
    // predicate rather than making the planner filter afterwards.
    await runner.query(`
      create index ix_certificate_live
        on calibration_certificate (instrument_id, performed_on desc)
        where withdrawn_at is null
    `);

    await runner.query(`
      create table measurement_point (
        id                    serial primary key,
        certificate_id        integer     not null
                                references calibration_certificate (id) on delete cascade,
        sequence_no           integer     not null,
        label                 varchar(120),
        nominal               numeric(18, 9) not null,
        unit                  varchar(24) not null,
        as_found              numeric(18, 9),
        as_left               numeric(18, 9),
        tolerance_low         numeric(18, 9) not null,
        tolerance_high        numeric(18, 9) not null,
        expanded_uncertainty  numeric(18, 9) not null,
        coverage_factor       numeric(6, 3)  not null default 2,
        as_found_verdict      varchar(24) not null,
        as_left_verdict       varchar(24) not null,
        constraint uq_measurement_point_sequence unique (certificate_id, sequence_no),
        constraint ck_measurement_point_tolerance check (tolerance_low <= tolerance_high),
        constraint ck_measurement_point_uncertainty check (expanded_uncertainty >= 0),
        constraint ck_measurement_point_coverage check (coverage_factor > 0),
        constraint ck_measurement_point_sequence_positive check (sequence_no > 0)
      )
    `);

    await runner.query(`
      create index ix_measurement_point_certificate on measurement_point (certificate_id)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table measurement_point`);
    await runner.query(`drop table calibration_certificate`);
  }
}
