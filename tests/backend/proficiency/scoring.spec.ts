import {
  EN_ACTION_LIMIT,
  EN_WARNING_LIMIT,
  ProficiencyOutcome,
  ProficiencyResult,
  Z_ACTION_LIMIT,
  Z_WARNING_LIMIT,
  biasRun,
  deviation,
  enNumber,
  gradeEn,
  gradeZ,
  outcomeLabel,
  overallOutcome,
  raisesNonconformance,
  showsBias,
  suspendsAuthorisation,
  zScore,
} from '@registry/proficiency/scoring';

function result(overrides: Partial<ProficiencyResult> = {}): ProficiencyResult {
  return {
    reported: 20.0003,
    reportedUncertainty: 0.0006,
    assigned: 20.0,
    assignedUncertainty: 0.0003,
    standardDeviation: 0.001,
    ...overrides,
  };
}

describe('the En number', () => {
  it('divides the difference by both uncertainties combined', () => {
    // 0.0003 over hypot(0.0006, 0.0003) = 0.000670..., so about 0.447.
    expect(enNumber(result())).toBeCloseTo(0.4472, 3);
  });

  it('keeps the sign, because the direction is what a bias run reads', () => {
    expect(enNumber(result({ reported: 19.9995 }))).toBeLessThan(0);
  });

  it('cannot be computed without our own uncertainty', () => {
    expect(enNumber(result({ reportedUncertainty: null }))).toBeNull();
  });

  it('cannot be computed without the scheme uncertainty', () => {
    expect(enNumber(result({ assignedUncertainty: null }))).toBeNull();
  });

  it('refuses to divide by nothing rather than returning infinity', () => {
    expect(enNumber(result({ reportedUncertainty: 0, assignedUncertainty: 0 }))).toBeNull();
  });

  it('is zero when we hit the assigned value exactly', () => {
    expect(enNumber(result({ reported: 20 }))).toBe(0);
  });
});

describe('the z score', () => {
  it('divides the difference by the scheme spread', () => {
    expect(zScore(result())).toBeCloseTo(0.3, 6);
  });

  it('cannot be computed without a published spread', () => {
    expect(zScore(result({ standardDeviation: null }))).toBeNull();
    expect(zScore(result({ standardDeviation: 0 }))).toBeNull();
  });
});

describe('grading against the limits', () => {
  it('grades En on 0.7 and 1', () => {
    expect(gradeEn(0.5)).toBe(ProficiencyOutcome.SATISFACTORY);
    expect(gradeEn(EN_WARNING_LIMIT)).toBe(ProficiencyOutcome.SATISFACTORY);
    expect(gradeEn(0.9)).toBe(ProficiencyOutcome.QUESTIONABLE);
    expect(gradeEn(EN_ACTION_LIMIT)).toBe(ProficiencyOutcome.QUESTIONABLE);
    expect(gradeEn(1.2)).toBe(ProficiencyOutcome.UNSATISFACTORY);
  });

  it('grades z on 2 and 3', () => {
    expect(gradeZ(1.5)).toBe(ProficiencyOutcome.SATISFACTORY);
    expect(gradeZ(Z_WARNING_LIMIT)).toBe(ProficiencyOutcome.SATISFACTORY);
    expect(gradeZ(2.5)).toBe(ProficiencyOutcome.QUESTIONABLE);
    expect(gradeZ(Z_ACTION_LIMIT)).toBe(ProficiencyOutcome.QUESTIONABLE);
    expect(gradeZ(3.5)).toBe(ProficiencyOutcome.UNSATISFACTORY);
  });

  it('grades a negative score on its magnitude', () => {
    expect(gradeEn(-1.4)).toBe(ProficiencyOutcome.UNSATISFACTORY);
    expect(gradeZ(-2.4)).toBe(ProficiencyOutcome.QUESTIONABLE);
  });

  it('does not score what it cannot compute', () => {
    expect(gradeEn(null)).toBe(ProficiencyOutcome.NOT_SCORED);
    expect(gradeZ(Number.NaN)).toBe(ProficiencyOutcome.NOT_SCORED);
  });
});

