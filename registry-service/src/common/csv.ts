/**
 * Comma separated values, written by hand.
 *
 * <p>The format is small enough that a dependency would be a liability rather
 * than a saving: the three things that actually break an export are quoting,
 * the leading character Excel treats as a formula, and the byte order mark
 * Excel wants before it will believe a file is UTF-8. A library gets the first
 * one right and leaves the other two to the caller anyway.
 */

/** Excel reads a file with no mark as the local code page and mangles it. */
export const UTF8_BOM = '﻿';

/** Excel will evaluate a cell starting with any of these. */
const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];

export interface CsvColumn<T> {
  readonly header: string;
  readonly value: (row: T) => string | number | boolean | null | undefined;
}

/**
 * One cell, quoted only when it has to be. A file where every cell is quoted
 * is valid and unreadable in a text editor, and these get read in text editors
 * when somebody is arguing about a number.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  const guarded = FORMULA_STARTERS.some((start) => text.startsWith(start)) ? `'${text}` : text;

  if (!/[",\n\r]/.test(guarded)) {
    return guarded;
  }
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly (string | number | boolean | null | undefined)[]): string {
  return values.map((value) => csvCell(value)).join(',');
}

/**
 * A whole file. Rows are separated by CRLF because that is what RFC 4180 says
 * and what the two spreadsheet programs in the laboratory both expect.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [csvRow(columns.map((column) => column.header))];

  for (const row of rows) {
    lines.push(csvRow(columns.map((column) => column.value(row))));
  }
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
}

/**
 * A filename with the date in it, because these end up in a downloads folder
 * next to nine other exports of the same thing.
 */
export function exportFilename(what: string, on: string): string {
  const safe = what.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return `${safe}-${on}.csv`;
}

/** The header that makes a browser save the file rather than render it. */
export function contentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

/**
 * Reading a file back in.
 *
 * <p>The writing half of this module has been here since the first export. The
 * reading half arrived with the bulk import, and it is here rather than in the
 * import service because the two halves have to agree about quoting: a file
 * this laboratory exported and then edited has to come back in, and a reader
 * that did not understand the writer's own escaping would refuse the laboratory
 * its own data.
 */

/** A parse that failed, with the line it failed on. */
export class CsvFormatError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line}: ${message}`);
    this.name = 'CsvFormatError';
  }
}

/**
 * Splits one line into cells.
 *
 * <p>A quoted cell may contain commas, newlines and doubled quotes. Everything
 * else is taken literally, including the apostrophe the writer puts in front of
 * a cell Excel would otherwise evaluate: the apostrophe is stripped on the way
 * back in so a round trip does not accumulate them.
 */
export function parseCsvLine(line: string, lineNumber = 1): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;

  while (index < line.length) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += character;
      index += 1;
      continue;
    }
    if (character === '"') {
      if (cell.length > 0) {
        throw new CsvFormatError(lineNumber, 'a quote may only open a cell');
      }
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ',') {
      cells.push(unguard(cell));
      cell = '';
      index += 1;
      continue;
    }
    cell += character;
    index += 1;
  }

  if (quoted) {
    throw new CsvFormatError(lineNumber, 'a quoted cell was never closed');
  }
  cells.push(unguard(cell));
  return cells;
}

/** One row of a parsed file, keyed by header, with the line it came from. */
export interface CsvRecord {
  readonly line: number;
  readonly cells: Readonly<Record<string, string>>;
}

export interface CsvParse {
  readonly headers: readonly string[];
  readonly records: readonly CsvRecord[];
}

/**
 * A whole file, headers and all.
 *
 * <p>A row with the wrong number of cells is a format error rather than a
 * silently short row: a spreadsheet that has had a column inserted is exactly
 * the file somebody uploads by mistake, and taking it column by position would
 * import the serial numbers into the model field.
 */
export function parseCsv(text: string): CsvParse {
  const body = text.replace(/^﻿/, '');
  const lines = body.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = parseCsvLine(lines[0], 1).map((header) => header.trim());
  const records: CsvRecord[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const cells = parseCsvLine(lines[index], lineNumber);

    if (cells.length !== headers.length) {
      throw new CsvFormatError(
        lineNumber,
        `expected ${headers.length} cells but found ${cells.length}`,
      );
    }
    const keyed: Record<string, string> = {};

    headers.forEach((header, position) => {
      keyed[header] = cells[position].trim();
    });
    records.push({ line: lineNumber, cells: keyed });
  }
  return { headers, records };
}

/** Headers the caller needs that the file does not have. */
export function missingHeaders(
  parse: CsvParse,
  required: readonly string[],
): readonly string[] {
  const held = new Set(parse.headers);

  return required.filter((header) => !held.has(header));
}

/** Drops the apostrophe the writer adds in front of a formula looking cell. */
function unguard(cell: string): string {
  if (cell.length > 1 && cell.startsWith("'")) {
    return FORMULA_STARTERS.some((start) => cell.startsWith(`'${start}`)) ? cell.slice(1) : cell;
  }
  return cell;
}
