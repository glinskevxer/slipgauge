export type Verdict =
  | 'PASS'
  | 'MARGINAL'
  | 'OUT_OF_TOLERANCE'
  | 'INDETERMINATE'
  | 'NOT_ASSESSED';

import { Tone } from '@shared/tone';

export type AcceptancePolicy = 'SHARED_RISK' | 'STRINGENT' | 'MANAGED_RISK';

export type StandardRole = 'REFERENCE' | 'CHECK' | 'ENVIRONMENT';

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
  /** The rule the verdicts were judged under, as it stood on the day. */
  readonly acceptancePolicy: AcceptancePolicy | null;
  readonly accredited: boolean;
  readonly scopeRef: string | null;
  /** The two sentences the service wrote when the sheet was filed. */
  readonly decisionRule: string | null;
  readonly live: boolean;
  readonly withdrawnAt: string | null;
  readonly withdrawnReason: string | null;
  readonly supersededById: number | null;
  readonly points: readonly MeasurementPointView[];
}

export type ChainDefectKind =
  | 'NO_CERTIFICATE_ON_DATE'
  | 'STANDARD_NOT_SERVICEABLE'
  | 'STANDARD_OVERDUE'
  | 'NOT_A_REFERENCE_STANDARD'
  | 'EXTERNAL_WINDOW_MISSED'
  | 'CIRCULAR'
  | 'NO_REFERENCE';

export interface ChainDefect {
  readonly kind: ChainDefectKind;
  readonly standard: string;
  readonly detail: string;
}

export interface ChainReport {
  readonly sound: boolean;
  readonly depth: number;
  readonly terminates: boolean;
  readonly defects: readonly ChainDefect[];
}

const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  PASS: 'Pass',
  MARGINAL: 'Marginal',
  OUT_OF_TOLERANCE: 'Out of tolerance',
  INDETERMINATE: 'Not statable',
  NOT_ASSESSED: 'Not assessed',
};

export function verdictLabel(verdict: Verdict): string {
  return VERDICT_LABELS[verdict];
}

export function verdictTone(verdict: Verdict): Tone {
  switch (verdict) {
    case 'PASS':
      return 'ok';
    case 'MARGINAL':
      return 'warn';
    case 'OUT_OF_TOLERANCE':
      return 'bad';
    default:
      return 'unknown';
  }
}

/**
 * Tolerance half width over expanded uncertainty. Recomputed here rather than
 * being sent, because the console shows it per point and the service only
 * stores the two numbers it was worked out from.
 */
export function testUncertaintyRatio(point: MeasurementPointView): number | null {
  if (point.expandedUncertainty === 0) {
    return null;
  }
  const halfWidth = (point.toleranceHigh - point.toleranceLow) / 2;
  return halfWidth / point.expandedUncertainty;
}

/** Where the reading sits in its band, minus one at the low limit, plus one at the high. */
export function bandPosition(point: MeasurementPointView): number | null {
  if (point.asFound === null) {
    return null;
  }
  const halfWidth = (point.toleranceHigh - point.toleranceLow) / 2;
  if (halfWidth === 0) {
    return 0;
  }
  return (point.asFound - point.nominal) / halfWidth;
}

export function worstVerdict(points: readonly MeasurementPointView[]): Verdict {
  const order: readonly Verdict[] = [
    'PASS',
    'NOT_ASSESSED',
    'MARGINAL',
    'INDETERMINATE',
    'OUT_OF_TOLERANCE',
  ];
  return points.reduce<Verdict>(
    (worst, point) =>
      order.indexOf(point.asFoundVerdict) > order.indexOf(worst) ? point.asFoundVerdict : worst,
    'PASS',
  );
}

export type ChainNodeKind = 'CERTIFICATE' | 'EXTERNAL_STANDARD' | 'MISSING';

export interface ChainNode {
  readonly kind: ChainNodeKind;
  readonly certificateId: number | null;
  readonly instrumentId: number | null;
  readonly assetTag: string | null;
  readonly label: string;
  readonly performedOn: string | null;
  readonly validUntil: string | null;
  readonly verdict: Verdict | null;
  readonly sound: boolean;
  readonly note: string | null;
  readonly children: readonly ChainNode[];
}

/** How many hops the deepest branch runs to. */
export function chainDepth(node: ChainNode): number {
  return node.children.length === 0
    ? 0
    : 1 + Math.max(...node.children.map(chainDepth));
}

export function chainSize(node: ChainNode): number {
  return 1 + node.children.reduce((total, child) => total + chainSize(child), 0);
}

/** Every node the walk finds that is not sound, in the order it meets them. */
export function chainFaults(node: ChainNode): readonly ChainNode[] {
  const faults: ChainNode[] = node.sound ? [] : [node];
  for (const child of node.children) {
    faults.push(...chainFaults(child));
  }
  return faults;
}

export function chainTerminates(node: ChainNode): boolean {
  if (node.kind === 'EXTERNAL_STANDARD') {
    return node.sound;
  }
  if (node.children.length === 0) {
    return false;
  }
  return node.sound && node.children.some(chainTerminates);
}
