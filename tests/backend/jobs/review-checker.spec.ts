import { AcceptancePolicy } from '@registry/calibration/conformity/acceptance-policy';
import { ItemCondition, JobService } from '@registry/jobs/job.enums';
import {
  ClassCapability,
  ReviewableItem,
  ReviewableJob,
  reviewJob,
} from '@registry/jobs/review/review-checker';
import {
  FindingSeverity,
  ReviewClause,
  ReviewOutcome,
  outcomeFor,
} from '@registry/jobs/review/review-clause';

const MICROMETERS: ClassCapability = {
  classId: 4,
  code: 'MIC-EXT',
  discipline: 'DIMENSIONAL',
  hasToleranceProfile: true,
  referenceAvailable: true,
  accredited: true,
  methodReference: 'SLP-WI-014',
  coveredTo: 300,
};

const TORQUE: ClassCapability = {
  classId: 9,
  code: 'TRQ-WR',
  discipline: 'TORQUE',
  hasToleranceProfile: true,
  referenceAvailable: true,
  accredited: false,
  methodReference: 'SLP-WI-031',
  coveredTo: 400,
};

const CAPABILITIES = new Map<number, ClassCapability>([
  [MICROMETERS.classId, MICROMETERS],
  [TORQUE.classId, TORQUE],
]);

function lookup(overrides: Partial<ClassCapability> = {}, classId = MICROMETERS.classId) {
  return (id: number): ClassCapability | undefined => {
    const base = CAPABILITIES.get(id);
    if (!base) {
      return undefined;
    }
    return id === classId ? { ...base, ...overrides } : base;
  };
}

function line(overrides: Partial<ReviewableItem> = {}): ReviewableItem {
  return {
    lineNumber: 1,
    service: JobService.CALIBRATION,
    condition: ItemCondition.SERVICEABLE,
    classId: MICROMETERS.classId,
    description: 'external micrometer 0-25',
    rangeHigh: 25,
    toleranceStated: true,
    ...overrides,
  };
}

function booked(overrides: Partial<ReviewableJob> = {}): ReviewableJob {
  return {
    reference: 'J-2025-0142',
    items: [line()],
    instructions: null,
    accreditedRequired: false,
    customerReachable: true,
    proposedPolicy: AcceptancePolicy.MANAGED_RISK,
    ...overrides,
  };
}

function detailsFor(findings: ReturnType<typeof reviewJob>, clause: ReviewClause): string[] {
  return findings.filter((item) => item.clause === clause).map((item) => item.detail);
}

describe('a job the laboratory can simply do', () => {
  it('raises nothing at all', () => {
    expect(reviewJob(booked(), lookup())).toHaveLength(0);
  });

  it('is accepted cleanly', () => {
    expect(outcomeFor(reviewJob(booked(), lookup()))).toBe(ReviewOutcome.ACCEPTED);
  });
});

describe('clause 7.1.1 a, the requirements', () => {
  it('blocks an empty job', () => {
    const findings = reviewJob(booked({ items: [] }), lookup());

    expect(detailsFor(findings, ReviewClause.REQUIREMENTS)).toEqual([
      'nothing was booked in against this job',
    ]);
  });

  it('blocks a line nobody could identify', () => {
    const findings = reviewJob(booked({ items: [line({ classId: null })] }), lookup());

    expect(findings[0].severity).toBe(FindingSeverity.BLOCKING);
    expect(findings[0].detail).toContain('we cannot tell what "external micrometer 0-25" is');
  });

  it('stops asking about a line it could not identify', () => {
    const findings = reviewJob(booked({ items: [line({ classId: null })] }), lookup());

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toHaveLength(0);
    expect(detailsFor(findings, ReviewClause.METHOD)).toHaveLength(0);
  });

  it('blocks a verification with nothing to verify against', () => {
    const findings = reviewJob(
      booked({ items: [line({ service: JobService.VERIFICATION, toleranceStated: false })] }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.REQUIREMENTS)).toEqual([
      'a verification needs the tolerance it is being verified against',
    ]);
  });

  it('takes written instructions as the stated tolerance', () => {
    const findings = reviewJob(
      booked({
        items: [line({ service: JobService.VERIFICATION, toleranceStated: false })],
        instructions: 'verify against the drawing, plus or minus five microns',
      }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.REQUIREMENTS)).toHaveLength(0);
  });

  it('deviates rather than blocks on an item that arrived damaged', () => {
    const findings = reviewJob(
      booked({ items: [line({ condition: ItemCondition.DAMAGED })] }),
      lookup(),
    );

    expect(findings[0].severity).toBe(FindingSeverity.DEVIATION);
    expect(findings[0].detail).toContain('arrived damaged');
  });

  it('says nothing about a damaged item that came in for repair', () => {
    const findings = reviewJob(
      booked({
        items: [line({ condition: ItemCondition.DAMAGED, service: JobService.REPAIR })],
      }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.REQUIREMENTS)).toHaveLength(0);
  });

  it('notes a customer nobody can ring', () => {
    const findings = reviewJob(booked({ customerReachable: false }), lookup());

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(FindingSeverity.NOTE);
    expect(findings[0].lineNumber).toBeNull();
  });
});

