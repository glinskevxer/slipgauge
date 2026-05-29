import { DataSource } from 'typeorm';

/**
 * The pieces of a calibration sheet that ten suites had each written out.
 *
 * <p>The traceable outside standard was copied into every one of them, and the
 * copies had drifted: three of them carried a validity window that had already
 * lapsed against the clock their suite pinned, so those suites were one date
 * away from failing on the chain check rather than on whatever they were about.
 *
 * <p>A fixture is not a shortcut here. Every suite downstream of a certificate
 * needs one and cares about none of it, and a shape that changes should break
 * this file once rather than ten files that each describe it slightly
 * differently.
 */

/**
 * A standard from a national laboratory, valid across every date the suites
 * use. Deliberately wide: a fixture whose validity has to be thought about is a
 * fixture that will be got wrong.
 */
export const OUTSIDE_STANDARD = {
  externalRef: 'NPL 2024/117',
  externalLab: 'National Physical Laboratory',
  externalCertificateNumber: 'NPL-2024-117',
  externalAccreditation: 'UKAS 0001',
  externalValidFrom: '2020-01-01',
  externalValidTo: '2030-12-31',
  role: 'REFERENCE',
} as const;

export interface SheetOptions {
  readonly certificateNumber?: string;
  readonly assetTag?: string;
  readonly performedOn?: string;
  readonly issuedOn?: string;
  readonly performedBy?: string;
  readonly issuingLab?: string;
  /** One point per nominal, each a whisker high and comfortably inside. */
  readonly nominals?: readonly number[];
  readonly asFound?: readonly number[];
  readonly uncertainty?: number;
}

/**
 * A sheet the service will accept, in the shape the record route takes.
 *
 * <p>Anything a suite has an opinion about is an option; everything else is
 * chosen so the sheet passes on every check that is not the one under test.
 */
export function sheet(options: SheetOptions = {}, overrides: Record<string, unknown> = {}) {
  const performedOn = options.performedOn ?? '2025-11-18';
  const nominals = options.nominals ?? [20];
  const uncertainty = options.uncertainty ?? 0.0005;

  return {
    certificateNumber: options.certificateNumber ?? 'CAL-7001',
    assetTag: options.assetTag ?? 'SG-0001',
    performedOn,
    issuedOn: options.issuedOn ?? performedOn,
    performedBy: options.performedBy ?? 'r.okonjo',
    issuingLab: options.issuingLab ?? 'Slipgauge Metrology',
    points: nominals.map((nominal, index) => ({
      sequenceNo: index + 1,
      nominal,
      asFound: options.asFound?.[index] ?? nominal + 0.0004,
      expandedUncertainty: uncertainty,
    })),
    standards: [OUTSIDE_STANDARD],
    ...overrides,
  };
}

/**
 * Reference data a suite has to empty to say anything, put back afterwards.
 *
 * <p>The schedule of accreditation is loaded by a migration and every other
 * suite reads it. A suite that needs an empty schedule takes a copy first, and
 * this is that copy, because doing it by hand in two places is how the second
 * one gets forgotten and every later suite in the run fails.
 */
export class ReferenceDataSnapshot {
  private rows: Record<string, unknown>[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly table: string,
    private readonly columns: readonly string[],
  ) {}

  async take(): Promise<void> {
    this.rows = await this.dataSource.query(`select * from ${this.table}`);
  }

  async clear(): Promise<void> {
    await this.dataSource.query(`delete from ${this.table}`);
  }

  async restore(): Promise<void> {
    await this.clear();

    const placeholders = this.columns.map((_, index) => `$${index + 1}`).join(', ');

    for (const row of this.rows) {
      await this.dataSource.query(
        `insert into ${this.table} (${this.columns.join(', ')}) values (${placeholders})`,
        this.columns.map((column) => row[column]),
      );
    }
  }
}

/** The snapshot the schedule suites take. */
export function scopeSnapshot(dataSource: DataSource): ReferenceDataSnapshot {
  return new ReferenceDataSnapshot(dataSource, 'accreditation_scope', [
    'id',
    'schedule_ref',
    'discipline',
    'class_id',
    'measurand',
    'unit',
    'range_low',
    'range_high',
    'cmc_absolute',
    'cmc_ppm',
    'valid_from',
    'valid_to',
    'note',
  ]);
}
