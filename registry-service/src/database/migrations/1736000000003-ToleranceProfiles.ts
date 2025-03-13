import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The maximum permissible error each class of instrument is held to.
 *
 * <p>Profiles are written the way manufacturers write them, as a sum of a
 * fixed term, a term proportional to the reading and a term proportional to
 * the span, with a floor underneath. Storing the terms rather than a computed
 * limit means a certificate issued at any nominal can be re-derived, which is
 * what an assessor asks for.
 *
 * <p>The link on instrument is nullable on purpose. An instrument with no
 * profile of its own falls back to the one its class carries, and a handful of
 * customer owned items have neither.
 */
export class ToleranceProfiles1736000000003 implements MigrationInterface {
  name = 'ToleranceProfiles1736000000003';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table tolerance_profile (
        id             serial primary key,
        code           varchar(32)  not null,
        name           varchar(120) not null,
        class_id       integer      references instrument_class (id),
        kind           varchar(24)  not null,
        absolute_term  numeric(18, 9) not null default 0,
        reading_ppm    numeric(18, 6) not null default 0,
        span_ppm       numeric(18, 6) not null default 0,
        floor_term     numeric(18, 9) not null default 0,
        created_at     timestamptz  not null default now(),
        updated_at     timestamptz  not null default now(),
        constraint uq_tolerance_profile_code unique (code),
        constraint ck_tolerance_profile_kind
          check (kind in ('ABSOLUTE', 'PERCENT_OF_READING', 'PERCENT_OF_SPAN', 'COMBINED')),
        constraint ck_tolerance_profile_terms
          check (absolute_term >= 0 and reading_ppm >= 0
                 and span_ppm >= 0 and floor_term >= 0)
      )
    `);

    await runner.query(`create index ix_tolerance_profile_class on tolerance_profile (class_id)`);

    await runner.query(`
      alter table instrument
        add column tolerance_profile_id integer references tolerance_profile (id)
    `);

    await runner.query(`
      create index ix_instrument_tolerance_profile on instrument (tolerance_profile_id)
    `);

    // The ten regimes the laboratory actually works to. Terms are in the unit
    // of the instrument, except the proportional ones which are parts per
    // million so a percentage never has to be written as 0.000035.
    await runner.query(`
      insert into tolerance_profile
        (code, name, kind, absolute_term, reading_ppm, span_ppm, floor_term)
      values
        ('DIM-MIC-25',   'External micrometer 0 to 25 mm',  'ABSOLUTE',           0.004,  0,     0,   0),
        ('DIM-CAL-150',  'Caliper 0 to 150 mm',             'ABSOLUTE',           0.03,   0,     0,   0),
        ('DIM-GB-K',     'Gauge block grade K',             'COMBINED',           0.0002, 10,    0,   0.00005),
        ('ELEC-DMM-6H',  'Six and a half digit multimeter', 'COMBINED',           0,      35,    5,   0.000001),
        ('ELEC-RES-STD', 'Standard resistor',               'PERCENT_OF_READING', 0,      2,     0,   0),
        ('MASS-ANA',     'Analytical balance',              'COMBINED',           0.0001, 20,    0,   0.00005),
        ('PRES-DIGI',    'Digital pressure indicator',      'PERCENT_OF_SPAN',    0,      0,     250, 0),
        ('TEMP-PRT',     'Platinum resistance thermometer', 'ABSOLUTE',           0.01,   0,     0,   0),
        ('TORQ-WRENCH',  'Torque wrench',                   'PERCENT_OF_READING', 0,      40000, 0,   0.1),
        ('TIME-FREQ',    'Frequency standard',              'PERCENT_OF_READING', 0,      0.05,  0,   0)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_instrument_tolerance_profile`);
    await runner.query(`alter table instrument drop column tolerance_profile_id`);
    await runner.query(`drop table tolerance_profile`);
  }
}
