import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every profile was loaded without a class, which left the service with
 * nothing to fall back on when an instrument carries no profile of its own.
 * Attach the shipped profiles to the classes they were written for, and give
 * every remaining class a profile of its own derived from the one its
 * discipline works to.
 */
export class ProfileClassLinks1736000000004 implements MigrationInterface {
  name = 'ProfileClassLinks1736000000004';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      update tolerance_profile p set class_id = c.id
      from instrument_class c
      where (p.code, c.code) in (
        ('DIM-MIC-25',   'MIC-EXT'),
        ('DIM-CAL-150',  'CAL-VER'),
        ('DIM-GB-K',     'GB-SET'),
        ('ELEC-DMM-6H',  'DMM-BENCH'),
        ('ELEC-RES-STD', 'RES-STD'),
        ('MASS-ANA',     'BAL-ANA'),
        ('PRES-DIGI',    'PG-DIGI'),
        ('TEMP-PRT',     'PRT-STD'),
        ('TORQ-WRENCH',  'TW-CLICK'),
        ('TIME-FREQ',    'TIME-RUB')
      )
    `);

    // A profile belongs to exactly one class and the fallback lookup is by
    // class, so a class sharing a regime with one already mapped gets its own
    // row rather than a second link to the same profile.
    await runner.query(`
      insert into tolerance_profile
        (code, name, class_id, kind, absolute_term, reading_ppm, span_ppm, floor_term)
      select p.code || '-' || c.code, p.name || ' for ' || c.name, c.id, p.kind,
             p.absolute_term, p.reading_ppm, p.span_ppm, p.floor_term
      from tolerance_profile p
      join instrument_class c on c.id not in (
        select class_id from tolerance_profile where class_id is not null
      )
      where p.code = case c.discipline
          when 'DIMENSIONAL'  then 'DIM-CAL-150'
          when 'ELECTRICAL'   then 'ELEC-DMM-6H'
          when 'MASS'         then 'MASS-ANA'
          when 'PRESSURE'     then 'PRES-DIGI'
          when 'TEMPERATURE'  then 'TEMP-PRT'
          when 'FLOW'         then 'PRES-DIGI'
          when 'TORQUE'       then 'TORQ-WRENCH'
          when 'TIME'         then 'TIME-FREQ'
        end
    `);

    // One profile per class, enforced rather than assumed. The fallback lookup
    // reads a single row and a duplicate would make it non deterministic.
    await runner.query(`
      create unique index ux_tolerance_profile_class on tolerance_profile (class_id)
        where class_id is not null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ux_tolerance_profile_class`);
    await runner.query(`delete from tolerance_profile where code like '%-%-%'`);
    await runner.query(`update tolerance_profile set class_id = null`);
  }
}
