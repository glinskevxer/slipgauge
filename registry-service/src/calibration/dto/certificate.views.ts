import type { Verdict } from '../conformity';

export interface MeasurementPointView {
  readonly id: number;
  readonly sequenceNo: number;
  readonly label: string | null;
  readonly nominal: number;
  readonly unit: string;
  readonly asFound: number | null;
  readonly asLeft: number | null;
  readonly asFoundError: number | null;
  readonly asLeftError: number | null;
  readonly normalisedAsFoundError: number | null;
  readonly toleranceLow: number;
  readonly toleranceHigh: number;
  readonly expandedUncertainty: number;
  readonly coverageFactor: number;
  readonly asFoundVerdict: Verdict;
  readonly asLeftVerdict: Verdict;
}

export interface CertificateView {
  readonly id: number;
  readonly certificateNumber: string;
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly performedOn: string;
  readonly issuedOn: string;
  readonly performedBy: string;
  readonly approvedBy: string | null;
  readonly issuingLab: string;
  readonly externalLab: boolean;
  readonly ambientTemperature: number | null;
  readonly ambientHumidity: number | null;
  readonly asFoundVerdict: Verdict;
  readonly asLeftVerdict: Verdict;
  readonly adjusted: boolean;
  readonly remarks: string | null;
  /** The rule the verdicts were worked out under, as it was on the day. */
  readonly acceptancePolicy: string | null;
  readonly accredited: boolean;
  readonly scopeRef: string | null;
  /** The two sentences the certificate prints under the results. */
  readonly decisionRule: string | null;
  readonly live: boolean;
  readonly withdrawnAt: string | null;
  readonly withdrawnReason: string | null;
  readonly supersededById: number | null;
  readonly points: readonly MeasurementPointView[];
}