describe('clause 7.1.1 b, the capability', () => {
  it('blocks a class the laboratory holds nothing against', () => {
    const findings = reviewJob(booked({ items: [line({ classId: 77 })] }), lookup());

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toEqual([
      'the laboratory holds nothing against this class of instrument',
    ]);
  });

  it('blocks a class with no tolerance profile, because no verdict is possible', () => {
    const findings = reviewJob(booked(), lookup({ hasToleranceProfile: false }));

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toEqual([
      'MIC-EXT has no tolerance profile, so no verdict could be stated',
    ]);
  });

  it('blocks when the reference standard is not available', () => {
    const findings = reviewJob(booked(), lookup({ referenceAvailable: false }));

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toEqual([
      'no reference standard is available for dimensional',
    ]);
  });

  it('deviates on an item that reads past what the laboratory covers', () => {
    const findings = reviewJob(booked({ items: [line({ rangeHigh: 500 })] }), lookup());

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(FindingSeverity.DEVIATION);
    expect(findings[0].detail).toContain('reads to 500, the laboratory covers 300');
  });

  it('says nothing when the customer never stated a range', () => {
    expect(reviewJob(booked({ items: [line({ rangeHigh: null })] }), lookup())).toHaveLength(0);
  });

  it('deviates when an accredited customer sends unaccredited work', () => {
    const findings = reviewJob(
      booked({
        accreditedRequired: true,
        items: [line({ classId: TORQUE.classId, rangeHigh: 200 })],
      }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toEqual([
      'TRQ-WR is not on the accredited scope and this customer asked for accredited work',
    ]);
  });

  it('says nothing about the scope when the customer did not ask for accredited work', () => {
    const findings = reviewJob(
      booked({ items: [line({ classId: TORQUE.classId, rangeHigh: 200 })] }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.CAPABILITY)).toHaveLength(0);
  });
});

describe('clause 7.1.1 c, the method', () => {
  it('deviates when there is no published method', () => {
    const findings = reviewJob(booked(), lookup({ methodReference: null }));

    expect(detailsFor(findings, ReviewClause.METHOD)).toEqual([
      'no published method for MIC-EXT, the work would run to bench practice',
    ]);
  });

  it('notes rather than deviates on a repair, which has no method', () => {
    const findings = reviewJob(
      booked({ items: [line({ service: JobService.REPAIR })] }),
      lookup({ methodReference: null }),
    );

    expect(findings.map((item) => item.severity)).toEqual([FindingSeverity.NOTE]);
  });
});

describe('clause 7.1.3, the decision rule', () => {
  it('blocks a conformity job with no rule agreed', () => {
    const findings = reviewJob(booked({ proposedPolicy: null }), lookup());

    expect(detailsFor(findings, ReviewClause.DECISION_RULE)).toEqual([
      'this job states conformity and no decision rule has been agreed',
    ]);
  });

  it('does not ask for a rule on a job that states no conformity', () => {
    const findings = reviewJob(
      booked({ proposedPolicy: null, items: [line({ service: JobService.REPAIR })] }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.DECISION_RULE)).toHaveLength(0);
  });

  it('deviates when simple acceptance is proposed to a customer who asked us to carry the risk', () => {
    const findings = reviewJob(
      booked({ accreditedRequired: true, proposedPolicy: AcceptancePolicy.SHARED_RISK }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.DECISION_RULE)).toEqual([
      'simple acceptance leaves the risk with a customer whose contract asks us to carry it',
    ]);
  });

  it('allows simple acceptance to a customer who did not ask', () => {
    const findings = reviewJob(
      booked({ proposedPolicy: AcceptancePolicy.SHARED_RISK }),
      lookup(),
    );

    expect(findings).toHaveLength(0);
  });

  it('notes that a stringent rule on unaccredited work is still unaccredited', () => {
    const findings = reviewJob(
      booked({
        proposedPolicy: AcceptancePolicy.STRINGENT,
        items: [line({ classId: TORQUE.classId, rangeHigh: 200 })],
      }),
      lookup(),
    );

    expect(detailsFor(findings, ReviewClause.DECISION_RULE)).toEqual([
      'a stringent rule on unaccredited work still goes out unaccredited',
    ]);
    expect(outcomeFor(findings)).toBe(ReviewOutcome.ACCEPTED);
  });
});

describe('a job with several things wrong with it', () => {
  it('reports every clause rather than stopping at the first', () => {
    const findings = reviewJob(
      booked({
        accreditedRequired: true,
        proposedPolicy: AcceptancePolicy.SHARED_RISK,
        customerReachable: false,
        items: [
          line({ lineNumber: 1, condition: ItemCondition.CONTAMINATED }),
          line({ lineNumber: 2, classId: TORQUE.classId, rangeHigh: 900 }),
        ],
      }),
      lookup({ methodReference: null }),
    );

    expect(new Set(findings.map((item) => item.clause))).toEqual(
      new Set([
        ReviewClause.REQUIREMENTS,
        ReviewClause.CAPABILITY,
        ReviewClause.METHOD,
        ReviewClause.DECISION_RULE,
      ]),
    );
    expect(outcomeFor(findings)).toBe(ReviewOutcome.ACCEPTED_WITH_DEVIATION);
  });

  it('goes to declined as soon as one line cannot be done at all', () => {
    const findings = reviewJob(
      booked({
        items: [line({ lineNumber: 1 }), line({ lineNumber: 2, classId: 77 })],
      }),
      lookup(),
    );

    expect(outcomeFor(findings)).toBe(ReviewOutcome.DECLINED);
  });
});
