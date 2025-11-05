import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scans and reports that belong to a certificate.
 *
 * <p>The bytes are not here. The laboratory already has a document store that
 * is backed up and retained to the same schedule as the certificates
 * themselves, and a second copy inside PostgreSQL would be a second thing to
 * keep in step. What is here is the metadata and the checksum, which is what
 * lets the register prove the file it points at is the file that was filed.
 */
export class Attachments1736000000011 implements MigrationInterface {
  name = 'Attachments1736000000011';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table certificate_attachment (
        id              serial primary key,
        certificate_id  integer      not null
                          references calibration_certificate (id) on delete cascade,
        kind            varchar(24)  not null,
        filename        varchar(200) not null,
        media_type      varchar(120) not null,
        byte_size       bigint       not null,
        sha256          char(64)     not null,
        storage_key     varchar(400) not null,
        uploaded_by     varchar(120) not null,
        uploaded_at     timestamptz  not null default now(),
        note            varchar(400),
        constraint ck_attachment_kind
          check (kind in ('CERTIFICATE_SCAN', 'RAW_DATA', 'UNCERTAINTY_BUDGET',
                          'PHOTOGRAPH', 'CORRESPONDENCE')),
        constraint ck_attachment_size check (byte_size > 0),
        constraint ck_attachment_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
        constraint uq_attachment_storage_key unique (storage_key)
      )
    `);

    await runner.query(`
      create index ix_attachment_certificate on certificate_attachment (certificate_id, kind)
    `);

    // The same file filed twice against the same certificate is a mistake, and
    // the checksum is the only thing that can tell. Two different scans of the
    // same page are different files and both are allowed.
    await runner.query(`
      create unique index ux_attachment_content
        on certificate_attachment (certificate_id, sha256)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table certificate_attachment`);
  }
}
