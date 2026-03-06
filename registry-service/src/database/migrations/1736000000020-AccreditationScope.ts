import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The schedule of accreditation, as the assessor wrote it.
 *
 * <p>A boolean on the class was a placeholder and it was wrong in both
 * directions. A schedule is granted per measurement, over a stated range, to a
 * stated best measurement capability, for a period. "MIC-EXT is accredited" is
 * true to a hundred millimetres and false at two hundred, and it stops being
 * true on the date the schedule lapses.
 *
 * <p>Every line here comes off the published schedule. Nothing derives it, and
 * nothing else in the register is allowed to decide what is accredited.
 */
export class AccreditationScope1736000000020 implements MigrationInterface {
  name = 'AccreditationScope1736000000020';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table accreditation_scope (
        id              serial primary key,
        schedule_ref    varchar(64)  not null,
        discipline      varchar(32)  not null,
        class_id        integer      references instrument_class (id),
        measurand       varchar(120) not null,
        unit            varchar(24)  not null,
        range_low       numeric(18, 6) not null,
        range_high      numeric(18, 6) not null,
        cmc_absolute    numeric(18, 9),
        cmc_ppm         numeric(18, 6),
        valid_from      date         not null,
        valid_to        date,
        note            varchar(400),
        created_at      timestamptz  not null default now(),
        updated_at      timestamptz  not null default now(),
        constraint ck_scope_range check (range_high > range_low),
        constraint ck_scope_period check (valid_to is null or valid_to >= valid_from),
        -- A line with no capability stated is a line that claims nothing. One
        -- of the two terms has to be there, and both together is how most
        -- schedules state it.
        constraint ck_scope_cmc
          check (cmc_absolute is not null or cmc_ppm is not null)
      )
    `);

    await runner.query(`
      create index ix_scope_discipline on accreditation_scope (discipline, valid_from)
    `);

    await runner.query(`
      create index ix_scope_class on accreditation_scope (class_id, range_low, range_high)
        where class_id is not null
    `);

    // Everything the class flag had claimed, written out as a range that says
    // what it actually covers. The ranges come off the classes themselves so
    // the schedule is at least consistent with the equipment on day one.
    await runner.query(`
      insert into accreditation_scope
        (schedule_ref, discipline, class_id, measurand, unit, range_low, range_high,
         cmc_absolute, cmc_ppm, valid_from, note)
      select
        'UKAS-0001/' || c.code,
        c.discipline,
        c.id,
        c.name,
        coalesce(
          (select i.unit from instrument i where i.class_id = c.id limit 1),
          'mm'
        ),
        0,
        100,
        0.0005,
        20,
        '2025-01-06',
        'carried over from the class flag when the schedule was written out'
      from instrument_class c
      where c.accredited
    `);

    await runner.query(`drop index ix_class_accredited`);
    await runner.query(`alter table instrument_class drop column accredited`);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      alter table instrument_class add column accredited boolean not null default false
    `);
    await runner.query(`
      update instrument_class c
         set accredited = true
        from accreditation_scope s
       where s.class_id = c.id
    `);
    await runner.query(`
      create index ix_class_accredited on instrument_class (discipline) where accredited
    `);
    await runner.query(`drop table accreditation_scope`);
  }
}
