import { Tone } from '@shared/tone';

export interface ReviewPeriod {
  readonly from: string;
  readonly to: string;
}

export interface ManagementReview {
  readonly period: ReviewPeriod;
  readonly preparedOn: string;
  readonly scope: {
    readonly liveLines: number;
    readonly lapsedInPeriod: number;
    readonly disciplinesCovered: readonly string[];
    readonly workedButUnaccredited: readonly string[];
  };
  readonly capa: {
    readonly raised: number;
    readonly closed: number;
    readonly openAtEnd: number;
    readonly overdueAtEnd: number;
    readonly bySource: Readonly<Record<string, number>>;
    readonly medianDaysToClose: number | null;
  };
  readonly proficiency: {
    readonly roundsScored: number;
    readonly satisfactory: number;
    readonly questionable: number;
    readonly unsatisfactory: number;
    readonly outstanding: number;
  };
  readonly resources: {
    readonly instrumentsInService: number;
    readonly referenceStandards: number;
    readonly overdue: number;
    readonly quarantined: number;
    readonly peopleAuthorised: number;
    readonly authorisationsExpiringSoon: number;
    readonly disciplinesWithoutAnApprover: readonly string[];
  };
  readonly workload: {
    readonly jobsReceived: number;
    readonly jobsDispatched: number;
    readonly lateOnDispatch: number;
    readonly certificatesIssued: number;
    readonly certificatesWithdrawn: number;
    readonly outOfToleranceFound: number;
  };
  readonly environment: {
    readonly excursions: number;
    readonly major: number;
    readonly unassessed: number;
    readonly certificatesPutInQuestion: number;
  };
  readonly talkingPoints: readonly string[];
}

/** One number on the pack, with the words that go under it. */
export interface ReviewFigure {
  readonly label: string;
  readonly value: number | string;
  readonly tone: Tone;
}

export interface ReviewSection {
  readonly heading: string;
  /** The clause of the standard this section answers. */
  readonly clause: string;
  readonly figures: readonly ReviewFigure[];
}

function count(label: string, value: number, badAbove = 0): ReviewFigure {
  return { label, value, tone: value > badAbove ? 'bad' : 'quiet' };
}

function plain(label: string, value: number | string): ReviewFigure {
  return { label, value, tone: 'quiet' };
}

/**
 * The pack laid out as the meeting reads it.
 *
 * <p>Every section names the clause it answers. The pack is read beside the
 * standard once a year by somebody checking that each input is there, and
 * making them map section headings onto clause numbers by memory is how one of
 * them gets missed.
 */
export function sectionsOf(review: ManagementReview): readonly ReviewSection[] {
  return [
    {
      heading: 'Schedule of accreditation',
      clause: '8.9.2 b',
      figures: [
        plain('live lines', review.scope.liveLines),
        plain('disciplines covered', review.scope.disciplinesCovered.length),
        count('lapsed in the period', review.scope.lapsedInPeriod),
        count('worked without a line', review.scope.workedButUnaccredited.length),
      ],
    },
    {
      heading: 'Corrective action',
      clause: '8.9.2 d',
      figures: [
        plain('raised', review.capa.raised),
        plain('closed', review.capa.closed),
        count('open at the end', review.capa.openAtEnd),
        count('past their date', review.capa.overdueAtEnd),
        plain(
          'median days to close',
          review.capa.medianDaysToClose === null ? 'none closed' : review.capa.medianDaysToClose,
        ),
      ],
    },
    {
      heading: 'Interlaboratory comparison',
      clause: '8.9.2 f',
      figures: [
        plain('rounds scored', review.proficiency.roundsScored),
        plain('satisfactory', review.proficiency.satisfactory),
        count('questionable', review.proficiency.questionable),
        count('unsatisfactory', review.proficiency.unsatisfactory),
        plain('still open', review.proficiency.outstanding),
      ],
    },
    {
      heading: 'Resources',
      clause: '8.9.2 h',
      figures: [
        plain('instruments in service', review.resources.instrumentsInService),
        plain('reference standards', review.resources.referenceStandards),
        count('past their recall date', review.resources.overdue),
        count('quarantined', review.resources.quarantined),
        plain('people authorised', review.resources.peopleAuthorised),
        count('authorisations running out', review.resources.authorisationsExpiringSoon),
      ],
    },
    {
      heading: 'Customer work',
      clause: '8.9.2 i',
      figures: [
        plain('jobs received', review.workload.jobsReceived),
        plain('jobs dispatched', review.workload.jobsDispatched),
        count('went back late', review.workload.lateOnDispatch),
        plain('certificates issued', review.workload.certificatesIssued),
        count('certificates withdrawn', review.workload.certificatesWithdrawn),
        count('found out of tolerance', review.workload.outOfToleranceFound),
      ],
    },
    {
      heading: 'Conditions',
      clause: '8.9.2 j',
      figures: [
        plain('excursions', review.environment.excursions),
        count('major', review.environment.major),
        count('not yet assessed', review.environment.unassessed),
        count('certificates in question', review.environment.certificatesPutInQuestion),
      ],
    },
  ];
}

/** True when the pack raised nothing but the standing note. */
export function isQuiet(review: ManagementReview): boolean {
  return (
    review.talkingPoints.length === 1 &&
    review.talkingPoints[0].startsWith('Nothing in the register')
  );
}

/** The period, in the words the meeting minutes use. */
export function periodInWords(period: ReviewPeriod): string {
  return `${period.from} to ${period.to}`;
}

/** The last complete calendar year, which is what the meeting usually wants. */
export function lastCalendarYear(today: string): ReviewPeriod {
  const year = Number(today.slice(0, 4)) - 1;

  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
