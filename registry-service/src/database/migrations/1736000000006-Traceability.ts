import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What each calibration was measured against. An edge either points at another
 * instrument in this register or names an outside standard, never both, and
 * that is what makes the chain walkable in one direction and terminable in the
 * other.
 */
export class Traceability1736000000006 implements MigrationInterface {
  name = 'Traceability1736000000006';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table certificate_standard (
        id                     serial primary key,
        certificate_id         integer     not null
                                 references calibration_certificate (id) on delete cascade,
        standard_instrument_id integer     references instrument (id),
        external_ref           varchar(160),
        external_cert_number   varchar(48),
        external_lab           varchar(120),
        external_accreditation varchar(64),
        external_valid_from    date,
        external_valid_to      date,
        role                   varchar(24) not null,
        created_at             timestamptz not null default now(),
        constraint ck_certificate_standard_target
          check ((standard_instrument_id is not null and external_ref is null)
                 or (standard_instrument_id is null and external_ref is not null)),
        constraint ck_certificate_standard_role
          check (role in ('REFERENCE', 'CHECK', 'ENVIRONMENT')),
        constraint ck_certificate_standard_external_window
          check (external_valid_from is null or external_valid_to is null
                 or external_valid_from <= external_valid_to),
        constraint uq_certificate_standard_internal
          unique (certificate_id, standard_instrument_id)
      )
    `);

    await runner.query(`
      create index ix_certificate_standard_certificate on certificate_standard (certificate_id)
    `);

    // The register needs to answer "what did this standard touch" quickly,
    // because that question is asked in anger the moment a standard fails.
    await runner.query(`
      create index ix_certificate_standard_reverse
        on certificate_standard (standard_instrument_id, certificate_id)
        where standard_instrument_id is not null and role = 'REFERENCE'
    `);

    await runner.query(`alter table instrument add column traceable_to varchar(64)`);

    await runner.query(`
      comment on column instrument.traceable_to is
        'National metrology institute this instrument is ultimately traceable to, '
        'set only on the standards that terminate a chain.'
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`alter table instrument drop column traceable_to`);
    await runner.query(`drop table certificate_standard`);
  }
}
