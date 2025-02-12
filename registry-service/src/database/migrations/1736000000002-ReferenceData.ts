import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The classes and locations the laboratory actually runs. These are reference
 * data rather than seed fixtures: the interval engine reads the three day
 * counts on every recall calculation, so they ship with the schema.
 */
export class ReferenceData1736000000002 implements MigrationInterface {
  name = 'ReferenceData1736000000002';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      insert into instrument_class
        (code, name, discipline, base_interval_days, min_interval_days,
         max_interval_days, criticality)
      values
        ('MIC-EXT',   'External micrometer',            'DIMENSIONAL', 365, 180,  730, 'IMPORTANT'),
        ('MIC-INT',   'Internal micrometer',            'DIMENSIONAL', 365, 180,  730, 'ROUTINE'),
        ('CAL-VER',   'Vernier caliper',                'DIMENSIONAL', 365, 180,  548, 'ROUTINE'),
        ('CAL-DIG',   'Digital caliper',                'DIMENSIONAL', 273, 120,  548, 'ROUTINE'),
        ('GB-SET',    'Gauge block set',                'DIMENSIONAL', 730, 365, 1095, 'CRITICAL'),
        ('GB-REF',    'Reference gauge block',          'DIMENSIONAL', 1095, 730, 1825, 'CRITICAL'),
        ('DTI',       'Dial test indicator',            'DIMENSIONAL', 365, 180,  548, 'ROUTINE'),
        ('CMM-PROBE', 'Coordinate machine probe',       'DIMENSIONAL', 182,  90,  365, 'IMPORTANT'),
        ('DMM-BENCH', 'Bench digital multimeter',       'ELECTRICAL',  365, 182,  730, 'IMPORTANT'),
        ('DMM-HAND',  'Handheld digital multimeter',    'ELECTRICAL',  365, 182,  548, 'ROUTINE'),
        ('CAL-MULTI', 'Multifunction calibrator',       'ELECTRICAL',  365, 182,  548, 'CRITICAL'),
        ('RES-STD',   'Standard resistor',              'ELECTRICAL',  730, 365, 1825, 'CRITICAL'),
        ('OSC-SCOPE', 'Digital storage oscilloscope',   'ELECTRICAL',  548, 273,  730, 'ROUTINE'),
        ('BAL-ANA',   'Analytical balance',             'MASS',        182,  90,  365, 'CRITICAL'),
        ('BAL-PREC',  'Precision balance',              'MASS',        365, 182,  548, 'IMPORTANT'),
        ('WT-E2',     'Class E2 weight set',            'MASS',        730, 365, 1095, 'CRITICAL'),
        ('WT-F1',     'Class F1 weight set',            'MASS',        730, 365, 1095, 'IMPORTANT'),
        ('PG-DIAL',   'Dial pressure gauge',            'PRESSURE',    365, 182,  548, 'ROUTINE'),
        ('PG-DIGI',   'Digital pressure indicator',     'PRESSURE',    365, 182,  548, 'IMPORTANT'),
        ('DWT',       'Deadweight tester',              'PRESSURE',    1095, 548, 1825, 'CRITICAL'),
        ('PRT-STD',   'Standard platinum resistance thermometer',
                                                        'TEMPERATURE', 730, 365, 1095, 'CRITICAL'),
        ('TC-K',      'Type K thermocouple probe',      'TEMPERATURE', 182,  90,  365, 'ROUTINE'),
        ('TEMP-BATH', 'Temperature calibration bath',   'TEMPERATURE', 365, 182,  548, 'IMPORTANT'),
        ('FLOW-TURB', 'Turbine flow meter',             'FLOW',        365, 182,  548, 'IMPORTANT'),
        ('FLOW-CORI', 'Coriolis mass flow meter',       'FLOW',        548, 273,  730, 'IMPORTANT'),
        ('TW-CLICK',  'Click type torque wrench',       'TORQUE',      182,  90,  365, 'IMPORTANT'),
        ('TW-DIGI',   'Digital torque wrench',          'TORQUE',      182,  90,  365, 'IMPORTANT'),
        ('TQ-TRANS',  'Reference torque transducer',    'TORQUE',      730, 365, 1095, 'CRITICAL'),
        ('TIME-CNT',  'Universal frequency counter',    'TIME',        548, 273,  730, 'IMPORTANT'),
        ('TIME-RUB',  'Rubidium frequency standard',    'TIME',        1095, 548, 1825, 'CRITICAL')
    `);

    // One level at a time. A multi row VALUES list cannot see its own rows from
    // a subquery, so the parent lookups have to run against statements that
    // have already inserted their level.
    await runner.query(`
      insert into storage_location (code, name, site) values
        ('HARLOW', 'Harlow site',        'HARLOW'),
        ('CREWE',  'Crewe workshop',     'CREWE'),
        ('FIELD',  'Field service vans', 'FIELD')
    `);

    await runner.query(`
      insert into storage_location (code, name, site, parent_id) values
        ('HARLOW-LAB',   'Main calibration laboratory', 'HARLOW',
            (select id from storage_location where code = 'HARLOW')),
        ('HARLOW-STORE', 'Bonded store',                'HARLOW',
            (select id from storage_location where code = 'HARLOW')),
        ('CREWE-FLOOR',  'Production floor',            'CREWE',
            (select id from storage_location where code = 'CREWE')),
        ('CREWE-TOOL',   'Tool crib',                   'CREWE',
            (select id from storage_location where code = 'CREWE'))
    `);

    await runner.query(`
      insert into storage_location (code, name, site, parent_id) values
        ('HARLOW-DIM',  'Dimensional room',      'HARLOW',
            (select id from storage_location where code = 'HARLOW-LAB')),
        ('HARLOW-ELEC', 'Electrical room',       'HARLOW',
            (select id from storage_location where code = 'HARLOW-LAB')),
        ('HARLOW-MASS', 'Mass and balance room', 'HARLOW',
            (select id from storage_location where code = 'HARLOW-LAB')),
        ('HARLOW-TEMP', 'Thermal room',          'HARLOW',
            (select id from storage_location where code = 'HARLOW-LAB')),
        ('HARLOW-QUAR', 'Quarantine cage',       'HARLOW',
            (select id from storage_location where code = 'HARLOW-STORE'))
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`delete from storage_location`);
    await runner.query(`delete from instrument_class`);
  }
}
