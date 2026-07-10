import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The indexes the first year of real use asked for.
 *
 * <p>Every one of these comes from a query plan taken against a copy of the
 * live register rather than from reading the code and guessing. The register
 * holds about four thousand instruments and a hundred and twenty thousand
 * certificates, and at that size three of the screens had gone from a few
 * milliseconds to most of a second.
 *
 * <p>What is deliberately not here: an index per foreign key. PostgreSQL does
 * not need one to enforce a reference, most of them are never used to look
 * anything up, and every one of them is written on every insert.
 */
export class IndexReview1736000000024 implements MigrationInterface {
  name = 'IndexReview1736000000024';

  public async up(runner: QueryRunner): Promise<void> {
    // The register grid orders by asset tag and filters on status. The tag is
    // already unique, but the filter was scanning the whole table first and
    // sorting afterwards.
    await runner.query(`
      create index ix_instrument_status_tag on instrument (status, asset_tag)
    `);

    // The recall board reads everything falling due inside a horizon. Only the
    // rows with a due date can ever appear, and after five years most rows are
    // retired and carry none.
    await runner.query(`
      create index ix_instrument_due on instrument (next_due_on)
        where next_due_on is not null and status <> 'RETIRED'
    `);

    // A certificate history is read by instrument, newest first, on every
    // instrument screen. The plan was reading the whole certificate table and
    // sorting a hundred and twenty thousand rows to show eight.
    await runner.query(`
      create index ix_certificate_history
        on calibration_certificate (instrument_id, performed_on desc, id desc)
    `);

    // The traceability walk asks which certificates used one instrument as a
    // standard. It runs once per hop and a chain is four hops deep.
    await runner.query(`
      create index ix_certificate_standard_instrument
        on certificate_standard (standard_instrument_id)
        where standard_instrument_id is not null
    `);

    // The impact cascade asks what one instrument was used on inside a window.
    // It was already indexed by instrument; the date is what made it a range
    // scan rather than a filter over everything the instrument ever touched.
    await runner.query(`
      create index ix_usage_instrument_window on usage_record (instrument_id, used_on)
    `);

    // The audit viewer opens on the newest lines and pages backwards. Without
    // this it sorted the whole trail, which is the biggest table here.
    await runner.query(`
      create index ix_audit_recent on audit_event (occurred_at desc, id desc)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_audit_recent`);
    await runner.query(`drop index ix_usage_instrument_window`);
    await runner.query(`drop index ix_certificate_standard_instrument`);
    await runner.query(`drop index ix_certificate_history`);
    await runner.query(`drop index ix_instrument_due`);
    await runner.query(`drop index ix_instrument_status_tag`);
  }
}
