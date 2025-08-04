import {
  SheetDraft,
  emptyPoint,
  emptySheet,
  emptyStandard,
  isComplete,
  problemsFor,
  problemsIn,
  toRequest,
} from '@features/certificate/entry/sheet.model';

function usable(): SheetDraft {
  const draft = emptySheet();
  draft.certificateNumber = 'SGM-2025-0412';
  draft.assetTag = 'SG-000101';
  draft.performedBy = 'R Okonjo';
  draft.performedOn = '2025-04-12';
  draft.issuedOn = '2025-04-14';
  draft.points = [
    { ...emptyPoint(1), nominal: 5, asFound: 5.0012, asLeft: 5.0001, expandedUncertainty: 0.0005 },
  ];
  draft.standards = [{ ...emptyStandard('internal'), assetTag: 'SG-000901' }];
  return draft;
}

describe('sheet draft', () => {
  it('starts with one point and one standard so the form is not empty', () => {
    const draft = emptySheet();

    expect(draft.points).toHaveLength(1);
    expect(draft.standards).toHaveLength(1);
    expect(draft.acceptancePolicy).toBe('MANAGED_RISK');
  });

  it('gives every row its own key so tracking survives a reorder', () => {
    expect(emptyPoint(1).key).not.toBe(emptyPoint(1).key);
    expect(emptyStandard().key).not.toBe(emptyStandard().key);
  });

  it('calls a properly filled sheet complete', () => {
    expect(problemsIn(usable())).toHaveLength(0);
    expect(isComplete(usable())).toBe(true);
  });

  it('finds the missing header fields on a fresh sheet', () => {
    const problems = problemsFor(emptySheet(), 'header').map((problem) => problem.field);

    expect(problems).toContain('certificateNumber');
    expect(problems).toContain('assetTag');
    expect(problems).toContain('performedBy');
  });

  it('refuses an issue date before the work was done', () => {
    const draft = usable();
    draft.issuedOn = '2025-04-11';

    expect(problemsFor(draft, 'header').map((problem) => problem.field)).toContain('issuedOn');
  });

  it('refuses a calibration dated in the future', () => {
    const draft = usable();
    draft.performedOn = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    expect(problemsFor(draft, 'header').map((problem) => problem.field)).toContain('performedOn');
  });

  it('insists on a reference standard, not just any standard', () => {
    const draft = usable();
    draft.standards = [{ ...emptyStandard('internal'), assetTag: 'SG-000901', role: 'ENVIRONMENT' }];

    expect(problemsFor(draft, 'standards')[0].message).toContain('reference role');
  });

  it('wants an asset tag on an internal standard and a reference on an outside one', () => {
    const draft = usable();
    draft.standards = [emptyStandard('internal'), emptyStandard('external')];

    const fields = problemsFor(draft, 'standards').map((problem) => problem.field);
    expect(fields).toContain('assetTag.0');
    expect(fields).toContain('externalRef.1');
  });

  it('spots an outside standard that had already expired', () => {
    const draft = usable();
    draft.standards = [
      {
        ...emptyStandard('external'),
        externalRef: 'NPL length bar 12/4471',
        externalValidFrom: '2022-01-01',
        externalValidTo: '2024-12-31',
      },
    ];

    expect(problemsFor(draft, 'standards').map((problem) => problem.field)).toContain('expiry.0');
  });

  it('spots a validity window that runs backwards', () => {
    const draft = usable();
    draft.standards = [
      {
        ...emptyStandard('external'),
        externalRef: 'NPL length bar',
        externalValidFrom: '2026-01-01',
        externalValidTo: '2024-01-01',
      },
    ];

    expect(problemsFor(draft, 'standards').map((problem) => problem.field))
      .toContain('validity.0');
  });

  it('wants a nominal and an uncertainty on every point', () => {
    const draft = usable();
    draft.points = [emptyPoint(1)];

    const fields = problemsFor(draft, 'points').map((problem) => problem.field);
    expect(fields).toContain('nominal.0');
    expect(fields).toContain('uncertainty.0');
  });

  it('catches two points sharing a number', () => {
    const draft = usable();
    draft.points = [
      { ...emptyPoint(1), nominal: 5, expandedUncertainty: 0.0005 },
      { ...emptyPoint(1), nominal: 10, expandedUncertainty: 0.0005 },
    ];

    expect(problemsFor(draft, 'points').map((problem) => problem.field))
      .toContain('sequence.1');
  });

  it('refuses a coverage factor of zero', () => {
    const draft = usable();
    draft.points = [
      { ...emptyPoint(1), nominal: 5, expandedUncertainty: 0.0005, coverageFactor: 0 },
    ];

    expect(problemsFor(draft, 'points').map((problem) => problem.field))
      .toContain('coverage.0');
  });

  it('reports every step at once rather than one screen at a time', () => {
    const steps = new Set(problemsIn(emptySheet()).map((problem) => problem.step));

    expect(steps.has('header')).toBe(true);
    expect(steps.has('points')).toBe(true);
  });
});

describe('sheet payload', () => {
  it('sends an internal standard as an asset tag and nothing else', () => {
    const payload = toRequest(usable());
    const standards = payload['standards'] as Record<string, unknown>[];

    expect(standards[0]).toEqual({ assetTag: 'SG-000901', role: 'REFERENCE' });
  });

  it('sends an outside standard with its validity window', () => {
    const draft = usable();
    draft.standards = [
      {
        ...emptyStandard('external'),
        externalRef: 'NPL length bar 12/4471',
        externalLab: 'National Physical Laboratory',
        externalValidFrom: '2024-08-01',
        externalValidTo: '2026-08-01',
      },
    ];

    const standards = toRequest(draft)['standards'] as Record<string, unknown>[];
    expect(standards[0]['externalRef']).toBe('NPL length bar 12/4471');
    expect(standards[0]['externalValidTo']).toBe('2026-08-01');
    expect(standards[0]['assetTag']).toBeUndefined();
  });

  it('trims the free text and sends nulls rather than blanks', () => {
    const draft = usable();
    draft.certificateNumber = '  SGM-2025-0412  ';
    draft.remarks = '   ';

    const payload = toRequest(draft);
    expect(payload['certificateNumber']).toBe('SGM-2025-0412');
    expect(payload['remarks']).toBeNull();
    expect(payload['traceabilityOverrideReason']).toBeNull();
  });

  it('never sends tolerance limits, because the service derives them', () => {
    const points = toRequest(usable())['points'] as Record<string, unknown>[];

    expect(Object.keys(points[0])).not.toContain('toleranceLow');
    expect(Object.keys(points[0])).not.toContain('toleranceHigh');
  });
});
