import { Verdict } from '@registry/calibration/conformity';
import { Instrument } from '@registry/instrument/instrument.entity';
import { ChainDefectKind, StandardRole, TraceabilityValidator } from '@registry/traceability';
import { CalibrationFixtures } from '../support/calibration-fixtures';
import { RegisterFixtures } from '../support/fixtures';
import { TestApp, createTestApp } from '../support/test-app';

describe('walking a traceability chain', () => {
  let harness: TestApp;
  let register: RegisterFixtures;
  let calibrations: CalibrationFixtures;
  let validator: TraceabilityValidator;

  beforeAll(async () => {
    harness = await createTestApp();
    register = new RegisterFixtures(harness.dataSource);
    calibrations = new CalibrationFixtures(harness.dataSource);
    validator = harness.app.get(TraceabilityValidator);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /** A working micrometer, and the gauge block set it is measured against. */
  async function pair(): Promise<{ working: Instrument; standard: Instrument }> {
    const working = await register.micrometer('SG-300001');
    const standard = await calibrations.asStandard(await register.gaugeBlockSet('SG-300002'));

    return { working, standard };
  }

  it('calls a chain sound when it ends at an outside laboratory in date', async () => {
    const working = await register.micrometer('SG-300001');
    const certificate = await calibrations.certificate(working);

    await calibrations.measuredOutside(certificate, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const report = await validator.validate(certificate);

    expect(report.sound).toBe(true);
    expect(report.terminates).toBe(true);
    expect(report.depth).toBe(1);
    expect(report.summarise()).toBe('traceable in 1 hop');
  });

  it('walks through an internal standard on to the laboratory behind it', async () => {
    const { working, standard } = await pair();

    const its = await calibrations.certificate(standard, {
      number: 'CAL-STD-0001',
      performedOn: '2025-01-06',
    });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, standard);

    const report = await validator.validate(certificate);

    expect(report.sound).toBe(true);
    expect(report.terminates).toBe(true);
    expect(report.depth).toBe(2);
  });

  it('refuses a certificate with no reference standard on it at all', async () => {
    const working = await register.micrometer('SG-300001');
    const certificate = await calibrations.certificate(working);

    const report = await validator.validate(certificate);

    expect(report.sound).toBe(false);
    expect(report.hasDefect(ChainDefectKind.NO_REFERENCE)).toBe(true);
  });

  it('does not let a check standard stand in for a reference', async () => {
    const { working, standard } = await pair();
    const certificate = await calibrations.certificate(working);

    await calibrations.measuredAgainst(certificate, standard, StandardRole.CHECK);

    const report = await validator.validate(certificate);

    expect(report.hasDefect(ChainDefectKind.NO_REFERENCE)).toBe(true);
  });

  it('reports an outside standard whose window missed the day it was used', async () => {
    const working = await register.micrometer('SG-300001');
    const certificate = await calibrations.certificate(working, { performedOn: '2025-11-04' });

    await calibrations.measuredOutside(certificate, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const report = await validator.validate(certificate);

    expect(report.sound).toBe(false);
    expect(report.terminates).toBe(false);
    expect(report.hasDefect(ChainDefectKind.EXTERNAL_WINDOW_MISSED)).toBe(true);
    expect(report.firstDefect()?.detail).toContain('does not cover 2025-11-04');
  });

  it('reports an instrument used as a reference that is not registered as one', async () => {
    const working = await register.micrometer('SG-300001');
    const other = await register.micrometer('SG-300003');

    const its = await calibrations.certificate(other, { performedOn: '2025-01-06' });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, other);

    const report = await validator.validate(certificate);

    expect(report.hasDefect(ChainDefectKind.NOT_A_REFERENCE_STANDARD)).toBe(true);
  });

  it('reports a standard with no certificate covering the day it was used', async () => {
    const { working, standard } = await pair();

    // The standard's only certificate is later than the work it supported.
    const its = await calibrations.certificate(standard, { performedOn: '2025-06-02' });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, standard);

    const report = await validator.validate(certificate);

    expect(report.hasDefect(ChainDefectKind.NO_CERTIFICATE_ON_DATE)).toBe(true);
  });

  it('reports a standard whose own last result was not serviceable', async () => {
    const { working, standard } = await pair();

    const its = await calibrations.certificate(standard, {
      performedOn: '2025-01-06',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, standard);

    const report = await validator.validate(certificate);

    expect(report.hasDefect(ChainDefectKind.STANDARD_NOT_SERVICEABLE)).toBe(true);
  });

  it('reports a standard that was past its own interval on the day it was used', async () => {
    const { working, standard } = await pair();

    const its = await calibrations.certificate(standard, { performedOn: '2020-01-06' });
    await calibrations.measuredOutside(its, 'NPL 2024/117', '2019-11-01', '2029-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, standard);

    const report = await validator.validate(certificate);

    expect(report.hasDefect(ChainDefectKind.STANDARD_OVERDUE)).toBe(true);
    expect(report.firstDefect()?.detail).toContain('was used on 2025-02-11');
  });

  it('reads a standard through the latest certificate that predates the work', async () => {
    const { working, standard } = await pair();

    const older = await calibrations.certificate(standard, {
      number: 'CAL-STD-OLD',
      performedOn: '2024-01-06',
      verdict: Verdict.OUT_OF_TOLERANCE,
    });
    await calibrations.measuredOutside(older, 'NPL 2023/900', '2023-11-01', '2029-10-31');

    const newer = await calibrations.certificate(standard, {
      number: 'CAL-STD-NEW',
      performedOn: '2025-01-06',
    });
    await calibrations.measuredOutside(newer, 'NPL 2024/117', '2024-11-01', '2025-10-31');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, standard);

    const report = await validator.validate(certificate);

    expect(report.sound).toBe(true);
  });

  it('stops a chain that loops back on itself rather than walking forever', async () => {
    const first = await calibrations.asStandard(await register.gaugeBlockSet('SG-300004'));
    const second = await calibrations.asStandard(await register.gaugeBlockSet('SG-300005'));

    const firstCert = await calibrations.certificate(first, {
      number: 'CAL-LOOP-1',
      performedOn: '2025-01-06',
    });
    // Same day both ways, so each certificate really does cover the other and
    // the only thing that can stop the walk is the loop guard.
    const secondCert = await calibrations.certificate(second, {
      number: 'CAL-LOOP-2',
      performedOn: '2025-01-06',
    });

    await calibrations.measuredAgainst(firstCert, second);
    await calibrations.measuredAgainst(secondCert, first);

    const report = await validator.validate(firstCert);

    expect(report.sound).toBe(false);
    expect(report.hasDefect(ChainDefectKind.CIRCULAR)).toBe(true);
  });

  it('collects every defect rather than stopping at the first', async () => {
    const working = await register.micrometer('SG-300001');
    const other = await register.micrometer('SG-300003');

    const certificate = await calibrations.certificate(working, { performedOn: '2025-02-11' });
    await calibrations.measuredAgainst(certificate, other);
    await calibrations.measuredOutside(certificate, 'NPL 2024/117', '2026-01-01', '2026-12-31');

    const report = await validator.validate(certificate);

    expect(report.defects.length).toBeGreaterThanOrEqual(2);
    expect(report.summarise()).toContain('problems on the chain');
  });
});
