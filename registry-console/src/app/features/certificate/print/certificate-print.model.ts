import {
  CertificateView,
  MeasurementPointView,
  Verdict,
  testUncertaintyRatio,
} from '@core/models/calibration.model';
import { InstrumentDetail } from '@core/models/instrument.model';

/**
 * What goes on the paper.
 *
 * <p>An accredited certificate has a required content list, and a customer who
 * receives one missing a required item can reject the whole visit. So the page
 * is assembled from a checked structure rather than from whatever the screen
 * happened to have, and the missing items are named before it prints.
 */

export interface PrintableCertificate {
  readonly certificate: CertificateView;
  readonly instrument: InstrumentDetail;
  readonly rows: readonly PrintablePoint[];
  readonly missing: readonly string[];
  readonly statement: string;
  /**
   * The rule and accreditation sentences the service fixed when the sheet was
   * filed. Read off the certificate rather than worded here: the console must
   * never be able to print a claim the service did not make.
   */
  readonly declarations: readonly string[];
  /** True when this certificate may show the accreditation mark. */
  readonly marked: boolean;
}

export interface PrintablePoint {
  readonly point: MeasurementPointView;
  readonly nominal: string;
  readonly asFound: string;
  readonly error: string;
  readonly tolerance: string;
  readonly uncertainty: string;
  readonly ratio: string;
  readonly verdict: Verdict;
}

/** Required content, in the order an assessor reads for it. */
const REQUIRED: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'certificateNumber', label: 'a certificate number' },
  { key: 'performedOn', label: 'the date the work was done' },
  { key: 'issuedOn', label: 'the date of issue' },
  { key: 'performedBy', label: 'who performed the calibration' },
  { key: 'approvedBy', label: 'an approval signature' },
  { key: 'issuingLab', label: 'the issuing laboratory' },
  { key: 'ambientTemperature', label: 'the ambient temperature' },
  { key: 'points', label: 'at least one measurement point' },
  { key: 'uncertainty', label: 'an uncertainty against every point' },
];

export function missingContent(certificate: CertificateView): readonly string[] {
  const missing: string[] = [];

  for (const item of REQUIRED) {
    if (!present(certificate, item.key)) {
      missing.push(item.label);
    }
  }
  return missing;
}

function present(certificate: CertificateView, key: string): boolean {
  switch (key) {
    case 'points':
      return certificate.points.length > 0;
    case 'uncertainty':
      return certificate.points.every((point) => point.expandedUncertainty > 0);
    case 'ambientTemperature':
      return certificate.ambientTemperature !== null;
    case 'approvedBy':
      return Boolean(certificate.approvedBy?.trim());
    default:
      return Boolean((certificate as unknown as Record<string, unknown>)[key]);
  }
}

/**
 * The conformity statement. Worded from the verdict rather than chosen by the
 * technician, because the wording is what a customer's own auditor reads and
 * it has to mean exactly one thing.
 */
export function conformityStatement(certificate: CertificateView): string {
  switch (certificate.asLeftVerdict) {
    case 'PASS':
      return 'The instrument was found to conform to its specification at every point, taking the stated measurement uncertainty into account.';
    case 'MARGINAL':
      return 'The instrument was found within specification at every point, but at one or more points the measurement uncertainty straddles the limit. Conformity is stated on shared risk at those points.';
    case 'OUT_OF_TOLERANCE':
      return 'The instrument was found outside its specification. It must not be used until it has been adjusted or repaired and recalibrated.';
    case 'INDETERMINATE':
      return 'No statement of conformity is made. The measurement uncertainty is not small enough relative to the specification to support one.';
    case 'NOT_ASSESSED':
      return 'No statement of conformity is made. This certificate reports the measured values only.';
  }
}

/**
 * The declarations, split into sentences so they set as separate paragraphs.
 *
 * <p>A certificate filed before the register recorded a decision rule has none,
 * and prints a line saying so rather than inventing one. An assessor reading an
 * old certificate needs to see that the rule was not recorded, not to be told a
 * rule that nobody chose.
 */
export function declarationsOf(certificate: CertificateView): readonly string[] {
  if (!certificate.decisionRule) {
    return ['No decision rule was recorded against this certificate.'];
  }
  return certificate.decisionRule
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function toPrintable(
  certificate: CertificateView,
  instrument: InstrumentDetail,
): PrintableCertificate {
  return {
    certificate,
    instrument,
    rows: [...certificate.points]
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((point) => row(point)),
    missing: missingContent(certificate),
    statement: conformityStatement(certificate),
    declarations: declarationsOf(certificate),
    marked: certificate.accredited && certificate.withdrawnAt === null,
  };
}

function row(point: MeasurementPointView): PrintablePoint {
  const ratio = testUncertaintyRatio(point);
  return {
    point,
    nominal: `${format(point.nominal)} ${point.unit}`,
    asFound: point.asFound === null ? 'not taken' : format(point.asFound),
    error: point.asFoundError === null ? '—' : signed(point.asFoundError),
    tolerance: `${format(point.toleranceLow)} to ${format(point.toleranceHigh)}`,
    uncertainty: `± ${format(point.expandedUncertainty)} (k = ${point.coverageFactor})`,
    ratio: ratio === null ? '—' : `${ratio.toFixed(1)}:1`,
    verdict: point.asFoundVerdict,
  };
}

/**
 * The value as measured, no wider and no narrower. A whole number is written
 * with one decimal so it reads as a measurement rather than a count, and
 * everything else keeps exactly the significant digits it arrived with.
 */
export function format(value: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return value.toPrecision(Math.min(9, significantDigits(value)));
}

function significantDigits(value: number): number {
  const digits = Math.abs(value)
    .toString()
    .replace('.', '')
    .replace(/^0+/, '');
  return Math.max(1, digits.length);
}

export function signed(value: number): string {
  return value > 0 ? `+${format(value)}` : format(value);
}
