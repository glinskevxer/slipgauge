import { Injectable } from '@nestjs/common';

import { toScale } from '../../common/numeric';
import { AcceptancePolicy } from './acceptance-policy';
import { ConformityDecision } from './conformity-decision';
import { LIMIT_SCALE, ToleranceBand } from './tolerance-band';
import { Verdict } from './verdict';

/** The ratio at which the laboratory is willing to accept without a guard band. */
export const TARGET_RATIO = 4;

/** Below this ratio no statement of conformity is made at all. */
export const INDETERMINATE_RATIO = 1;

/**
 * Decides whether a measured value conforms, and says why.
 *
 * <p>The chain is deliberate. The uncertainty budget fixes the expanded
 * uncertainty, the expanded uncertainty and the tolerance fix the test
 * uncertainty ratio, the ratio fixes the guard band, and only then does the
 * reading get compared to anything. Change the budget and the verdict on an
 * unchanged reading can change with it, which is the whole point of recording
 * the decision alongside the number.
 */
@Injectable()
export class ConformityAssessor {
  assess(
    measured: number | null,
    tolerance: ToleranceBand,
    expandedUncertainty: number,
    policy: AcceptancePolicy,
  ): ConformityDecision {
    if (measured === null) {
      return new ConformityDecision(
        Verdict.NOT_ASSESSED,
        null,
        tolerance,
        tolerance,
        0,
        0,
        Number.NaN,
        policy,
        0,
      );
    }
    if (!Number.isFinite(expandedUncertainty) || expandedUncertainty < 0) {
      throw new Error('expanded uncertainty must be zero or more');
    }

    const ratio = this.testUncertaintyRatio(tolerance, expandedUncertainty);
    const guardBand = this.guardBandFor(ratio, expandedUncertainty, policy);
    const acceptance = tolerance.shrunkBy(guardBand);
    const excursion = tolerance.excursion(measured);

    return new ConformityDecision(
      this.judge(measured, tolerance, acceptance, ratio),
      toScale(measured, LIMIT_SCALE),
      tolerance,
      acceptance,
      guardBand,
      expandedUncertainty,
      ratio,
      policy,
      excursion,
    );
  }

  /**
   * The order matters. A reading outside tolerance is out whatever the ratio
   * says, and a ratio too poor to state conformity outranks a guard band that
   * would otherwise only have made the point marginal.
   */
  private judge(
    measured: number,
    tolerance: ToleranceBand,
    acceptance: ToleranceBand,
    ratio: number,
  ): Verdict {
    if (!tolerance.contains(measured)) {
      return Verdict.OUT_OF_TOLERANCE;
    }
    if (ratio < INDETERMINATE_RATIO) {
      return Verdict.INDETERMINATE;
    }
    if (!acceptance.contains(measured)) {
      return Verdict.MARGINAL;
    }
    return Verdict.PASS;
  }

  /**
   * Tolerance half width divided by expanded uncertainty. A zero uncertainty
   * is reported as an infinite ratio rather than blowing up, because a few
   * imported historical certificates carry no budget at all.
   */
  testUncertaintyRatio(tolerance: ToleranceBand, expandedUncertainty: number): number {
    if (expandedUncertainty === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const halfWidth = tolerance.halfWidth();

    if (halfWidth === 0) {
      return 0;
    }
    return halfWidth / expandedUncertainty;
  }

  guardBandFor(
    ratio: number,
    expandedUncertainty: number,
    policy: AcceptancePolicy,
  ): number {
    switch (policy) {
      case AcceptancePolicy.SHARED_RISK:
        return 0;
      case AcceptancePolicy.STRINGENT:
        return expandedUncertainty;
      case AcceptancePolicy.MANAGED_RISK:
        return this.managedGuardBand(ratio, expandedUncertainty);
      default:
        throw new Error(`no guard band rule for the ${String(policy)} policy`);
    }
  }

  /**
   * The guard band shrinks linearly to nothing as the ratio climbs to the
   * target, and is capped at the whole expanded uncertainty below a ratio of
   * one. A better instrument than the target therefore costs the customer
   * nothing, which is what makes the policy sellable.
   */
  private managedGuardBand(ratio: number, expandedUncertainty: number): number {
    if (!Number.isFinite(ratio) || ratio >= TARGET_RATIO) {
      return 0;
    }
    const fraction = Math.min(1, Math.max(0, 1 - ratio / TARGET_RATIO));
    return toScale(expandedUncertainty * fraction, LIMIT_SCALE);
  }
}
