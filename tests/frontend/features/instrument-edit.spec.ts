import { detail } from '@fixtures';
import {
  EditDraft,
  changesBetween,
  consequencesOf,
  draftFrom,
  isUsable,
  problemsIn,
  toRequest,
} from '@features/instrument/edit/edit.model';

function draft(overrides: Partial<EditDraft> = {}): EditDraft {
  return { ...draftFrom(detail('SG-000101')), ...overrides };
}

describe('starting from the record', () => {
  it('turns the nulls into empty strings the form can bind to', () => {
    const started = draftFrom(detail('SG-000101', { description: null, custodian: null }));

    expect(started.description).toBe('');
    expect(started.custodian).toBe('');
  });

  it('carries the numbers across untouched', () => {
    const started = draftFrom(detail('SG-000101'));

    expect(started.rangeLow).toBe(0);
    expect(started.rangeHigh).toBe(25);
    expect(started.resolution).toBe(0.001);
  });
});

describe('what will not save', () => {
  it('accepts the record it started from', () => {
    expect(problemsIn(draft())).toEqual([]);
    expect(isUsable(draft())).toBe(true);
  });

  it('wants every number filled in', () => {
    const fields = problemsIn(
      draft({ rangeLow: null, rangeHigh: null, resolution: null }),
    ).map((problem) => problem.field);

    expect(fields).toEqual(['rangeLow', 'rangeHigh', 'resolution']);
  });

  it('refuses a range the wrong way round', () => {
    expect(problemsIn(draft({ rangeLow: 25, rangeHigh: 0 }))[0].field).toBe('span');
  });

  it('refuses a range with no width at all', () => {
    expect(problemsIn(draft({ rangeLow: 25, rangeHigh: 25 }))[0].field).toBe('span');
  });

  it('refuses a resolution of zero or less', () => {
    expect(problemsIn(draft({ resolution: 0 }))[0].message).toContain('more than zero');
    expect(problemsIn(draft({ resolution: -1 }))[0].message).toContain('more than zero');
  });

  it('refuses a resolution wider than the range', () => {
    expect(problemsIn(draft({ resolution: 30 }))[0].message).toContain('wider than the range');
  });

  it('refuses a description longer than the column', () => {
    expect(problemsIn(draft({ description: 'x'.repeat(401) }))[0].field).toBe('description');
    expect(problemsIn(draft({ description: 'x'.repeat(400) }))).toEqual([]);
  });
});

describe('what actually changed', () => {
  it('reports nothing when nothing was touched', () => {
    expect(changesBetween(detail('SG-000101'), draft())).toEqual([]);
  });

  it('names each field that moved', () => {
    const changes = changesBetween(
      detail('SG-000101'),
      draft({ custodian: 'D Ferreira', resolution: 0.0005 }),
    );

    expect(changes).toEqual(['resolution', 'custodian']);
  });

  it('words the reference standard change in both directions', () => {
    expect(changesBetween(detail('SG-000101'), draft({ referenceStandard: true }))).toEqual([
      'now a reference standard',
    ]);
    expect(
      changesBetween(
        detail('SG-000101', { referenceStandard: true }),
        draft({ referenceStandard: false }),
      ),
    ).toEqual(['no longer a reference standard']);
  });
});

describe('what a person should read first', () => {
  it('says nothing about a change that reaches nowhere', () => {
    expect(consequencesOf(detail('SG-000101'), draft({ custodian: 'D Ferreira' }))).toEqual([]);
  });

  it('warns that making it a standard starts a cascade path', () => {
    expect(
      consequencesOf(detail('SG-000101'), draft({ referenceStandard: true }))[0],
    ).toContain('cascade');
  });

  it('says certificates already issued keep their chain when it stops being one', () => {
    expect(
      consequencesOf(
        detail('SG-000101', { referenceStandard: true }),
        draft({ referenceStandard: false }),
      )[0],
    ).toContain('already issued');
  });

  it('warns that a narrower range refuses future sheets', () => {
    expect(consequencesOf(detail('SG-000101'), draft({ rangeHigh: 20 }))[0]).toContain(
      'refuse any future sheet',
    );
  });

  it('warns that the resolution feeds the budget', () => {
    expect(consequencesOf(detail('SG-000101'), draft({ resolution: 0.01 }))[0]).toContain(
      'uncertainty budget',
    );
  });

  it('can raise more than one at a time', () => {
    expect(
      consequencesOf(
        detail('SG-000101'),
        draft({ referenceStandard: true, resolution: 0.01, rangeHigh: 20 }),
      ),
    ).toHaveLength(3);
  });
});

describe('the payload', () => {
  it('sends the whole editable half, not just what changed', () => {
    expect(Object.keys(toRequest(draft())).sort()).toEqual([
      'custodian',
      'description',
      'locationCode',
      'rangeHigh',
      'rangeLow',
      'referenceStandard',
      'resolution',
    ]);
  });

  it('trims the text and sends nulls rather than blanks', () => {
    const request = toRequest(draft({ description: '  ', custodian: '  D Ferreira  ' }));

    expect(request.description).toBeNull();
    expect(request.custodian).toBe('D Ferreira');
  });

  it('never sends the three fields that identify the physical instrument', () => {
    const keys = Object.keys(toRequest(draft()));

    expect(keys).not.toContain('manufacturer');
    expect(keys).not.toContain('model');
    expect(keys).not.toContain('serialNumber');
    expect(keys).not.toContain('assetTag');
  });
});
