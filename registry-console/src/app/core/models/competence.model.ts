import { Tone } from '@shared/tone';
import { Discipline } from './instrument.model';

export type CompetenceLevel = 'TRAINEE' | 'AUTHORISED' | 'APPROVER';

export interface CompetenceView {
  readonly id: number;
  readonly person: string;
  readonly discipline: Discipline;
  readonly classCode: string | null;
  readonly className: string | null;
  readonly level: CompetenceLevel;
  readonly rangeLow: number | null;
  readonly rangeHigh: number | null;
  readonly authorisedFrom: string;
  readonly authorisedTo: string | null;
  readonly grantedBy: string;
  readonly evidence: string | null;
  readonly withdrawn: boolean;
  readonly withdrawnReason: string | null;
  readonly live: boolean;
  readonly daysRemaining: number | null;
}

export interface CompetenceCell {
  readonly person: string;
  readonly discipline: Discipline;
  readonly level: CompetenceLevel | null;
  readonly expiresOn: string | null;
  readonly grants: number;
}

export interface CompetenceMatrix {
  readonly people: readonly string[];
  readonly disciplines: readonly Discipline[];
  readonly cells: readonly CompetenceCell[];
}

const LEVEL_LABELS: Readonly<Record<CompetenceLevel, string>> = {
  TRAINEE: 'Under supervision',
  AUTHORISED: 'Authorised',
  APPROVER: 'Approves',
};

/**
 * The short form for a matrix cell. The matrix is eight columns wide and the
 * full words do not fit, so the cell carries the initial and the title carries
 * the sentence.
 */
const LEVEL_MARKS: Readonly<Record<CompetenceLevel, string>> = {
  TRAINEE: 'T',
  AUTHORISED: 'A',
  APPROVER: 'S',
};

export function levelLabel(level: CompetenceLevel | null): string {
  return level === null ? 'Nothing held' : (LEVEL_LABELS[level] ?? level);
}

export function levelMark(level: CompetenceLevel | null): string {
  return level === null ? '' : (LEVEL_MARKS[level] ?? '?');
}

/**
 * How a cell reads.
 *
 * <p>An authorisation that is about to run out is the thing the quality manager
 * is looking for, so the expiry beats the level: an approver whose
 * authorisation ends next week is a worse problem than a trainee.
 */
export function cellTone(cell: CompetenceCell, daysToExpiry: number | null): Tone {
  if (cell.level === null) {
    return 'unknown';
  }
  if (daysToExpiry !== null) {
    if (daysToExpiry < 0) {
      return 'bad';
    }
    if (daysToExpiry <= 30) {
      return 'warn';
    }
  }
  return cell.level === 'TRAINEE' ? 'quiet' : 'ok';
}

/** Calendar days from today to an ISO date, negative once it has gone by. */
export function daysUntil(iso: string | null, today: string): number | null {
  if (iso === null) {
    return null;
  }
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${iso}T00:00:00Z`);

  if (Number.isNaN(from) || Number.isNaN(to)) {
    return null;
  }
  return Math.round((to - from) / 86_400_000);
}

/** How the remaining time reads on the renewal list. */
export function remainingInWords(days: number | null): string {
  if (days === null) {
    return 'no end date';
  }
  if (days < 0) {
    const over = Math.abs(days);
    return `ran out ${over} day${over === 1 ? '' : 's'} ago`;
  }
  if (days === 0) {
    return 'runs out today';
  }
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** How the span reads when the grant is bounded. */
export function spanInWords(record: Pick<CompetenceView, 'rangeLow' | 'rangeHigh'>): string | null {
  if (record.rangeLow === null || record.rangeHigh === null) {
    return null;
  }
  return `${record.rangeLow} to ${record.rangeHigh}`;
}

/** Every cell for one person, in the column order the matrix uses. */
export function rowFor(
  matrix: CompetenceMatrix,
  person: string,
): ReadonlyArray<CompetenceCell | null> {
  return matrix.disciplines.map(
    (discipline) =>
      matrix.cells.find((cell) => cell.person === person && cell.discipline === discipline) ?? null,
  );
}

/** How many people hold something in a discipline, for the column heading. */
export function depthOf(matrix: CompetenceMatrix, discipline: Discipline): number {
  return matrix.cells.filter((cell) => cell.discipline === discipline && cell.level !== null)
    .length;
}

/** Disciplines nobody is authorised to approve in, which is a single point of failure. */
export function withoutAnApprover(matrix: CompetenceMatrix): readonly Discipline[] {
  return matrix.disciplines.filter(
    (discipline) =>
      matrix.cells.some((cell) => cell.discipline === discipline && cell.level !== null) &&
      !matrix.cells.some(
        (cell) => cell.discipline === discipline && cell.level === 'APPROVER',
      ),
  );
}
