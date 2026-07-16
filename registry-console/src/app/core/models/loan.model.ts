import { Tone } from '@shared/tone';
import { ItemCondition } from './job.model';

export interface LoanView {
  readonly id: number;
  readonly assetTag: string;
  readonly borrower: string;
  readonly destination: string;
  readonly purpose: string | null;
  readonly issuedOn: string;
  readonly dueBackOn: string;
  readonly returnedOn: string | null;
  readonly issuedBy: string;
  readonly receivedBy: string | null;
  readonly conditionOut: ItemCondition;
  readonly conditionBack: ItemCondition | null;
  readonly note: string | null;
  readonly out: boolean;
  readonly lateness: number;
  readonly overdue: boolean;
  readonly cameBackWorse: boolean;
  readonly summary: string;
}

/**
 * How late a loan reads.
 *
 * <p>A loan that came back late is worth seeing but is not a problem any more,
 * so it goes quiet once it is in. Only something still out and past its date
 * is coloured, because that is the only line anybody can do something about.
 */
export function latenessTone(loan: LoanView): Tone {
  if (!loan.out) {
    return loan.cameBackWorse ? 'bad' : 'quiet';
  }
  if (loan.overdue) {
    return 'bad';
  }
  return loan.lateness >= -1 ? 'warn' : 'quiet';
}

export function latenessInWords(loan: LoanView): string {
  const days = loan.lateness;

  if (!loan.out) {
    return days > 0 ? `came back ${days} day${days === 1 ? '' : 's'} late` : 'back on time';
  }
  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} overdue`;
  }
  if (days === 0) {
    return 'due back today';
  }
  const left = Math.abs(days);
  return `${left} day${left === 1 ? '' : 's'} to go`;
}

/** How the two conditions read together, or null when it is still out. */
export function conditionInWords(loan: LoanView): string | null {
  if (loan.conditionBack === null) {
    return null;
  }
  if (loan.conditionOut === loan.conditionBack) {
    return `went and came back ${loan.conditionBack.toLowerCase()}`;
  }
  return `went out ${loan.conditionOut.toLowerCase()}, came back ${loan.conditionBack.toLowerCase()}`;
}

/** Overdue first, then closest to its date, then oldest. */
export function worstFirst(loans: readonly LoanView[]): readonly LoanView[] {
  return [...loans].sort(
    (a, b) => b.lateness - a.lateness || a.dueBackOn.localeCompare(b.dueBackOn),
  );
}

/** The counts across the top of the panel. */
export function tallyOf(loans: readonly LoanView[]): {
  readonly out: number;
  readonly overdue: number;
  readonly dueThisWeek: number;
} {
  const out = loans.filter((loan) => loan.out);

  return {
    out: out.length,
    overdue: out.filter((loan) => loan.overdue).length,
    dueThisWeek: out.filter((loan) => !loan.overdue && loan.lateness >= -7).length,
  };
}
