import { Tone } from '@shared/tone';

export type ImportVerdict = 'NEW' | 'DUPLICATE' | 'REJECTED';

export interface ImportLine {
  readonly line: number;
  readonly verdict: ImportVerdict;
  readonly describes: string;
  readonly assetTag: string | null;
  readonly problems: readonly string[];
}

export interface ImportReport {
  readonly dryRun: boolean;
  readonly lines: readonly ImportLine[];
  readonly created: number;
  readonly duplicates: number;
  readonly rejected: number;
}

const VERDICT_LABELS: Readonly<Record<ImportVerdict, string>> = {
  NEW: 'Would be added',
  DUPLICATE: 'Already held',
  REJECTED: 'Cannot be added',
};

const COMMITTED_LABELS: Readonly<Record<ImportVerdict, string>> = {
  NEW: 'Added',
  DUPLICATE: 'Already held',
  REJECTED: 'Left out',
};

/**
 * How a verdict reads. Different words before and after the import, because
 * "would be added" on a screen showing what has already happened is the kind of
 * wording that makes somebody run the import a second time.
 */
export function verdictLabel(verdict: ImportVerdict, dryRun: boolean): string {
  return (dryRun ? VERDICT_LABELS : COMMITTED_LABELS)[verdict] ?? verdict;
}

export function verdictTone(verdict: ImportVerdict): Tone {
  switch (verdict) {
    case 'NEW':
      return 'ok';
    case 'DUPLICATE':
      return 'quiet';
    default:
      return 'bad';
  }
}

/** True when running the import for real would change anything. */
export function worthCommitting(report: ImportReport | null): boolean {
  return report !== null && report.dryRun && report.created > 0;
}

/** The lines somebody has to fix, worst first, so the report opens on them. */
export function problemsFirst(report: ImportReport): readonly ImportLine[] {
  const rank: Readonly<Record<ImportVerdict, number>> = { REJECTED: 0, DUPLICATE: 1, NEW: 2 };

  return [...report.lines].sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || a.line - b.line,
  );
}

/**
 * A one line summary in the words the operator would use.
 *
 * <p>Says nothing at all about lines that were fine when everything was fine,
 * because "0 rejected" is a number somebody has to read to find out there is
 * nothing to read.
 */
export function summaryInWords(report: ImportReport): string {
  const parts: string[] = [];

  parts.push(
    report.dryRun
      ? `${report.created} would be added`
      : `${report.created} added`,
  );
  if (report.duplicates > 0) {
    parts.push(`${report.duplicates} already held`);
  }
  if (report.rejected > 0) {
    parts.push(`${report.rejected} could not be read`);
  }
  return parts.join(', ');
}

/** The first few lines of a file, for the operator to check before sending it. */
export function previewOf(text: string, rows = 5): readonly string[] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0)
    .slice(0, rows + 1);
}

/** How many rows a file holds, not counting its header. */
export function rowCount(text: string): number {
  return Math.max(0, previewOf(text, Number.MAX_SAFE_INTEGER).length - 1);
}
