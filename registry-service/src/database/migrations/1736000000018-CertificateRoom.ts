import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Where the work was actually done.
 *
 * <p>The register knew where an instrument lives. It did not know which room it
 * was measured in, and those are different: a customer's micrometer lives in a
 * van and is measured in the dimensional room, and a reference standard that
 * lives in the dimensional room is sometimes taken next door.
 *
 * <p>Until the room log arrived nothing needed the difference. Now it does: an
 * excursion in a room puts the work done in that room in question, and the
 * instrument's home address is the wrong answer to which work that was.
 */
export class CertificateRoom1736000000018 implements MigrationInterface {
  name = 'CertificateRoom1736000000018';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      alter table calibration_certificate
        add column performed_in_location_id integer references storage_location (id)
    `);

    // The best guess for everything already filed is where the instrument
    // lives, which is right far more often than it is wrong and is the only
    // thing anybody could have meant when they filed it.
    await runner.query(`
      update calibration_certificate c
         set performed_in_location_id = i.location_id
        from instrument i
       where i.id = c.instrument_id
         and i.location_id is not null
    `);

    // The question is always "what was done in this room between these dates".
    await runner.query(`
      create index ix_certificate_room
        on calibration_certificate (performed_in_location_id, performed_on)
        where performed_in_location_id is not null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_certificate_room`);
    await runner.query(`
      alter table calibration_certificate drop column performed_in_location_id
    `);
  }
}
