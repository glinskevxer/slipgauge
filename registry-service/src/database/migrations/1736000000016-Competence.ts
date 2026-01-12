import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who is allowed to do what, which is the question clause 6.2 asks and the one
 * the register has been answering with a role name.
 *
 * <p>A role says a person is a technician. It does not say they are authorised
 * to calibrate a torque wrench to 400 newton metres, and those are different
 * questions with different answers for the same person. An authorisation is
 * granted for a discipline, optionally narrowed to one class and one span, for
 * a period, by somebody who was themselves an approver.
 *
 * <p>Authorisations are withdrawn rather than deleted. A certificate signed
 * three years ago was signed under an authorisation that has to still be
 * readable, and an assessment asks for exactly that.
 */
export class Competence1736000000016 implements MigrationInterface {
  name = 'Competence1736000000016';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table competence (
        id               serial primary key,
        person           varchar(120) not null,
        discipline       varchar(32)  not null,
        class_id         integer      references instrument_class (id),
        level            varchar(16)  not null,
        range_low        numeric(18, 6),
        range_high       numeric(18, 6),
        authorised_from  date         not null,
        authorised_to    date,
        granted_by       varchar(120) not null,
        evidence         varchar(400),
        withdrawn_at     timestamptz,
        withdrawn_reason varchar(400),
        created_at       timestamptz  not null default now(),
        updated_at       timestamptz  not null default now(),
        constraint ck_competence_level
          check (level in ('TRAINEE', 'AUTHORISED', 'APPROVER')),
        constraint ck_competence_period
          check (authorised_to is null or authorised_to >= authorised_from),
        -- A span is stated as a pair or not at all. One end on its own reads as
        -- unbounded in the other direction, which is never what anybody meant.
        constraint ck_competence_span
          check ((range_low is null and range_high is null)
                 or (range_low is not null and range_high is not null
                     and range_high > range_low)),
        constraint ck_competence_withdrawn
          check (withdrawn_at is null or withdrawn_reason is not null)
      )
    `);

    // Every check asks the same question: what does this person hold in this
    // discipline right now. Withdrawn rows are excluded from the index because
    // they are only ever read one at a time, by an assessor looking at one
    // certificate.
    await runner.query(`
      create index ix_competence_person on competence (person, discipline)
        where withdrawn_at is null
    `);

    await runner.query(`
      create index ix_competence_expiry on competence (authorised_to)
        where withdrawn_at is null and authorised_to is not null
    `);

    // One live authorisation per person, discipline, class and level. A second
    // one is somebody re-granting rather than extending, and the two would then
    // disagree about when it runs out.
    await runner.query(`
      create unique index ux_competence_live
        on competence (person, discipline, coalesce(class_id, 0), level)
        where withdrawn_at is null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table competence`);
  }
}
