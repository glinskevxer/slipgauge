import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The record raised when an instrument is found out of tolerance.
 *
 * <p>An assessment owns a suspect window and everything the cascade caught
 * inside it. The items carry a soft reference into whichever table their kind
 * names rather than a foreign key, on purpose: a line has to stay readable
 * after the certificate it points at has been superseded.
 */
export class ImpactAssessments1736000000009 implements MigrationInterface {
  name = 'ImpactAssessments1736000000009';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table impact_assessment (
        id                serial primary key,
        trigger_cert_id   integer     not null references calibration_certificate (id),
        instrument_id     integer     not null references instrument (id),
        raised_at         timestamptz not null default now(),
        window_from       date        not null,
        window_to         date        not null,
        status            varchar(16) not null,
        severity          varchar(16) not null,
        max_depth         integer     not null default 0,
        item_count        integer     not null default 0,
        closed_at         timestamptz,
        closed_by         varchar(120),
        conclusion        varchar(2000),
        constraint uq_impact_assessment_trigger unique (trigger_cert_id),
        constraint ck_impact_assessment_window check (window_from <= window_to),
        constraint ck_impact_assessment_status
          check (status in ('OPEN', 'ASSESSED', 'CLOSED')),
        constraint ck_impact_assessment_severity
          check (severity in ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
        constraint ck_impact_assessment_closed
          check ((status = 'CLOSED') = (closed_at is not null))
      )
    `);

    await runner.query(`
      create index ix_impact_assessment_instrument on impact_assessment (instrument_id)
    `);

    await runner.query(`
      create index ix_impact_assessment_open on impact_assessment (status)
        where status <> 'CLOSED'
    `);

    await runner.query(`
      create table impact_item (
        id             serial primary key,
        assessment_id  integer     not null
                         references impact_assessment (id) on delete cascade,
        kind           varchar(16) not null,
        reference_id   integer     not null,
        asset_tag      varchar(32),
        label          varchar(200),
        occurred_on    date        not null,
        depth          integer     not null,
        disposition    varchar(24) not null default 'PENDING',
        note           varchar(400),
        constraint ck_impact_item_kind check (kind in ('USAGE', 'CERTIFICATE', 'INSTRUMENT')),
        constraint ck_impact_item_depth check (depth >= 0),
        constraint ck_impact_item_disposition
          check (disposition in ('PENDING', 'NO_EFFECT', 'CUSTOMER_NOTIFIED',
                                 'RECALLED', 'REWORKED', 'ACCEPTED'))
      )
    `);

    await runner.query(`
      create index ix_impact_item_assessment on impact_item (assessment_id, depth)
    `);

    // The cascade can reach the same certificate down two branches, and one
    // line per thing is what the assessor is counting.
    await runner.query(`
      create unique index ux_impact_item_unique on impact_item (assessment_id, kind, reference_id)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table impact_item`);
    await runner.query(`drop table impact_assessment`);
  }
}
