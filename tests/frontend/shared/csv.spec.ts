import { Column, escapeCell, exportFileName, toCsv } from '@shared/export/csv';
import { REGISTER_COLUMNS } from '@shared/export/register-columns';
import { InstrumentSummary } from '@core/models/instrument.model';

interface Row {
  readonly a: string;
  readonly b: unknown;
}

const COLUMNS: readonly Column<Row>[] = [
  { key: 'a', header: 'First', value: (row) => row.a },
  { key: 'b', header: 'Second', value: (row) => row.b },
];

describe('csv escaping', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCell('SG-000101')).toBe('SG-000101');
    expect(escapeCell(42)).toBe('42');
  });

  it('turns null and undefined into an empty cell', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('quotes a value containing a separator', () => {
    expect(escapeCell('Harlow, Essex')).toBe('"Harlow, Essex"');
  });

  it('doubles an embedded quote', () => {
    expect(escapeCell('the "reference" set')).toBe('"the ""reference"" set"');
  });

  it('quotes a value with a newline in it', () => {
    expect(escapeCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses anything a spreadsheet would read as a formula', () => {
    expect(escapeCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(escapeCell('+1 555 0100')).toBe("'+1 555 0100");
    expect(escapeCell('-25.4')).toBe("'-25.4");
    expect(escapeCell('@here')).toBe("'@here");
  });

  it('quotes a defused formula that also contains a comma', () => {
    expect(escapeCell('=A1,B1')).toBe('"\'=A1,B1"');
  });
});

describe('csv assembly', () => {
  it('writes a header row followed by the data', () => {
    const csv = toCsv([{ a: 'one', b: 1 }], COLUMNS);
    const lines = csv.replace('﻿', '').trim().split('\r\n');

    expect(lines[0]).toBe('First,Second');
    expect(lines[1]).toBe('one,1');
  });

  it('starts with a byte order mark so a spreadsheet reads it as utf eight', () => {
    expect(toCsv([], COLUMNS).startsWith('﻿')).toBe(true);
  });

  it('ends every line with a carriage return and newline', () => {
    expect(toCsv([{ a: 'one', b: 1 }], COLUMNS).endsWith('\r\n')).toBe(true);
  });

  it('writes only the header when there are no rows', () => {
    expect(toCsv([], COLUMNS).replace('﻿', '')).toBe('First,Second\r\n');
  });

  it('exports the register columns in a fixed order', () => {
    const instrument: InstrumentSummary = {
      id: 1,
      assetTag: 'SG-000101',
      manufacturer: 'Mitutoyo',
      model: '103-137',
      serialNumber: '7241188',
      classCode: 'MIC-EXT',
      discipline: 'DIMENSIONAL',
      criticality: 'IMPORTANT',
      status: 'IN_SERVICE',
      referenceStandard: true,
      locationCode: 'HARLOW-DIM',
      custodian: 'R Okonjo',
      acquiredOn: '2021-03-01',
    };

    const lines = toCsv([instrument], REGISTER_COLUMNS).replace('﻿', '').trim().split('\r\n');

    expect(lines[0].split(',')[0]).toBe('Asset tag');
    expect(lines[1]).toContain('SG-000101');
    expect(lines[1]).toContain('In service');
    expect(lines[1]).toContain('yes');
  });
});

describe('export file names', () => {
  it('carries what was exported and when', () => {
    const name = exportFileName('instrument register', new Date('2025-11-04T09:31:22Z'));

    expect(name).toBe('slipgauge-instrument-register-2025-11-04-09-31-22.csv');
  });

  it('has nothing in it a windows share will refuse', () => {
    const name = exportFileName('Recall board: overdue');

    expect(name).not.toMatch(/[ :<>"/\\|?*]/);
    expect(name.endsWith('.csv')).toBe(true);
  });
});
