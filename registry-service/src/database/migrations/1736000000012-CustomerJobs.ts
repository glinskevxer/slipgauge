import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer work: who sends items in, what came in with them, and the state the
 * job is sitting in.
 *
 * <p>Until now the register only knew about equipment the laboratory owns. Most
 * of the bench time is not spent on that equipment, it is spent on items a
 * customer sends in, and the assessment asks about those first because they are
 * the ones that leave the building with a certificate on them.
 *
 * <p>A received item is deliberately not an instrument row. It becomes one when
 * the job is accepted, and not before, because an item that is declined at
 * contract review would otherwise sit in the register for ever with no
 * calibration history and no owner.
 */
export class CustomerJobs1736000000012 implements MigrationInterface {
  name = 'CustomerJobs1736000000012';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table customer (
        id                  serial primary key,
        code                varchar(24)  not null,
        name                varchar(200) not null,
        contact_name        varchar(120),
        contact_email       varchar(200),
        contact_phone       varchar(40),
        address             varchar(400),
        accredited_required boolean      not null default false,
        turnaround_days     integer      not null default 10,
        active              boolean      not null default true,
        note                varchar(400),
        created_at          timestamptz  not null default now(),
        updated_at          timestamptz  not null default now(),
        constraint uq_customer_code unique (code),
        constraint ck_customer_code check (code ~ '^[A-Z0-9][A-Z0-9-]{1,23}$'),
        constraint ck_customer_turnaround check (turnaround_days between 1 and 180)
      )
    `);

    // The list screen searches on name far more than it searches on code, and
    // a customer list is small enough that a plain lower() index carries it.
    await runner.query(`
      create index ix_customer_name on customer (lower(name))
    `);

    await runner.query(`
      create table job (
        id             serial primary key,
        reference      varchar(24)  not null,
        customer_id    integer      not null references customer (id),
        state          varchar(24)  not null,
        priority       varchar(16)  not null default 'STANDARD',
        received_on    date         not null,
        promised_on    date         not null,
        completed_on   date,
        dispatched_on  date,
        received_by    varchar(120) not null,
        customer_order varchar(64),
        instructions   varchar(1000),
        created_at     timestamptz  not null default now(),
        updated_at     timestamptz  not null default now(),
        constraint uq_job_reference unique (reference),
        constraint ck_job_reference check (reference ~ '^J-[0-9]{4}-[0-9]{4,6}$'),
        constraint ck_job_state
          check (state in ('RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'IN_PROGRESS',
                           'COMPLETED', 'DISPATCHED', 'DECLINED')),
        constraint ck_job_priority
          check (priority in ('STANDARD', 'PRIORITY', 'SAME_DAY')),
        constraint ck_job_promised check (promised_on >= received_on),
        constraint ck_job_completed check (completed_on is null or completed_on >= received_on),
        constraint ck_job_dispatched
          check (dispatched_on is null or completed_on is not null)
      )
    `);

    // The job desk opens on what is open and late, in that order, so the index
    // that matters carries the promise date under the state.
    await runner.query(`
      create index ix_job_state_promised on job (state, promised_on)
    `);
    await runner.query(`
      create index ix_job_customer on job (customer_id, received_on desc)
    `);

    await runner.query(`
      create table job_item (
        id             serial primary key,
        job_id         integer      not null references job (id) on delete cascade,
        line_number    integer      not null,
        service        varchar(24)  not null,
        description    varchar(300) not null,
        manufacturer   varchar(120),
        model          varchar(120),
        serial_number  varchar(80),
        class_id       integer      references instrument_class (id),
        instrument_id  integer      references instrument (id),
        condition      varchar(24)  not null default 'SERVICEABLE',
        accessories    varchar(400),
        note           varchar(400),
        constraint uq_job_item_line unique (job_id, line_number),
        constraint ck_job_item_line check (line_number > 0),
        constraint ck_job_item_service
          check (service in ('CALIBRATION', 'ADJUSTMENT', 'REPAIR', 'VERIFICATION')),
        constraint ck_job_item_condition
          check (condition in ('SERVICEABLE', 'DAMAGED', 'INCOMPLETE', 'CONTAMINATED'))
      )
    `);

    await runner.query(`
      create index ix_job_item_instrument on job_item (instrument_id)
        where instrument_id is not null
    `);

    // A serial number is the only handle a customer has on their own item, so
    // the desk searches on it when somebody rings up about a job they cannot
    // name. Partial, because most lines on a repair job carry no serial.
    await runner.query(`
      create index ix_job_item_serial on job_item (lower(serial_number))
        where serial_number is not null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table job_item`);
    await runner.query(`drop table job`);
    await runner.query(`drop table customer`);
  }
}
