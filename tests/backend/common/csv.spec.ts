import {
  UTF8_BOM,
  contentDisposition,
  csvCell,
  csvRow,
  exportFilename,
  toCsv,
} from '@registry/common/csv';

interface Row {
  readonly tag: string;
  readonly maker: string;
  readonly due: string | null;
}

const COLUMNS = [
  { header: 'Asset tag', value: (row: Row) => row.tag },
  { header: 'Maker', value: (row: Row) => row.maker },
  { header: 'Next due', value: (row: Row) => row.due },
];

describe('writing a cell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('SG-000001')).toBe('SG-000001');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(true)).toBe('true');
  });

  it('writes nothing at all for a missing value', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes a value carrying a comma, a quote or a newline', () => {
    expect(csvCell('Fenwick, Aerospace')).toBe('"Fenwick, Aerospace"');
    expect(csvCell('a "quoted" thing')).toBe('"a ""quoted"" thing"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('does not quote a value that does not need it', () => {
    expect(csvCell("Rachel's micrometer")).toBe("Rachel's micrometer");
  });

  it('defuses a value a spreadsheet would treat as a formula', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+44 1279 000000')).toBe("'+44 1279 000000");
    expect(csvCell('@sheet')).toBe("'@sheet");
  });

  it('defuses a negative number written as text and still quotes when needed', () => {
    expect(csvCell('-0.004, nominal')).toBe('"\'-0.004, nominal"');
  });

  it('leaves a real negative number alone, because a number is not a formula', () => {
    expect(csvCell(-0.004)).toBe("'-0.004");
  });
});

describe('writing a file', () => {
  const rows: Row[] = [
    { tag: 'SG-000001', maker: 'Mitutoyo', due: '2026-02-11' },
    { tag: 'SG-000002', maker: 'Tesa, Brown & Sharpe', due: null },
  ];

  it('starts with the byte order mark excel wants', () => {
    expect(toCsv(rows, COLUMNS).startsWith(UTF8_BOM)).toBe(true);
  });

  it('puts the headers on the first line', () => {
    const lines = toCsv(rows, COLUMNS).slice(UTF8_BOM.length).split('\r\n');

    expect(lines[0]).toBe('Asset tag,Maker,Next due');
  });

  it('separates rows the way the specification asks for', () => {
    const body = toCsv(rows, COLUMNS).slice(UTF8_BOM.length);

    expect(body.split('\r\n')).toEqual([
      'Asset tag,Maker,Next due',
      'SG-000001,Mitutoyo,2026-02-11',
      'SG-000002,"Tesa, Brown & Sharpe",',
      '',
    ]);
  });

  it('writes just the headers for an empty export', () => {
    expect(toCsv([], COLUMNS)).toBe(`${UTF8_BOM}Asset tag,Maker,Next due\r\n`);
  });

  it('writes the columns in the order it was given them', () => {
    const reversed = toCsv(rows, [...COLUMNS].reverse()).slice(UTF8_BOM.length);

    expect(reversed.split('\r\n')[0]).toBe('Next due,Maker,Asset tag');
  });

  it('writes a bare row without the headers', () => {
    expect(csvRow(['a', 1, null])).toBe('a,1,');
  });
});

describe('naming the file it goes into', () => {
  it('puts the date in the name, because a downloads folder has nine of these', () => {
    expect(exportFilename('Instrument register', '2025-06-10')).toBe(
      'instrument-register-2025-06-10.csv',
    );
  });

  it('flattens anything that is not a letter or a digit', () => {
    expect(exportFilename('Recalls: due & late', '2025-06-10')).toBe(
      'recalls-due-late-2025-06-10.csv',
    );
  });

  it('makes a browser save it rather than render it', () => {
    expect(contentDisposition('recalls-2025-06-10.csv')).toBe(
      'attachment; filename="recalls-2025-06-10.csv"',
    );
  });
});
