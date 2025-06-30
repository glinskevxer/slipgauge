/**
 * CSV the accreditation assessor can open in a spreadsheet without arguing
 * with it. Written here rather than pulled in, because the only awkward parts
 * are the ones a general library gets wrong for this audience: a leading
 * apostrophe on anything that looks like a formula, and a byte order mark so
 * Excel stops mangling the degree sign in the unit column.
 */

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly value: (row: T) => unknown;
}

const SEPARATOR = ',';
const NEWLINE = '\r\n';
const BOM = '﻿';

/** Cells beginning with any of these are read as a formula by a spreadsheet. */
const FORMULA_STARTS = ['=', '+', '-', '@', '\t', '\r'];

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);

  if (FORMULA_STARTS.some((start) => text.startsWith(start))) {
    text = `'${text}`;
  }
  if (text.includes('"') || text.includes(SEPARATOR) || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: readonly T[], columns: ReadonlyArray<Column<T>>): string {
  const header = columns.map((column) => escapeCell(column.header)).join(SEPARATOR);
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(SEPARATOR),
  );
  return BOM + [header, ...body].join(NEWLINE) + NEWLINE;
}

/**
 * A file name a person can find again. Spaces and colons are replaced because
 * the bench terminals write to a Windows share that refuses both.
 */
export function exportFileName(what: string, on = new Date()): string {
  const stamp = on.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const cleaned = what
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `slipgauge-${cleaned}-${stamp}.csv`;
}

/**
 * Hands the browser a file. Kept behind a function so the one place that
 * touches the DOM for this is testable, and so a future server side export can
 * replace it without every caller changing.
 */
export function downloadCsv(content: string, fileName: string, doc: Document = document): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  doc.body.appendChild(anchor);
  anchor.click();
  doc.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
