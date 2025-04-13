import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Calibration intervals are not fixed. Every time the history changes the
 * engine works the interval out again, and the answer is written here rather
 * than overwritten on the instrument, because an assessor will ask why an
 * interval was what it was on a date two years ago.
 */
export class IntervalDecisions1736000000007 implements MigrationInterface {
  name = 'IntervalDecisions1736000000007';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table interval_decision (
        id                      serial primary key,
        instrument_id           integer     not null references instrument (id),
        decided_at              timestamptz not null default now(),
        effective_from          date        not null,
        interval_days           integer     not null,
        previous_interval_days  integer,
        basis                   varchar(24) not null,
        consecutive_passes      integer     not null default 0,
        drift_ratio             numeric(10, 6),
        triggered_by_id         integer     references calibration_certificate (id),
        rationale               varchar(400) not null,
        superseded              boolean     not null default false,
        constraint ck_interval_decision_days check (interval_days > 0),
        constraint ck_interval_decision_basis
          check (basis in ('BASE', 'EXTENDED', 'HELD', 'SHORTENED', 'FLOORED',
                           'CAPPED', 'MANUAL', 'RESET'))
      )
    `);

    await runner.query(`
      create index ix_interval_decision_instrument
        on interval_decision (instrument_id, effective_from desc)
    `);

    // Exactly one live decision per instrument, enforced rather than assumed.
    // Everything downstream reads "the current interval" as a single row.
    await runner.query(`
      create unique index ux_interval_decision_current
        on interval_decision (instrument_id) where not superseded
    `);

    await runner.query(`
      alter table instrument
        add column interval_days integer,
        add column next_due_on date,
        add column last_calibrated_on date
    `);

    await runner.query(`
      create index ix_instrument_next_due on instrument (next_due_on)
        where next_due_on is not null and status <> 'RETIRED'
    `);

    await runner.query(`
      comment on column instrument.next_due_on is
        'Denormalised from the current interval decision so the recall list is one '
        'index scan rather than a per instrument recomputation.'
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_instrument_next_due`);
    await runner.query(`
      alter table instrument
        drop column interval_days,
        drop column next_due_on,
        drop column last_calibrated_on
    `);
    await runner.query(`drop table interval_decision`);
  }
}
