import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two things contract review turned out to need off the receiving note.
 *
 * <p>The capability clause asks whether the laboratory covers what the item
 * reads to, and the requirements clause asks whether the customer stated what
 * they want it verified against. Neither is on the register row, because at
 * this point in a job there is no register row: the item has not been accepted
 * yet, and accepting it is the decision these two columns feed.
 */
export class JobItemRange1736000000014 implements MigrationInterface {
  name = 'JobItemRange1736000000014';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      alter table job_item
        add column range_high numeric(18, 6),
        add column tolerance_stated boolean not null default false
    `);

    // A range that reads downwards is a typing mistake on the note rather than
    // an instrument, and it would make the coverage check say the wrong thing.
    await runner.query(`
      alter table job_item
        add constraint ck_job_item_range check (range_high is null or range_high > 0)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`alter table job_item drop constraint ck_job_item_range`);
    await runner.query(`
      alter table job_item drop column tolerance_stated, drop column range_high
    `);
  }
}
