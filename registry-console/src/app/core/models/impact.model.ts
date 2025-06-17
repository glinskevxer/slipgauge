import { Tone } from '@shared/tone';

export type ImpactSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export type ImpactKind = 'USAGE' | 'CERTIFICATE' | 'INSTRUMENT';

export type ImpactDisposition =
  | 'PENDING'
  | 'NO_EFFECT'
  | 'CUSTOMER_NOTIFIED'
  | 'RECALLED'
  | 'REWORKED'
  | 'ACCEPTED';

export interface ImpactItemView {
  readonly id: number;
  readonly kind: ImpactKind;
  readonly referenceId: number;
  readonly assetTag: string | null;
  readonly label: string | null;
  readonly occurredOn: string;
  readonly depth: number;
  readonly disposition: ImpactDisposition;
  readonly note: string | null;
}

export interface ImpactView {
  readonly id: number;
  readonly triggerCertificateId: number;
  readonly triggerCertificateNumber: string;
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly raisedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly status: 'OPEN' | 'ASSESSED' | 'CLOSED';
  readonly severity: ImpactSeverity;
  readonly maxDepth: number;
  readonly itemCount: number;
  readonly pendingCount: number;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly conclusion: string | null;
  readonly items: readonly ImpactItemView[];
}

const DISPOSITION_LABELS: Readonly<Record<ImpactDisposition, string>> = {
  PENDING: 'Not reviewed',
  NO_EFFECT: 'No effect',
  CUSTOMER_NOTIFIED: 'Customer told',
  RECALLED: 'Recalled',
  REWORKED: 'Reworked',
  ACCEPTED: 'Accepted as is',
};

export function dispositionLabel(disposition: ImpactDisposition): string {
  return DISPOSITION_LABELS[disposition];
}

export function severityTone(severity: ImpactSeverity): Tone {
  switch (severity) {
    case 'NONE':
      return 'unknown';
    case 'LOW':
      return 'ok';
    case 'MEDIUM':
      return 'warn';
    case 'HIGH':
      return 'bad';
  }
}

export function isSettled(disposition: ImpactDisposition): boolean {
  return disposition !== 'PENDING';
}

/**
 * Groups the cascade by how many hops from the failure each line sits. The
 * explorer draws one column per hop, which is the only presentation anyone has
 * found readable when a standard has reached three levels down.
 */
export function byDepth(
  items: readonly ImpactItemView[],
): ReadonlyArray<{ depth: number; items: readonly ImpactItemView[] }> {
  const buckets = new Map<number, ImpactItemView[]>();
  for (const item of items) {
    const bucket = buckets.get(item.depth);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.depth, [item]);
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, bucketItems]) => ({ depth, items: bucketItems }));
}

export function progress(assessment: ImpactView): number {
  if (assessment.itemCount === 0) {
    return 100;
  }
  const settled = assessment.itemCount - assessment.pendingCount;
  return Math.round((settled / assessment.itemCount) * 100);
}
