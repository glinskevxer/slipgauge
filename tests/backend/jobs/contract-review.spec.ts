import { AcceptancePolicy } from '@registry/calibration/conformity/acceptance-policy';
import { RuleViolationError } from '@registry/common/errors';
import { ContractReview, reviewFrom } from '@registry/jobs/contract-review.entity';
import {
  CLAUSE_ORDER,
  FindingSeverity,
  ReviewClause,
  ReviewOutcome,
  actionable,
  clausePasses,
  describeFinding,
  finding,
  firstFailedClause,
  outcomeFor,
  worstSeverity,
} from '@registry/jobs/review/review-clause';

const requirementsMissing = finding(
  ReviewClause.REQUIREMENTS,
  FindingSeverity.BLOCKING,
  'no tolerance was stated and the item has no published specification',
  2,
);

const noCapability = finding(
  ReviewClause.CAPABILITY,
  FindingSeverity.BLOCKING,
  'nothing on site reaches 1000 bar',
  1,
);

const outsideScope = finding(
  ReviewClause.CAPABILITY,
  FindingSeverity.DEVIATION,
  'torque is not on the accredited scope, this line goes out unaccredited',
  3,
);

const worthSaying = finding(
  ReviewClause.METHOD,
  FindingSeverity.NOTE,
  'working to the maker method rather than the in house one',
);

describe('review findings', () => {
  it('ranks a blocking finding above a deviation above a note', () => {
    expect(worstSeverity([worthSaying])).toBe(FindingSeverity.NOTE);
    expect(worstSeverity([worthSaying, outsideScope])).toBe(FindingSeverity.DEVIATION);
    expect(worstSeverity([worthSaying, outsideScope, noCapability])).toBe(
      FindingSeverity.BLOCKING,
    );
  });

  it('has no worst severity when nothing was raised', () => {
    expect(worstSeverity([])).toBeNull();
  });

  it('turns the worst finding into the outcome the reviewer is held to', () => {
    expect(outcomeFor([])).toBe(ReviewOutcome.ACCEPTED);
    expect(outcomeFor([worthSaying])).toBe(ReviewOutcome.ACCEPTED);
    expect(outcomeFor([outsideScope])).toBe(ReviewOutcome.ACCEPTED_WITH_DEVIATION);
    expect(outcomeFor([outsideScope, noCapability])).toBe(ReviewOutcome.DECLINED);
  });

  it('lets a clause pass while only notes stand against it', () => {
    expect(clausePasses(ReviewClause.METHOD, [worthSaying])).toBe(true);
    expect(clausePasses(ReviewClause.CAPABILITY, [outsideScope])).toBe(false);
    expect(clausePasses(ReviewClause.CAPABILITY, [worthSaying])).toBe(true);
  });

  it('finds the earliest clause that failed, not the worst', () => {
    expect(firstFailedClause([noCapability, requirementsMissing])).toBe(
      ReviewClause.REQUIREMENTS,
    );
    expect(firstFailedClause([outsideScope])).toBe(ReviewClause.CAPABILITY);
    expect(firstFailedClause([worthSaying])).toBeNull();
  });

  it('keeps the clauses in the order they depend on each other', () => {
    expect(CLAUSE_ORDER).toEqual([
      ReviewClause.REQUIREMENTS,
      ReviewClause.CAPABILITY,
      ReviewClause.METHOD,
      ReviewClause.DECISION_RULE,
    ]);
  });
});

describe('trimming a review to what is worth acting on', () => {
  it('drops later clause failures that were judged against an unsettled answer', () => {
    const trimmed = actionable([requirementsMissing, noCapability]);

    expect(trimmed).toEqual([requirementsMissing]);
  });

  it('keeps notes from later clauses, because they often explain the failure', () => {
    const trimmed = actionable([requirementsMissing, noCapability, worthSaying]);

    expect(trimmed).toEqual([requirementsMissing, worthSaying]);
  });

  it('keeps everything when nothing failed', () => {
    const all = [worthSaying];
    expect(actionable(all)).toEqual(all);
  });

  it('keeps a failure on the same clause as the first failure', () => {
    const second = finding(
      ReviewClause.CAPABILITY,
      FindingSeverity.DEVIATION,
      'the reference is out of calibration next week',
      4,
    );

    expect(actionable([noCapability, second])).toEqual([noCapability, second]);
  });
});

