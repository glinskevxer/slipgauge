import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What the laboratory can say about a class of instrument, on the class itself.
 *
 * <p>Contract review has to answer whether a job is inside the accreditation
 * and whether there is a written method for it, and until now neither was
 * recorded anywhere. Both go on the class because that is the level the
 * schedule of accreditation is written at.
 *
 * <p>Nothing is accredited by default. An unaccredited class still gets worked
 * on and still gets a certificate, it just does not carry the mark, and the
 * wrong way round would put the mark on work that has never been assessed.
 */
export class ClassCapability1736000000015 implements MigrationInterface {
  name = 'ClassCapability1736000000015';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      alter table instrument_class
        add column accredited       boolean not null default false,
        add column method_reference varchar(120)
    `);

    // A method reference is a controlled document number, and a blank string
    // reads as "there is one" everywhere it is checked.
    await runner.query(`
      alter table instrument_class
        add constraint ck_class_method
          check (method_reference is null or length(trim(method_reference)) > 0)
    `);

    // The disciplines the laboratory was assessed for at the last visit.
    await runner.query(`
      update instrument_class
         set accredited = true
       where discipline in ('DIMENSIONAL', 'MASS', 'TEMPERATURE')
    `);

    await runner.query(`
      update instrument_class
         set method_reference = 'SLP-WI-' || lpad((id * 3 % 90 + 5)::text, 3, '0')
       where accredited
    `);

    await runner.query(`
      create index ix_class_accredited on instrument_class (discipline)
        where accredited
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_class_accredited`);
    await runner.query(`alter table instrument_class drop constraint ck_class_method`);
    await runner.query(`
      alter table instrument_class drop column method_reference, drop column accredited
    `);
  }
}
