import { AcceptancePolicy } from './acceptance-policy';
import { ToleranceBand } from './tolerance-band';
import { Verdict } from './verdict';

/**
 * Everything that went into judging one measurement point, kept together so a
 * customer query years later can be answered from the record rather than by
 * rerunning today's rules against yesterday's reading.
 */
export class ConformityDecision {
  constructor(
    /** The judgement itself. */
    readonly verdict: Verdict,
    /** The reading that was judged, null when nothing was taken. */
    readonly measured: number | null,
    /** The permitted window from the profile. */
    readonly tolerance: ToleranceBand,
    /** The window after the guard band was applied. */
    readonly acceptance: ToleranceBand,
    /** How far each limit was pulled in. */
    readonly guardBand: number,
    /** The expanded uncertainty the ratio was worked out from. */
    readonly expandedU: number,
    /** Tolerance half width over expanded uncertainty. */
    readonly testRatio: number,
    /** Which acceptance rule produced the guard band. */
    readonly policy: AcceptancePolicy,
    /** How far outside tolerance the reading fell, zero if inside. */
    readonly excursion: number,
  ) {
    Object.freeze(this);
  }

  guarded(): boolean {
    return this.guardBand > 0;
  }

  /**
   * True when the point passed only because the laboratory chose not to guard
   * band it. The quality manager's monthly review pulls these out, because
   * every one is a pass the customer is carrying the risk on.
   */
  passedOnSharedRisk(): boolean {
    if (
      this.verdict !== Verdict.PASS ||
      this.policy !== AcceptancePolicy.SHARED_RISK ||
      this.measured === null ||
      this.expandedU === 0
    ) {
      return false;
    }
    return !this.tolerance.shrunkBy(this.expandedU).contains(this.measured);
  }

  /** True when the ratio is too poor for the laboratory to state conformity. */
  unstatable(): boolean {
    return this.verdict === Verdict.INDETERMINATE;
  }
}
