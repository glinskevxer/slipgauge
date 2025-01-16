import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { requiredNumericTransformer } from '../common/numeric';
import { InstrumentClass } from './instrument-class.entity';
import { InstrumentStatus, canTransition } from './instrument.enums';
import { StorageLocation } from './storage-location.entity';

/**
 * One serialised piece of measuring equipment. This is the row every other
 * part of the system points at, and the only place its current status lives.
 */
@Entity({ name: 'instrument' })
export class Instrument extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'asset_tag', type: 'varchar', length: 32, unique: true })
  assetTag: string;

  @ManyToOne(() => InstrumentClass, { nullable: false })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass;

  @Column({ type: 'varchar', length: 120 })
  manufacturer: string;

  @Column({ type: 'varchar', length: 120 })
  model: string;

  @Column({ name: 'serial_number', type: 'varchar', length: 80 })
  serialNumber: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 24 })
  unit: string;

  @Column({
    name: 'range_low',
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: requiredNumericTransformer,
  })
  rangeLow: number;

  @Column({
    name: 'range_high',
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: requiredNumericTransformer,
  })
  rangeHigh: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  resolution: number;

  @ManyToOne(() => StorageLocation, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: StorageLocation | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  custodian: string | null;

  @Column({ type: 'varchar', length: 24 })
  status: InstrumentStatus;

  /** True when this instrument is used as a standard to calibrate others. */
  @Column({ name: 'is_reference', type: 'boolean', default: false })
  isReference: boolean;

  @Column({ name: 'acquired_on', type: 'date' })
  acquiredOn: string;

  @Column({ name: 'retired_on', type: 'date', nullable: true })
  retiredOn: string | null;

  @VersionColumn({ name: 'row_version' })
  rowVersion: number;

  /**
   * The measuring span and the smallest change the display can show. They
   * travel together because a resolution wider than the span is meaningless
   * and the uncertainty budget divides by it.
   */
  applySpan(low: number, high: number, resolution: number): void {
    if (low >= high) {
      throw new Error('range low must sit below range high');
    }
    if (resolution <= 0) {
      throw new Error('resolution must be positive');
    }
    if (resolution > high - low) {
      throw new Error('resolution cannot exceed the span');
    }
    this.rangeLow = low;
    this.rangeHigh = high;
    this.resolution = resolution;
  }

  covers(value: number): boolean {
    return value >= this.rangeLow && value <= this.rangeHigh;
  }

  span(): number {
    return this.rangeHigh - this.rangeLow;
  }

  moveTo(location: StorageLocation | null, custodian: string | null): void {
    this.location = location;
    this.custodian = custodian;
  }

  transitionTo(target: InstrumentStatus): void {
    if (!canTransition(this.status, target)) {
      throw new Error(`instrument ${this.assetTag} cannot move from ${this.status} to ${target}`);
    }
    this.status = target;
  }

  retire(on: string): void {
    if (on < this.acquiredOn) {
      throw new Error('cannot retire an instrument before it was acquired');
    }
    this.transitionTo(InstrumentStatus.RETIRED);
    this.retiredOn = on;
  }

  markAsReference(isReference: boolean): void {
    this.isReference = isReference;
  }
}
