import {
  CsvFormatError,
  csvRow,
  missingHeaders,
  parseCsv,
  parseCsvLine,
  toCsv,
} from '@registry/common/csv';

describe('splitting a line into cells', () => {
  it('takes plain cells', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps an empty cell rather than dropping it', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
    expect(parseCsvLine(',,')).toEqual(['', '', '']);
  });

  it('reads a comma inside quotes as part of the cell', () => {
    expect(parseCsvLine('"Mitutoyo, Japan",103-137')).toEqual(['Mitutoyo, Japan', '103-137']);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsvLine('"he said ""no""",b')).toEqual(['he said "no"', 'b']);
  });

  it('strips the apostrophe the writer adds in front of a formula', () => {
    expect(parseCsvLine("'=SUM(A1),b")).toEqual(['=SUM(A1)', 'b']);
    expect(parseCsvLine("'-25,b")).toEqual(['-25', 'b']);
  });

  it('leaves an apostrophe that was part of the data alone', () => {
    expect(parseCsvLine("O'Brien,b")).toEqual(["O'Brien", 'b']);
    expect(parseCsvLine("'Brien,b")).toEqual(["'Brien", 'b']);
  });

  it('refuses a quote that opens in the middle of a cell', () => {
    expect(() => parseCsvLine('ab"c",d', 4)).toThrow(CsvFormatError);
    expect(() => parseCsvLine('ab"c",d', 4)).toThrow(/line 4/);
  });

  it('refuses a quoted cell that never closes', () => {
    expect(() => parseCsvLine('"never mind')).toThrow(/never closed/);
  });
});

describe('reading a whole file', () => {
  const FILE =
    'assetTag,manufacturer,model\r\n' +
    'SG-0001,Mitutoyo,103-137\r\n' +
    'SG-0002,"Tesa, Swiss",00530001\r\n';

  it('keys every row by header', () => {
    const parse = parseCsv(FILE);

    expect(parse.headers).toEqual(['assetTag', 'manufacturer', 'model']);
    expect(parse.records).toHaveLength(2);
    expect(parse.records[0].cells).toEqual({
      assetTag: 'SG-0001',
      manufacturer: 'Mitutoyo',
      model: '103-137',
    });
  });

  it('keeps the line each row came from, for the report', () => {
    expect(parseCsv(FILE).records.map((row) => row.line)).toEqual([2, 3]);
  });

  it('eats the byte order mark rather than putting it in the first header', () => {
    expect(parseCsv(`﻿${FILE}`).headers[0]).toBe('assetTag');
  });

  it('reads a file written with plain newlines', () => {
    expect(parseCsv(FILE.replace(/\r\n/g, '\n')).records).toHaveLength(2);
  });

  it('skips blank lines rather than reading them as short rows', () => {
    expect(parseCsv(`${FILE}\r\n\r\n`).records).toHaveLength(2);
  });

  it('trims the cells, because a spreadsheet pads them', () => {
    expect(parseCsv('a,b\r\n  x  ,  y  \r\n').records[0].cells).toEqual({ a: 'x', b: 'y' });
  });

  it('refuses a row with the wrong number of cells', () => {
    expect(() => parseCsv('a,b,c\r\nx,y\r\n')).toThrow(/line 2: expected 3 cells but found 2/);
  });

  it('reads an empty file as nothing rather than failing', () => {
    expect(parseCsv('')).toEqual({ headers: [], records: [] });
    expect(parseCsv('\r\n')).toEqual({ headers: [], records: [] });
  });

  it('reads a file with headers and no rows', () => {
    const parse = parseCsv('a,b\r\n');

    expect(parse.headers).toEqual(['a', 'b']);
    expect(parse.records).toHaveLength(0);
  });
});

describe('checking the headers', () => {
  it('names what is missing, in the order asked for', () => {
    const parse = parseCsv('assetTag,model\r\n');

    expect(missingHeaders(parse, ['assetTag', 'manufacturer', 'serialNumber'])).toEqual([
      'manufacturer',
      'serialNumber',
    ]);
  });

  it('says nothing when everything is there', () => {
    const parse = parseCsv('a,b,c\r\n');

    expect(missingHeaders(parse, ['a', 'c'])).toHaveLength(0);
  });
});

describe('a round trip', () => {
  it('reads back what the writer wrote, including the awkward cells', () => {
    const rows = [
      { name: 'Mitutoyo, Japan', note: 'he said "no"', formula: '=SUM(A1)', blank: '' },
    ];
    const file = toCsv(rows, [
      { header: 'name', value: (row) => row.name },
      { header: 'note', value: (row) => row.note },
      { header: 'formula', value: (row) => row.formula },
      { header: 'blank', value: (row) => row.blank },
    ]);

    const parse = parseCsv(file);

    expect(parse.records[0].cells).toEqual({
      name: 'Mitutoyo, Japan',
      note: 'he said "no"',
      formula: '=SUM(A1)',
      blank: '',
    });
  });

  it('does not accumulate guards over two round trips', () => {
    const once = parseCsv(`formula\r\n${csvRow(['=SUM(A1)'])}\r\n`);
    const twice = parseCsv(`formula\r\n${csvRow([once.records[0].cells['formula']])}\r\n`);

    expect(twice.records[0].cells['formula']).toBe('=SUM(A1)');
  });
});