describe('how a finding reads', () => {
  it('names the line when it came from one', () => {
    expect(describeFinding(noCapability)).toBe('line 1: nothing on site reaches 1000 bar');
  });

  it('says the job when it did not', () => {
    expect(describeFinding(worthSaying)).toBe(
      'job: working to the maker method rather than the in house one',
    );
  });
});

describe('building the review record', () => {
  it('answers all four clauses yes when nothing was raised', () => {
    const review = reviewFrom(41, ReviewOutcome.ACCEPTED, 'a.pereira', '2025-11-14', []);

    expect(review.isClean()).toBe(true);
    expect(review.findings).toBeNull();
    expect(review.declinedReason).toBeNull();
    expect(review.permitsWork()).toBe(true);
  });

  it('answers only the failed clause no', () => {
    const review = reviewFrom(
      41,
      ReviewOutcome.ACCEPTED_WITH_DEVIATION,
      'a.pereira',
      '2025-11-14',
      [outsideScope],
    );

    expect(review.requirementsDefined).toBe(true);
    expect(review.capabilityConfirmed).toBe(false);
    expect(review.methodSelected).toBe(true);
    expect(review.decisionRuleAgreed).toBe(true);
    expect(review.isClean()).toBe(false);
  });

  it('writes the findings out one to a line', () => {
    const review = reviewFrom(
      41,
      ReviewOutcome.DECLINED,
      'a.pereira',
      '2025-11-14',
      [noCapability, worthSaying],
    );

    expect(review.findings).toBe(
      'line 1: nothing on site reaches 1000 bar\n' +
        'job: working to the maker method rather than the in house one',
    );
  });

  it('quotes the first blocking finding as the reason for declining', () => {
    const review = reviewFrom(
      41,
      ReviewOutcome.DECLINED,
      'a.pereira',
      '2025-11-14',
      [worthSaying, noCapability, requirementsMissing],
    );

    expect(review.declinedReason).toBe('line 1: nothing on site reaches 1000 bar');
  });

  it('falls back to a plain reason when a reviewer declines on judgement alone', () => {
    const review = reviewFrom(41, ReviewOutcome.DECLINED, 'a.pereira', '2025-11-14', []);

    expect(review.declinedReason).toBe('declined at contract review');
  });
});

describe('validating a review before it is written', () => {
  function accepted(): ContractReview {
    const review = reviewFrom(41, ReviewOutcome.ACCEPTED, 'a.pereira', '2025-11-14', []);
    review.acceptancePolicy = AcceptancePolicy.MANAGED_RISK;
    return review;
  }

  it('lets a clean acceptance with a decision rule through', () => {
    expect(() => accepted().validate()).not.toThrow();
  });

  it('refuses a clean acceptance that has a clause answered no', () => {
    const review = accepted();
    review.capabilityConfirmed = false;

    expect(() => review.validate()).toThrow(/record a deviation instead/);
  });

  it('refuses a declined job with no reason', () => {
    const review = accepted();
    review.outcome = ReviewOutcome.DECLINED;
    review.declinedReason = null;

    expect(() => review.validate()).toThrow(RuleViolationError);
  });

  it('refuses a deviation that was never written down', () => {
    const review = accepted();
    review.outcome = ReviewOutcome.ACCEPTED_WITH_DEVIATION;
    review.findings = null;

    expect(() => review.validate()).toThrow(/written down/);
  });

  it('refuses to send a job to the bench with no agreed decision rule', () => {
    const review = accepted();
    review.acceptancePolicy = null;

    expect(() => review.validate()).toThrow(/agreed decision rule/);
  });

  it('does not ask a declined job for a decision rule', () => {
    const review = reviewFrom(
      41,
      ReviewOutcome.DECLINED,
      'a.pereira',
      '2025-11-14',
      [noCapability],
    );

    expect(review.permitsWork()).toBe(false);
    expect(() => review.validate()).not.toThrow();
  });
});
