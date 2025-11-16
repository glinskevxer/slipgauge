import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contract review, the thing ISO/IEC 17025 asks about before anything is
 * measured.
 *
 * <p>Four questions have to be answered on every job, and answered before the
 * work starts rather than written up afterwards: are the requirements defined,
 * can we actually do it, is the method the right one, and has the decision rule
 * been agreed with the customer. The answers are recorded here with the name of
 * whoever gave them.
 *
 * <p>One review per job, enforced by the primary key being the job. A job that
 * needs reviewing twice is a job that was declined and booked in again.
 */
export class ContractReview1736000000013 implements MigrationInterface {
  name = 'ContractReview1736000000013';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table contract_review (
        job_id                integer      primary key
                                references job (id) on delete cascade,
        outcome               varchar(24)  not null,
        reviewed_by           varchar(120) not null,
        reviewed_on           date         not null,
        requirements_defined  boolean      not null,
        capability_confirmed  boolean      not null,
        method_selected       boolean      not null,
        decision_rule_agreed  boolean      not null,
        acceptance_policy     varchar(24),
        method_reference      varchar(120),
        findings              text,
        declined_reason       varchar(400),
        created_at            timestamptz  not null default now(),
        updated_at            timestamptz  not null default now(),
        constraint ck_review_outcome
          check (outcome in ('ACCEPTED', 'ACCEPTED_WITH_DEVIATION', 'DECLINED')),
        constraint ck_review_policy
          check (acceptance_policy is null
                 or acceptance_policy in ('SHARED_RISK', 'STRINGENT', 'MANAGED_RISK')),
        -- An acceptance is only an acceptance when all four clauses were
        -- answered yes. A deviation is what covers a job the customer wants
        -- run anyway, and it has to carry a reason.
        constraint ck_review_accepted
          check (outcome <> 'ACCEPTED'
                 or (requirements_defined and capability_confirmed
                     and method_selected and decision_rule_agreed)),
        constraint ck_review_declined
          check (outcome <> 'DECLINED' or declined_reason is not null),
        constraint ck_review_deviation
          check (outcome <> 'ACCEPTED_WITH_DEVIATION' or findings is not null)
      )
    `);

    await runner.query(`
      create index ix_review_outcome on contract_review (outcome, reviewed_on desc)
    `);

    // The quality manager reads the register of deviations by reviewer, because
    // a reviewer who waves everything through is the pattern that matters.
    await runner.query(`
      create index ix_review_reviewer on contract_review (reviewed_by, reviewed_on desc)
        where outcome <> 'ACCEPTED'
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table contract_review`);
  }
}
