/**
 * What a bulk import found, line by line.
 *
 * <p>Separate from the importer so the report can be produced without writing
 * anything. A dry run and a real run are the same walk over the same file, and
 * a laboratory that cannot see what an import will do before it does it will
 * not use the import.
 */

export enum ImportVerdict {
  /** Would be created. */
  NEW = 'NEW',
  /** Already in the register, matched on make, model and serial. */
  DUPLICATE = 'DUPLICATE',
  /** Cannot be imported, and says why. */
  REJECTED = 'REJECTED',
}

export interface ImportLine {
  readonly line: number;
  readonly verdict: ImportVerdict;
  /** What the line describes, for the report. */
  readonly describes: string;
  /** The asset tag it was created as, or the one it clashed with. */
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

export function summarise(lines: readonly ImportLine[], dryRun: boolean): ImportReport {
  return {
    dryRun,
    lines,
    created: lines.filter((line) => line.verdict === ImportVerdict.NEW).length,
    duplicates: lines.filter((line) => line.verdict === ImportVerdict.DUPLICATE).length,
    rejected: lines.filter((line) => line.verdict === ImportVerdict.REJECTED).length,
  };
}

/** The columns the importer needs, in the order the template writes them. */
export const REQUIRED_COLUMNS: readonly string[] = [
  'classCode',
  'manufacturer',
  'model',
  'serialNumber',
  'unit',
  'rangeLow',
  'rangeHigh',
  'resolution',
  'acquiredOn',
];

/** The ones it will use if they are there. */
export const OPTIONAL_COLUMNS: readonly string[] = [
  'description',
  'locationCode',
  'custodian',
  'referenceStandard',
];

/**
 * What one line is missing or has wrong, before anything touches the database.
 *
 * <p>Every problem on a line is reported, not the first. Somebody fixing a
 * spreadsheet of four hundred rows wants one pass, and a report that names one
 * fault per row makes them upload it seven times.
 */
export function checkLine(cells: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];

  for (const column of REQUIRED_COLUMNS) {
    if (!cells[column]) {
      problems.push(`${column} is empty`);
    }
  }

  const low = Number(cells['rangeLow']);
  const high = Number(cells['rangeHigh']);
  const resolution = Number(cells['resolution']);

  if (cells['rangeLow'] && !Number.isFinite(low)) {
    problems.push('rangeLow is not a number');
  }
  if (cells['rangeHigh'] && !Number.isFinite(high)) {
    problems.push('rangeHigh is not a number');
  }
  if (Number.isFinite(low) && Number.isFinite(high) && low >= high) {
    problems.push('rangeLow has to sit below rangeHigh');
  }
  if (cells['resolution'] && (!Number.isFinite(resolution) || resolution <= 0)) {
    problems.push('resolution has to be a positive number');
  }
  if (cells['acquiredOn'] && !/^\d{4}-\d{2}-\d{2}$/.test(cells['acquiredOn'])) {
    problems.push('acquiredOn has to be written as yyyy-mm-dd');
  }
  const reference = cells['referenceStandard'];

  if (reference && !['true', 'false', 'yes', 'no', '1', '0'].includes(reference.toLowerCase())) {
    problems.push('referenceStandard has to be true or false');
  }
  return problems;
}

/** How a line reads on the report when it has no asset tag yet. */
export function describeLine(cells: Readonly<Record<string, string>>): string {
  const parts = [cells['manufacturer'], cells['model']].filter(Boolean);
  const serial = cells['serialNumber'];

  const made = parts.length ? parts.join(' ') : 'an unnamed item';

  return serial ? `${made}, s/n ${serial}` : made;
}

/** Reads the spreadsheet's idea of a boolean, which is not always a boolean. */
export function readBoolean(value: string | undefined): boolean {
  return ['true', 'yes', '1'].includes((value ?? '').toLowerCase());
}
