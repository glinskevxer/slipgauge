import { InstrumentStatus } from '@core/models/instrument.model';
import { summary } from '@fixtures';
import {
  canTransition,
  groupFailures,
  planCustodianChange,
  planStatusChange,
  reachableFrom,
  summarise,
} from '@features/register/bulk/bulk.model';

describe('status transitions', () => {
  it('refuses a move to the status it is already in', () => {
    expect(canTransition('IN_SERVICE', 'IN_SERVICE')).toBe(false);
  });

  it('lets an in service instrument go anywhere', () => {
    expect(canTransition('IN_SERVICE', 'QUARANTINED')).toBe(true);
    expect(canTransition('IN_SERVICE', 'RETIRED')).toBe(true);
  });

  it('never lets a retired instrument come back', () => {
    expect(canTransition('RETIRED', 'IN_SERVICE')).toBe(false);
    expect(reachableFrom([summary('SG-000101', { status: 'RETIRED' })])).toEqual([]);
  });

  it('will not send a quarantined instrument straight back into service', () => {
    expect(canTransition('QUARANTINED', 'IN_SERVICE')).toBe(false);
    expect(canTransition('QUARANTINED', 'IN_CALIBRATION')).toBe(true);
  });

  it('offers the union of what the selection can reach', () => {
    const reachable = reachableFrom([
      summary('SG-000101', { status: 'IN_SERVICE' }),
      summary('SG-000102', { status: 'ON_LOAN' }),
    ]);

    expect(reachable).toContain('QUARANTINED');
    expect(reachable).toContain('ON_LOAN');
    expect(reachable).toContain('IN_SERVICE');
  });
});

describe('planning a status change', () => {
  it('separates what can move from what cannot, with a reason', () => {
    const plan = planStatusChange(
      [
        summary('SG-000101', { status: 'IN_SERVICE' }),
        summary('SG-000102', { status: 'QUARANTINED' }),
        summary('SG-000103', { status: 'RETIRED' }),
      ],
      'QUARANTINED',
    );

    expect(plan.eligible.map((entry) => entry.assetTag)).toEqual(['SG-000101']);
    expect(plan.blocked.map((entry) => entry.reason)).toEqual([
      'already quarantined',
      'cannot go from retired to quarantined',
    ]);
  });

  it('plans nothing at all from an empty selection', () => {
    const plan = planStatusChange([], 'QUARANTINED');

    expect(plan.eligible).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it('names the action it planned', () => {
    expect(planStatusChange([], 'RETIRED').action).toBe('STATUS');
  });
});

describe('planning a custodian change', () => {
  it('skips the instruments already assigned to that person', () => {
    const plan = planCustodianChange(
      [summary('SG-000101', { status: 'IN_SERVICE', custodian: 'D Ferreira' }), summary('SG-000102', { status: 'IN_SERVICE', custodian: 'R Okonjo' })],
      ' D Ferreira ',
    );

    expect(plan.eligible.map((entry) => entry.assetTag)).toEqual(['SG-000102']);
    expect(plan.blocked[0].reason).toBe('already assigned to that person');
  });

  it('will not put a custodian on a retired instrument', () => {
    const plan = planCustodianChange([summary('SG-000103', { status: 'RETIRED', custodian: null })], 'D Ferreira');

    expect(plan.eligible).toEqual([]);
    expect(plan.blocked[0].reason).toContain('retired');
  });

  it('treats an unassigned instrument as changeable', () => {
    const plan = planCustodianChange([summary('SG-000104', { status: 'IN_SERVICE', custodian: null })], 'D Ferreira');

    expect(plan.eligible).toHaveLength(1);
  });
});

describe('reporting what happened', () => {
  it('says so plainly when everything worked', () => {
    expect(summarise({ succeeded: 7, failed: [] })).toBe('7 updated');
  });

  it('says so plainly when nothing did', () => {
    expect(
      summarise({ succeeded: 0, failed: [{ assetTag: 'SG-000101', message: 'no' }] }),
    ).toBe('none updated, 1 refused');
  });

  it('reports a partial result as both halves', () => {
    expect(
      summarise({ succeeded: 4, failed: [{ assetTag: 'SG-000101', message: 'no' }] }),
    ).toBe('4 updated, 1 refused');
  });

  it('groups the failures, because a batch fails the same way', () => {
    const grouped = groupFailures({
      succeeded: 1,
      failed: [
        { assetTag: 'SG-000101', message: 'your role does not allow that' },
        { assetTag: 'SG-000102', message: 'your role does not allow that' },
        { assetTag: 'SG-000103', message: 'the record changed while you were editing it' },
      ],
    });

    expect(grouped).toHaveLength(2);
    expect(grouped[0].assetTags).toEqual(['SG-000101', 'SG-000102']);
  });

  it('groups nothing from a clean run', () => {
    expect(groupFailures({ succeeded: 3, failed: [] })).toEqual([]);
  });
});
