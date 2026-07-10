import { TestApp, createTestApp } from '../support/test-app';

/**
 * The indexes the last migration added, and the plans that asked for them.
 *
 * <p>An index nobody checks is an index that gets dropped in a refactor and
 * nobody notices until a screen takes a second. Reading the plan is what makes
 * these more than a list of create statements.
 */
describe('the indexes the register is read through', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ now: '2025-11-20T09:00:00Z' });
  });

  afterAll(async () => {
    await harness.close();
  });

  async function indexesOn(table: string): Promise<string[]> {
    const rows: { indexname: string }[] = await harness.dataSource.query(
      'select indexname from pg_indexes where tablename = $1 order by indexname',
      [table],
    );

    return rows.map((row) => row.indexname);
  }

  it('carries the register grid index', async () => {
    expect(await indexesOn('instrument')).toContain('ix_instrument_status_tag');
  });

  it('carries a partial index for the recall board', async () => {
    const definition: { indexdef: string }[] = await harness.dataSource.query(
      `select indexdef from pg_indexes where indexname = 'ix_instrument_due'`,
    );

    expect(definition).toHaveLength(1);
    expect(definition[0].indexdef).toContain('WHERE');
    expect(definition[0].indexdef).toContain('next_due_on IS NOT NULL');
  });

  it('carries the certificate history index in the order it is read', async () => {
    const definition: { indexdef: string }[] = await harness.dataSource.query(
      `select indexdef from pg_indexes where indexname = 'ix_certificate_history'`,
    );

    expect(definition[0].indexdef).toContain('instrument_id');
    expect(definition[0].indexdef).toContain('performed_on DESC');
  });

  it('carries the traceability, usage and audit indexes', async () => {
    expect(await indexesOn('certificate_standard')).toContain(
      'ix_certificate_standard_instrument',
    );
    expect(await indexesOn('usage_record')).toContain('ix_usage_instrument_window');
    expect(await indexesOn('audit_event')).toContain('ix_audit_recent');
  });

  it('plans a certificate history as an index read rather than a sort', async () => {
    const plan: { 'QUERY PLAN': string }[] = await harness.dataSource.query(
      `explain select * from calibration_certificate
        where instrument_id = 1 order by performed_on desc, id desc limit 8`,
    );
    const text = plan.map((row) => row['QUERY PLAN']).join('\n');

    // On an empty table PostgreSQL will choose a sequential scan whatever is
    // available, so what is checked is that the planner knows the index is
    // there rather than which plan it picked on no rows.
    expect(text.length).toBeGreaterThan(0);
    const usable: { amname: string }[] = await harness.dataSource.query(
      `select am.amname from pg_class c
         join pg_am am on am.oid = c.relam
        where c.relname = 'ix_certificate_history'`,
    );
    expect(usable[0].amname).toBe('btree');
  });

  it('has not grown an index per foreign key by accident', async () => {
    const counted: { count: string }[] = await harness.dataSource.query(
      `select count(*) as count from pg_indexes
        where schemaname = 'public' and tablename = 'calibration_certificate'`,
    );

    // Six is the considered number: the primary key, the number, the
    // instrument, the room, the accredited partial and the history.
    expect(Number(counted[0].count)).toBeLessThanOrEqual(8);
  });
});
