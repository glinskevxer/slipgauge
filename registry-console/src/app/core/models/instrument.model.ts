export type Discipline =
  | 'DIMENSIONAL'
  | 'ELECTRICAL'
  | 'MASS'
  | 'PRESSURE'
  | 'TEMPERATURE'
  | 'FLOW'
  | 'TORQUE'
  | 'TIME';

export type Criticality = 'ROUTINE' | 'IMPORTANT' | 'CRITICAL';

export type InstrumentStatus =
  | 'IN_SERVICE'
  | 'IN_CALIBRATION'
  | 'QUARANTINED'
  | 'UNDER_REPAIR'
  | 'ON_LOAN'
  | 'RETIRED';

export interface InstrumentSummary {
  readonly id: number;
  readonly assetTag: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly classCode: string;
  readonly discipline: Discipline;
  readonly criticality: Criticality;
  readonly status: InstrumentStatus;
  readonly referenceStandard: boolean;
  readonly locationCode: string | null;
  readonly custodian: string | null;
  readonly acquiredOn: string;
}

export interface InstrumentDetail extends InstrumentSummary {
  readonly description: string | null;
  readonly className: string;
  readonly baseIntervalDays: number;
  readonly minIntervalDays: number;
  readonly maxIntervalDays: number;
  readonly unit: string;
  readonly rangeLow: number;
  readonly rangeHigh: number;
  readonly resolution: number;
  readonly locationPath: readonly string[];
  readonly retiredOn: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface RegisterInstrumentRequest {
  readonly classCode: string;
  readonly manufacturer: string;
  readonly model: string;
  readonly serialNumber: string;
  readonly description?: string | null;
  readonly unit: string;
  readonly rangeLow: number;
  readonly rangeHigh: number;
  readonly resolution: number;
  readonly locationCode?: string | null;
  readonly custodian?: string | null;
  readonly referenceStandard: boolean;
  readonly acquiredOn: string;
}

export interface UpdateInstrumentRequest {
  readonly description?: string | null;
  readonly rangeLow: number;
  readonly rangeHigh: number;
  readonly resolution: number;
  readonly locationCode?: string | null;
  readonly custodian?: string | null;
  readonly referenceStandard: boolean;
}

/** The editable half of a detail record, ready to be sent back. */
export function toUpdateRequest(
  detail: InstrumentDetail,
  overrides: Partial<UpdateInstrumentRequest> = {},
): UpdateInstrumentRequest {
  return {
    description: detail.description,
    rangeLow: detail.rangeLow,
    rangeHigh: detail.rangeHigh,
    resolution: detail.resolution,
    locationCode: detail.locationCode,
    custodian: detail.custodian,
    referenceStandard: detail.referenceStandard,
    ...overrides,
  };
}

export interface InstrumentClassView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly discipline: Discipline;
  readonly criticality: Criticality;
  readonly baseIntervalDays: number;
  readonly minIntervalDays: number;
  readonly maxIntervalDays: number;
}

export interface StorageLocationView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly site: string;
  readonly parentCode: string | null;
  readonly path: readonly string[];
}

const STATUS_LABELS: Readonly<Record<InstrumentStatus, string>> = {
  IN_SERVICE: 'In service',
  IN_CALIBRATION: 'At calibration',
  QUARANTINED: 'Quarantined',
  UNDER_REPAIR: 'Under repair',
  ON_LOAN: 'On loan',
  RETIRED: 'Retired',
};

export function statusLabel(status: InstrumentStatus): string {
  return STATUS_LABELS[status];
}

/** True when the instrument may legitimately be used to take a reading. */
export function statusIsUsable(status: InstrumentStatus): boolean {
  return status === 'IN_SERVICE' || status === 'ON_LOAN';
}

export function rangeLabel(instrument: InstrumentDetail): string {
  return `${instrument.rangeLow} to ${instrument.rangeHigh} ${instrument.unit}`;
}
