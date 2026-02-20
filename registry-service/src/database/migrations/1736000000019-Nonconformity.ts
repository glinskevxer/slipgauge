import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Things that went wrong, and what was done about them.
 *
 * <p>Clause 8.7 asks for more than a list. It asks what the cause was, what was
 * done to contain it, what was done so it does not happen again, and whether
 * that worked. Four separate answers, each with a date and a name, and a
 * laboratory that records only the first is recording a complaints book.
 *
 * <p>The row is deliberately not tied to one kind of source. A nonconformance
 * comes off an environment excursion, an out of tolerance result, a customer
 * complaint or an internal audit, and the four are handled the same way once
 * they are raised. The source is a pair of columns rather than four nullable
 * foreign keys, which is what the four foreign key version turned into before
 * anybody had added the third source.
 */
export class Nonconformity1736000000019 implements MigrationInterface {
  name = 'Nonconformity1736000000019';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      create table nonconformance (
        id                    serial primary key,
        reference             varchar(24)  not null,
        raised_on             date         not null,
        raised_by             varchar(120) not null,
        source                varchar(24)  not null,
        source_ref            varchar(64),
        title                 varchar(200) not null,
        detail                text         not null,
        severity              varchar(16)  not null,
        state                 varchar(24)  not null,
        owner                 varchar(120),
        due_on                date,
        containment           varchar(1000),
        contained_on          date,
        root_cause            varchar(1000),
        cause_found_on        date,
        corrective_action     varchar(1000),
        action_taken_on       date,
        effectiveness         varchar(1000),
        effectiveness_on      date,
        closed_on             date,
        closed_by             varchar(120),
        created_at            timestamptz  not null default now(),
        updated_at            timestamptz  not null default now(),
        constraint uq_nonconformance_reference unique (reference),
        constraint ck_nc_reference check (reference ~ '^NC-[0-9]{4}-[0-9]{3,5}$'),
        constraint ck_nc_source
          check (source in ('EXCURSION', 'OUT_OF_TOLERANCE', 'COMPLAINT', 'AUDIT',
                            'PROFICIENCY', 'OTHER')),
        constraint ck_nc_severity check (severity in ('LOW', 'MEDIUM', 'HIGH')),
        constraint ck_nc_state
          check (state in ('RAISED', 'CONTAINED', 'CAUSE_FOUND', 'ACTION_TAKEN',
                           'EFFECTIVENESS_CHECKED', 'CLOSED', 'ABANDONED')),
        -- Each stage carries its own date, and a stage with a date but no text
        -- is a tick in a box. The pairing is checked here so it cannot be
        -- written that way by anything, including a migration.
        constraint ck_nc_containment
          check ((containment is null) = (contained_on is null)),
        constraint ck_nc_cause check ((root_cause is null) = (cause_found_on is null)),
        constraint ck_nc_action
          check ((corrective_action is null) = (action_taken_on is null)),
        constraint ck_nc_effectiveness
          check ((effectiveness is null) = (effectiveness_on is null)),
        constraint ck_nc_closed check ((closed_on is null) = (closed_by is null))
      )
    `);

    await runner.query(`
      create index ix_nc_state on nonconformance (state, due_on)
    `);

    await runner.query(`
      create index ix_nc_source on nonconformance (source, source_ref)
    `);

    // The quality manager's board is everything still open, worst first. A
    // partial index keeps it off the closed ones, which is most of the table
    // after the first year.
    await runner.query(`
      create index ix_nc_open on nonconformance (severity, raised_on)
        where state not in ('CLOSED', 'ABANDONED')
    `);

    // One nonconformance per source event. A second one raised off the same
    // excursion is somebody clicking twice, and two CAPA records for one event
    // is exactly what an assessor picks up on.
    await runner.query(`
      create unique index ux_nc_source_event on nonconformance (source, source_ref)
        where source_ref is not null
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop table nonconformance`);
  }
}
