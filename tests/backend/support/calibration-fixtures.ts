import { DataSource } from 'typeorm';

import {
  CalibrationCertificate,
  calibrationCertificate,
} from '@registry/calibration/calibration-certificate.entity';
import { ToleranceBand, Verdict } from '@registry/calibration/conformity';
import { measurementPoint } from '@registry/calibration/measurement-point.entity';
import { Instrument } from '@registry/instrument/instrument.entity';
import {
  CertificateStandard,
  StandardRole,
  externalStandard,
  internalStandard,
} from '@registry/traceability';

export interface CertificateOptions {
  readonly number?: string;
  readonly performedOn?: string;
  readonly issuedOn?: string;
  readonly verdict?: Verdict;
  readonly nominal?: number;
  readonly issuingLab?: string;
}

/**
 * Certificates built through the real entities, for suites whose subject is
 * something downstream of a calibration rather than the calibration itself.
 * A traceability test needs six of these and cares about none of them.
 */
export class CalibrationFixtures {
  private sequence = 0;

  constructor(private readonly dataSource: DataSource) {}

  async certificate(
    instrument: Instrument,
    options: CertificateOptions = {},
  ): Promise<CalibrationCertificate> {
    this.sequence += 1;

    const performedOn = options.performedOn ?? '2025-02-11';
    const verdict = options.verdict ?? Verdict.PASS;
    const nominal = options.nominal ?? 20;

    const certificate = calibrationCertificate(
      options.number ?? `CAL-FIX-${String(this.sequence).padStart(4, '0')}`,
      instrument,
      performedOn,
      options.issuedOn ?? performedOn,
      'R Okonjo',
      options.issuingLab ?? 'Slipgauge Metrology',
    );

    const point = measurementPoint(
      1,
      nominal,
      instrument.unit,
      ToleranceBand.symmetric(nominal, 0.004),
      0.0005,
    );

    point.recordAsFound(nominal, verdict);
    point.recordAsLeft(nominal, verdict);
    certificate.addPoint(point);
    certificate.rollUpVerdicts();

    return this.dataSource.getRepository(CalibrationCertificate).save(certificate);
  }

  /** Points a certificate at another instrument in the register. */
  async measuredAgainst(
    certificate: CalibrationCertificate,
    standard: Instrument,
    role: StandardRole = StandardRole.REFERENCE,
  ): Promise<CertificateStandard> {
    return this.dataSource
      .getRepository(CertificateStandard)
      .save(internalStandard(certificate, standard, role));
  }

  /** Terminates a chain at an outside laboratory with a validity window. */
  async measuredOutside(
    certificate: CalibrationCertificate,
    reference: string,
    from: string | null,
    to: string | null,
    role: StandardRole = StandardRole.REFERENCE,
  ): Promise<CertificateStandard> {
    const edge = externalStandard(
      certificate,
      reference,
      'National Physical Laboratory',
      'NPL-2024-117',
      role,
    ).validFor(from, to, 'UKAS 0001');

    return this.dataSource.getRepository(CertificateStandard).save(edge);
  }

  /** Marks an instrument as one the laboratory holds as a reference standard. */
  async asStandard(instrument: Instrument, traceableTo = 'NPL'): Promise<Instrument> {
    instrument.markAsReference(true);
    instrument.traceableTo = traceableTo;
    return this.dataSource.getRepository(Instrument).save(instrument);
  }
}
