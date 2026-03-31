import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Interlaboratory comparisons, and how we did in them.
 *
 * <p>A round is one artefact circulated by one scheme with one closing date.
 * A result is what one of our people reported against one assigned value in
 * that round. The two are separate tables because a round has an assigned value
 * per measurement point and we report against each of them, and the scheme's
 * report arrives weeks after the artefact goes back.
 *
 * <p>The scores are stored rather than computed on read. They were computed
 * from the assigned value and its uncertainty as the scheme published them, and
 * a scheme that reissues a corrected report is a new fact rather than a reason
 * to rewrite what we were told the first time.
 */
export class Proficiency1736000000022 implements MigrationInterface {
  name = 'Proficiency1736000000022';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table proficiency_round (
        id             serial primary key,
        reference      varchar(48)  not null,
        scheme         varchar(160) not null,
        provider       varchar(160) not null,
        discipline     varchar(32)  not null,
        class_id       integer      references instrument_class (id),
        measurand      varchar(120) not null,
        unit           varchar(24)  not null,
        opened_on      date         not null,
        closes_on      date         not null,
        reported_on    date,
        state          varchar(16)  not null,
        note           varchar(400),
        created_at     timestamptz  not null default now(),
        updated_at     timestamptz  not null default now(),
        constraint uq_pt_round_reference unique (reference),
        constraint ck_pt_round_state
          check (state in ('OPEN', 'SUBMITTED', 'SCORED', 'WITHDRAWN')),
        constraint ck_pt_round_dates check (closes_on >= opened_on),
        constraint ck_pt_round_reported
          check (reported_on is null or reported_on >= opened_on)
      )
    `);

    await runner.query(`
      create index ix_pt_round_state on proficiency_round (state, closes_on)
    `);

    await runner.query(`
      create table proficiency_result (
        id                    serial primary key,
        round_id              integer      not null
                                references proficiency_round (id) on delete cascade,
        sequence_no           integer      not null,
        performed_by          varchar(120) not null,
        instrument_id         integer      references instrument (id),
        nominal               numeric(18, 6) not null,
        reported              numeric(18, 9) not null,
        reported_uncertainty  numeric(18, 9),
        assigned              numeric(18, 9),
        assigned_uncertainty  numeric(18, 9),
        standard_deviation    numeric(18, 9),
        en_number             numeric(10, 4),
        z_score               numeric(10, 4),
        outcome               varchar(16)  not null default 'NOT_SCORED',
        comment               varchar(400),
        constraint uq_pt_result_line unique (round_id, sequence_no),
        constraint ck_pt_result_sequence check (sequence_no > 0),
        constraint ck_pt_result_outcome
          check (outcome in ('SATISFACTORY', 'QUESTIONABLE', 'UNSATISFACTORY', 'NOT_SCORED')),
        -- An outcome other than not scored means the scheme has reported, and a
        -- scheme that reported gave us an assigned value.
        constraint ck_pt_result_scored
          check (outcome = 'NOT_SCORED' or assigned is not null)
      )
    `);

    await runner.query(`
      create index ix_pt_result_round on proficiency_result (round_id, sequence_no)
    `);

    // The competence screen asks what each person has been scored on, and the
    // answer drives whether their authorisation stands.
    await runner.query(`
      create index ix_pt_result_person on proficiency_result (performed_by, outcome)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table proficiency_result`);
    await runner.query(`drop table proficiency_round`);
  }
}
