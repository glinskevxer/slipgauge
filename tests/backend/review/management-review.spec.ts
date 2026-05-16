import { ManagementReview, median, talkingPointsFor } from '@registry/review/management-review';

function pack(overrides: Partial<Omit<ManagementReview, 'talkingPoints'>> = {}) {
  return {
    period: { from: '2025-01-01', to: '2025-12-31' },
    preparedOn: '2026-01-06',
    scope: {
      liveLines: 12,
      lapsedInPeriod: 0,
      disciplinesCovered: ['DIMENSIONAL'],
      workedButUnaccredited: [],
    },
    capa: {
      raised: 4,
      closed: 4,
      openAtEnd: 0,
      overdueAtEnd: 0,
      bySource: {},
      medianDaysToClose: 12,
    },
    proficiency: {
      roundsScored: 2,
      satisfactory: 2,
      questionable: 0,
      unsatisfactory: 0,
      outstanding: 0,
    },
    resources: {
      instrumentsInService: 120,
      referenceStandards: 6,
      overdue: 0,
      quarantined: 0,
      peopleAuthorised: 5,
      authorisationsExpiringSoon: 0,
      disciplinesWithoutAnApprover: [],
    },
    workload: {
      jobsReceived: 90,
      jobsDispatched: 88,
      lateOnDispatch: 0,
      certificatesIssued: 300,
      certificatesWithdrawn: 0,
      outOfToleranceFound: 3,
    },
    environment: {
      excursions: 2,
      major: 0,
      unassessed: 0,
      certificatesPutInQuestion: 0,
    },
    ...overrides,
  };
}

describe('the median', () => {
  it('takes the middle of an odd list', () => {
    expect(median([1, 9, 3])).toBe(3);
  });

  it('takes the mean of the middle two of an even list', () => {
    expect(median([1, 3, 4, 10])).toBe(3.5);
  });

  it('is nothing at all for an empty list', () => {
    expect(median([])).toBeNull();
  });

  it('is not dragged by one job that sat on a shelf', () => {
    const ninety = Array.from({ length: 90 }, () => 8);

    expect(median([...ninety, 240])).toBe(8);
  });
});

describe('what the pack raises on its own', () => {
  it('says so plainly when nothing needs saying', () => {
    expect(talkingPointsFor(pack())).toEqual([
      'Nothing in the register raised itself for this meeting.',
    ]);
  });

  it('raises a discipline nobody can approve in', () => {
    const points = talkingPointsFor(
      pack({
        resources: { ...pack().resources, disciplinesWithoutAnApprover: ['TORQUE'] },
      }),
    );

    expect(points[0]).toBe('Nobody can approve work in torque.');
  });

  it('raises work being done outside the schedule', () => {
    const points = talkingPointsFor(
      pack({ scope: { ...pack().scope, workedButUnaccredited: ['PRESSURE'] } }),
    );

    expect(points.join(' ')).toContain('nothing on the schedule of accreditation');
  });

  it('raises a capa register that is growing', () => {
    const points = talkingPointsFor(
      pack({ capa: { ...pack().capa, raised: 9, closed: 2, openAtEnd: 7 } }),
    );

    expect(points.join(' ')).toContain('More nonconformances were raised than closed: 9 against 2');
  });

  it('does not raise a capa register that is keeping up', () => {
    const points = talkingPointsFor(
      pack({ capa: { ...pack().capa, raised: 4, closed: 6 } }),
    );

    expect(points.join(' ')).not.toContain('More nonconformances');
  });

  it('raises a period with no proficiency at all', () => {
    const points = talkingPointsFor(
      pack({
        proficiency: { ...pack().proficiency, roundsScored: 0, satisfactory: 0 },
      }),
    );

    expect(points.join(' ')).toContain('No proficiency round was scored');
  });

  it('raises a major excursion with what it touched', () => {
    const points = talkingPointsFor(
      pack({
        environment: { excursions: 3, major: 1, unassessed: 0, certificatesPutInQuestion: 7 },
      }),
    );

    expect(points.join(' ')).toContain('1 major room excursion(s), touching 7 certificate(s)');
  });

  it('raises several things at once, worst first', () => {
    const points = talkingPointsFor(
      pack({
        resources: {
          ...pack().resources,
          disciplinesWithoutAnApprover: ['TORQUE'],
          overdue: 4,
        },
        capa: { ...pack().capa, overdueAtEnd: 2 },
      }),
    );

    expect(points).toHaveLength(3);
    expect(points[0]).toContain('Nobody can approve');
    expect(points[points.length - 1]).toContain('past their recall date');
  });

  it('never says nothing needs saying when something does', () => {
    const points = talkingPointsFor(
      pack({ workload: { ...pack().workload, lateOnDispatch: 1 } }),
    );

    expect(points).not.toContain('Nothing in the register raised itself for this meeting.');
  });
});
