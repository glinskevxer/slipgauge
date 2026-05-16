/**
 * The management review pack, as clause 8.9 lists its inputs.
 *
 * <p>The shape is here, on its own, because the pack is the one thing in the
 * register that reads every other part of it. Keeping the shape away from the
 * service that fills it in means the list of inputs can be read against the
 * standard without wading through eleven queries.
 */

export interface ReviewPeriod {
  readonly from: string;
  readonly to: string;
}

/** Clause 8.9.2 b), the suitability of policies and procedures. */
export interface ScopeInput {
  readonly liveLines: number;
  readonly lapsedInPeriod: number;
  readonly disciplinesCovered: readonly string[];
  /** Disciplines the laboratory works in with nothing on the schedule. */
  readonly workedButUnaccredited: readonly string[];
}

/** Clause 8.9.2 d), the status of corrective actions. */
export interface CapaInput {
  readonly raised: number;
  readonly closed: number;
  readonly openAtEnd: number;
  readonly overdueAtEnd: number;
  readonly bySource: Readonly<Record<string, number>>;
  /** Days from raising to closing, for the ones closed in the period. */
  readonly medianDaysToClose: number | null;
}

/** Clause 8.9.2 f), the results of interlaboratory comparisons. */
export interface ProficiencyInput {
  readonly roundsScored: number;
  readonly satisfactory: number;
  readonly questionable: number;
  readonly unsatisfactory: number;
  readonly outstanding: number;
}

/** Clause 8.9.2 h), the adequacy of resources. */
export interface ResourceInput {
  readonly instrumentsInService: number;
  readonly referenceStandards: number;
  readonly overdue: number;
  readonly quarantined: number;
  readonly peopleAuthorised: number;
  readonly authorisationsExpiringSoon: number;
  readonly disciplinesWithoutAnApprover: readonly string[];
}

/** Clause 8.9.2 i), customer work and feedback. */
export interface WorkloadInput {
  readonly jobsReceived: number;
  readonly jobsDispatched: number;
  readonly lateOnDispatch: number;
  readonly certificatesIssued: number;
  readonly certificatesWithdrawn: number;
  readonly outOfToleranceFound: number;
}

/** Clause 8.9.2 j) and k), the conditions the work was done in. */
export interface EnvironmentInput {
  readonly excursions: number;
  readonly major: number;
  readonly unassessed: number;
  readonly certificatesPutInQuestion: number;
}

export interface ManagementReview {
  readonly period: ReviewPeriod;
  readonly preparedOn: string;
  readonly scope: ScopeInput;
  readonly capa: CapaInput;
  readonly proficiency: ProficiencyInput;
  readonly resources: ResourceInput;
  readonly workload: WorkloadInput;
  readonly environment: EnvironmentInput;
  /** What the pack itself says is worth the meeting's time. */
  readonly talkingPoints: readonly string[];
}

/**
 * The median, which is what a turnaround is reported as rather than the mean.
 *
 * <p>One job that sat on a shelf for eight months drags a mean far enough to
 * make a good quarter look bad, and the meeting then spends its time on the
 * one job instead of the ninety.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

/**
 * What the pack raises on its own.
 *
 * <p>Written from the numbers rather than typed by whoever prepared it. A pack
 * whose talking points are typed is a pack whose talking points are whatever
 * the person preparing it already wanted to talk about, and the two or three
 * they did not want to are the ones the meeting exists for.
 */
export function talkingPointsFor(review: Omit<ManagementReview, 'talkingPoints'>): string[] {
  const points: string[] = [];

  if (review.resources.disciplinesWithoutAnApprover.length > 0) {
    points.push(
      `Nobody can approve work in ${review.resources.disciplinesWithoutAnApprover
        .join(', ')
        .toLowerCase()}.`,
    );
  }
  if (review.resources.authorisationsExpiringSoon > 0) {
    points.push(
      `${review.resources.authorisationsExpiringSoon} authorisation(s) run out inside sixty days.`,
    );
  }
  if (review.scope.workedButUnaccredited.length > 0) {
    points.push(
      `Work is being done in ${review.scope.workedButUnaccredited
        .join(', ')
        .toLowerCase()} with nothing on the schedule of accreditation.`,
    );
  }
  if (review.capa.overdueAtEnd > 0) {
    points.push(`${review.capa.overdueAtEnd} nonconformance(s) are past their date.`);
  }
  if (review.capa.raised > review.capa.closed) {
    points.push(
      `More nonconformances were raised than closed: ${review.capa.raised} against ${review.capa.closed}.`,
    );
  }
  if (review.proficiency.unsatisfactory > 0) {
    points.push(
      `${review.proficiency.unsatisfactory} proficiency result(s) came back unsatisfactory.`,
    );
  }
  if (review.proficiency.roundsScored === 0) {
    points.push('No proficiency round was scored in the period.');
  }
  if (review.environment.major > 0) {
    points.push(
      `${review.environment.major} major room excursion(s), touching ` +
        `${review.environment.certificatesPutInQuestion} certificate(s).`,
    );
  }
  if (review.environment.unassessed > 0) {
    points.push(`${review.environment.unassessed} excursion(s) have not been looked at.`);
  }
  if (review.resources.overdue > 0) {
    points.push(`${review.resources.overdue} instrument(s) are past their recall date.`);
  }
  if (review.workload.lateOnDispatch > 0) {
    points.push(`${review.workload.lateOnDispatch} job(s) went back late.`);
  }
  if (review.workload.certificatesWithdrawn > 0) {
    points.push(
      `${review.workload.certificatesWithdrawn} certificate(s) were withdrawn in the period.`,
    );
  }
  if (points.length === 0) {
    points.push('Nothing in the register raised itself for this meeting.');
  }
  return points;
}