describe('the outcome of record', () => {
  it('takes the worse of the two scores', () => {
    // Right on the assigned value on z, but a tiny stated uncertainty on En.
    const overclaimed = result({
      reported: 20.0009,
      reportedUncertainty: 0.0002,
      assignedUncertainty: 0.0002,
      standardDeviation: 0.01,
    });

    expect(gradeZ(zScore(overclaimed))).toBe(ProficiencyOutcome.SATISFACTORY);
    expect(gradeEn(enNumber(overclaimed))).toBe(ProficiencyOutcome.UNSATISFACTORY);
    expect(overallOutcome(overclaimed)).toBe(ProficiencyOutcome.UNSATISFACTORY);
  });

  it('takes the one it can compute when the other is missing', () => {
    expect(overallOutcome(result({ standardDeviation: null }))).toBe(
      ProficiencyOutcome.SATISFACTORY,
    );
    expect(overallOutcome(result({ reportedUncertainty: null, reported: 20.004 }))).toBe(
      ProficiencyOutcome.UNSATISFACTORY,
    );
  });

  it('is not scored when neither can be computed, which is not a pass', () => {
    const bare = result({
      reportedUncertainty: null,
      assignedUncertainty: null,
      standardDeviation: null,
    });

    expect(overallOutcome(bare)).toBe(ProficiencyOutcome.NOT_SCORED);
    expect(overallOutcome(bare)).not.toBe(ProficiencyOutcome.SATISFACTORY);
  });

  it('is satisfactory on a result that is good on both', () => {
    expect(overallOutcome(result())).toBe(ProficiencyOutcome.SATISFACTORY);
  });
});

describe('what an outcome sets off', () => {
  it('raises a nonconformance only when it is unsatisfactory', () => {
    expect(raisesNonconformance(ProficiencyOutcome.UNSATISFACTORY)).toBe(true);
    expect(raisesNonconformance(ProficiencyOutcome.QUESTIONABLE)).toBe(false);
    expect(raisesNonconformance(ProficiencyOutcome.NOT_SCORED)).toBe(false);
  });

  it('suspends an authorisation on a failed En, but not on a failed z alone', () => {
    const failedEn = result({ reported: 20.002, reportedUncertainty: 0.0002 });
    const failedZ = result({
      reported: 20.004,
      reportedUncertainty: 0.01,
      assignedUncertainty: 0.01,
      standardDeviation: 0.001,
    });

    expect(suspendsAuthorisation(failedEn)).toBe(true);
    expect(gradeZ(zScore(failedZ))).toBe(ProficiencyOutcome.UNSATISFACTORY);
    expect(suspendsAuthorisation(failedZ)).toBe(false);
  });
});

describe('reading a trend across rounds', () => {
  it('counts a run on the same side', () => {
    const high = result({ reported: 20.001 });
    const low = result({ reported: 19.999 });

    expect(biasRun([high, high, high])).toBe(3);
    expect(biasRun([high, low, high])).toBe(1);
    expect(biasRun([low, high, high])).toBe(2);
  });

  it('resets on a result that landed exactly on the assigned value', () => {
    const high = result({ reported: 20.001 });
    const dead = result({ reported: 20 });

    expect(biasRun([high, high, dead, high])).toBe(1);
  });

  it('calls three on the same side a bias', () => {
    const high = result({ reported: 20.001 });

    expect(showsBias([high, high])).toBe(false);
    expect(showsBias([high, high, high])).toBe(true);
  });

  it('says nothing about an empty history', () => {
    expect(biasRun([])).toBe(0);
    expect(showsBias([])).toBe(false);
  });
});

describe('the difference itself', () => {
  it('is signed', () => {
    expect(deviation(result({ reported: 20.001 }))).toBeCloseTo(0.001, 9);
    expect(deviation(result({ reported: 19.999 }))).toBeCloseTo(-0.001, 9);
  });
});

describe('how an outcome reads', () => {
  it('is a word rather than an enum', () => {
    expect(outcomeLabel(ProficiencyOutcome.UNSATISFACTORY)).toBe('unsatisfactory');
    expect(outcomeLabel(ProficiencyOutcome.NOT_SCORED)).toBe('not scored');
  });
});
