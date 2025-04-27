import type {
  ImpactDisposition,
  ImpactKind,
  ImpactSeverity,
  ImpactStatus,
} from '../impact-severity';

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
  readonly settled: boolean;
}

export interface ImpactView {
  readonly id: number;
  readonly triggerCertificateId: number;
  readonly instrumentId: number;
  readonly assetTag: string;
  readonly raisedAt: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly status: ImpactStatus;
  readonly severity: ImpactSeverity;
  readonly maxDepth: number;
  readonly itemCount: number;
  readonly pendingCount: number;
  readonly needsCustomerContact: boolean;
  readonly closedAt: string | null;
  readonly closedBy: string | null;
  readonly conclusion: string | null;
  readonly items: readonly ImpactItemView[];
}
