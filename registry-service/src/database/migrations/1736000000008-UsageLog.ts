import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What each instrument was actually used on.
 *
 * <p>This table only matters on a bad day. When an instrument is found out of
 * tolerance, everything it touched since it was last known good is suspect,
 * and the register has to be able to say what that was. It is deliberately
 * thin: the register is not the works order system, it holds just enough to
 * tell that system which jobs to look at.
 */
export class UsageLog1736000000008 implements MigrationInterface {
  name = 'UsageLog1736000000008';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table usage_record (
        id             serial primary key,
        instrument_id  integer      not null references instrument (id),
        used_on        date         not null,
        used_by        varchar(120) not null,
        work_order     varchar(64),
        customer       varchar(160),
        purpose        varchar(200),
        reading_count  integer      not null default 1,
        note           varchar(400),
        created_at     timestamptz  not null default now(),
        constraint ck_usage_record_readings check (reading_count > 0)
      )
    `);

    // The impact walk asks for one instrument over a date window, which is
    // exactly this index and nothing else.
    await runner.query(`
      create index ix_usage_record_instrument on usage_record (instrument_id, used_on)
    `);

    await runner.query(`
      create index ix_usage_record_work_order on usage_record (work_order)
        where work_order is not null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table usage_record`);
  }
}
