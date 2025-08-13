import { certificate, detail, point } from '@fixtures';
import {
  conformityStatement,
  format,
  missingContent,
  signed,
  toPrintable,
} from '@features/certificate/print/certificate-print.model';

function complete() {
  return certificate('SGM-2026-0044', {
    approvedBy: 'H Whitcombe',
    ambientTemperature: 20.1,
    ambientHumidity: 44,
    points: [point()],
  });
}

describe('required certificate content', () => {
  it('passes a certificate that carries everything', () => {
    expect(missingContent(complete())).toEqual([]);
  });

  it('names an unsigned certificate', () => {
    expect(missingContent(certificate('SGM-1', { ...complete(), approvedBy: null }))).toContain(
      'an approval signature',
    );
  });

  it('treats a signature of only spaces as missing', () => {
    expect(missingContent({ ...complete(), approvedBy: '   ' })).toContain(
      'an approval signature',
    );
  });

  it('names a missing ambient temperature', () => {
    expect(missingContent({ ...complete(), ambientTemperature: null })).toContain(
      'the ambient temperature',
    );
  });

  it('names a certificate with no points at all', () => {
    expect(missingContent({ ...complete(), points: [] })).toContain(
      'at least one measurement point',
    );
  });

  it('names a point that carries no uncertainty', () => {
    expect(
      missingContent({ ...complete(), points: [point({ expandedUncertainty: 0 })] }),
    ).toContain('an uncertainty against every point');
  });

  it('lists everything missing rather than stopping at the first', () => {
    const bare = certificate('SGM-2', {
      approvedBy: null,
      ambientTemperature: null,
      points: [],
    });

    expect(missingContent(bare).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the conformity statement', () => {
  it('states conformity plainly on a pass', () => {
    expect(conformityStatement(complete())).toContain('conform to its specification');
  });

  it('says shared risk on a marginal result', () => {
    expect(conformityStatement({ ...complete(), asLeftVerdict: 'MARGINAL' })).toContain(
      'shared risk',
    );
  });

  it('says the instrument must not be used on a failure', () => {
    expect(
      conformityStatement({ ...complete(), asLeftVerdict: 'OUT_OF_TOLERANCE' }),
    ).toContain('must not be used');
  });

  it('makes no statement at all when the ratio will not support one', () => {
    expect(
      conformityStatement({ ...complete(), asLeftVerdict: 'INDETERMINATE' }),
    ).toContain('No statement of conformity');
  });

  it('makes no statement when nothing was assessed', () => {
    expect(conformityStatement({ ...complete(), asLeftVerdict: 'NOT_ASSESSED' })).toContain(
      'measured values only',
    );
  });
});

describe('laying the page out', () => {
  it('orders the points by their sequence number', () => {
    const printable = toPrintable(
      {
        ...complete(),
        points: [point({ id: 2, sequenceNo: 2 }), point({ id: 1, sequenceNo: 1 })],
      },
      detail('SG-000101'),
    );

    expect(printable.rows.map((row) => row.point.sequenceNo)).toEqual([1, 2]);
  });

  it('writes the nominal with its unit', () => {
    expect(toPrintable(complete(), detail('SG-000101')).rows[0].nominal).toBe('5.0 mm');
  });

  it('signs the error so a reader can see which way it drifted', () => {
    expect(signed(0.0012)).toBe('+0.0012');
    expect(signed(-0.0012)).toBe('-0.0012');
    expect(signed(0)).toBe('0.0');
  });

  it('says so plainly when a point carries no reading', () => {
    const printable = toPrintable(
      { ...complete(), points: [point({ asFound: null, asFoundError: null })] },
      detail('SG-000101'),
    );

    expect(printable.rows[0].asFound).toBe('not taken');
    expect(printable.rows[0].error).toBe('—');
  });

  it('quotes the coverage factor beside the uncertainty', () => {
    expect(toPrintable(complete(), detail('SG-000101')).rows[0].uncertainty).toBe(
      '± 0.0005 (k = 2)',
    );
  });

  it('reports the ratio the guard band was worked out from', () => {
    expect(toPrintable(complete(), detail('SG-000101')).rows[0].ratio).toBe('8.0:1');
  });

  it('carries the missing content and the statement onto the page', () => {
    const printable = toPrintable(
      { ...complete(), approvedBy: null },
      detail('SG-000101'),
    );

    expect(printable.missing).toContain('an approval signature');
    expect(printable.statement).toContain('conform');
  });

  it('formats a whole number with a decimal, so it reads as a measurement', () => {
    expect(format(5)).toBe('5.0');
    expect(format(0.0005)).toBe('0.0005');
    expect(format(20.1)).toBe('20.1');
  });
});
