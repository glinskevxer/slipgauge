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
