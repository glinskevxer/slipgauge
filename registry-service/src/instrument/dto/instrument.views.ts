import { Criticality, Discipline, InstrumentStatus } from '../instrument.enums';

/** One row of the register grid. Kept narrow so the list endpoint stays cheap. */
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

/** Everything the instrument page shows above its history tabs. */
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
