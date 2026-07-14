import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Equipment that leaves the laboratory and comes back.
 *
 * <p>The register already had an ON_LOAN status, which said an instrument was
 * out and nothing else: not who has it, not when it is due back, and not what
 * state it was in when it went. Clause 6.4.6 asks the laboratory to know where
 * its equipment is, and a status is not an answer to that.
 *
 * <p>The loan is the record and the status follows it. Setting the status by
 * hand while a loan is open is refused, because the two disagreeing is how an
 * instrument ends up in service on paper and in a van in reality.
 */
export class Loans1736000000025 implements MigrationInterface {
  name = 'Loans1736000000025';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table equipment_loan (
        id             serial primary key,
        instrument_id  integer      not null references instrument (id),
        borrower       varchar(120) not null,
        destination    varchar(200) not null,
        purpose        varchar(400),
        issued_on      date         not null,
        due_back_on    date         not null,
        returned_on    date,
        issued_by      varchar(120) not null,
        received_by    varchar(120),
        condition_out  varchar(24)  not null default 'SERVICEABLE',
        condition_back varchar(24),
        note           varchar(400),
        created_at     timestamptz  not null default now(),
        updated_at     timestamptz  not null default now(),
        constraint ck_loan_dates check (due_back_on >= issued_on),
        constraint ck_loan_returned
          check (returned_on is null or returned_on >= issued_on),
        constraint ck_loan_receipt
          check ((returned_on is null) = (received_by is null)),
        constraint ck_loan_condition_out
          check (condition_out in ('SERVICEABLE', 'DAMAGED', 'INCOMPLETE', 'CONTAMINATED')),
        constraint ck_loan_condition_back
          check (condition_back is null
                 or condition_back in ('SERVICEABLE', 'DAMAGED', 'INCOMPLETE', 'CONTAMINATED'))
      )
    `);

    // One instrument cannot be in two places. Enforced here rather than in the
    // service, because the service is not the only thing that will ever write
    // this table and a van is a poor place to discover the rule was optional.
    await runner.query(`
      create unique index ux_loan_out on equipment_loan (instrument_id)
        where returned_on is null
    `);

    await runner.query(`
      create index ix_loan_due on equipment_loan (due_back_on)
        where returned_on is null
    `);

    await runner.query(`
      create index ix_loan_borrower on equipment_loan (lower(borrower), issued_on desc)
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table equipment_loan`);
  }
}
