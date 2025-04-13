import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  VersionColumn,
} from 'typeorm';

import { ToleranceProfile } from '../calibration/tolerance-profile.entity';
import { AuditedEntity } from '../common/audited.entity';
import { InvalidTransitionError, RuleViolationError } from '../common/errors';
import { requiredNumericTransformer } from '../common/numeric';
import { InstrumentClass } from './instrument-class.entity';
import { InstrumentStatus, canTransition, transitionsFrom } from './instrument.enums';
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

  /**
   * The profile this one instrument is held to, when it differs from what its
   * class works to. Null is the normal case and means fall back to the class.
   */
  @ManyToOne(() => ToleranceProfile, { nullable: true })
  @JoinColumn({ name: 'tolerance_profile_id' })
  toleranceProfile: ToleranceProfile | null;

  @RelationId((instrument: Instrument) => instrument.toleranceProfile)
  toleranceProfileId: number | null;

  /**
   * The national metrology institute this instrument is ultimately traceable
   * to. Only the standards that terminate a chain carry one.
   */
  @Column({ name: 'traceable_to', type: 'varchar', length: 64, nullable: true })
  traceableTo: string | null;

  /**
   * The live interval and the date it falls due, copied down from the current
   * interval decision. The recall list is one index scan on next_due_on rather
   * than a replay per instrument, and the decision table stays the record.
   */
  @Column({ name: 'interval_days', type: 'int', nullable: true })
  intervalDays: number | null;

  @Column({ name: 'next_due_on', type: 'date', nullable: true })
  nextDueOn: string | null;

  @Column({ name: 'last_calibrated_on', type: 'date', nullable: true })
  lastCalibratedOn: string | null;

  @VersionColumn({ name: 'row_version' })
  rowVersion: number;

  /**
   * The measuring span and the smallest change the display can show. They
   * travel together because a resolution wider than the span is meaningless
   * and the uncertainty budget divides by it.
   */
  applySpan(low: number, high: number, resolution: number): void {
    if (low >= high) {
      throw new RuleViolationError('range low must sit below range high');
    }
    if (resolution <= 0) {
      throw new RuleViolationError('resolution must be positive');
    }
    if (resolution > high - low) {
      throw new RuleViolationError('resolution cannot exceed the span');
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
      throw new InvalidTransitionError(
        `instrument ${this.assetTag} cannot move from ${this.status} to ${target}`,
      )
        .with('from', this.status)
        .with('to', target)
        .with('allowed', transitionsFrom(this.status));
    }
    this.status = target;
  }

  /** Writes the interval a decision arrived at onto the instrument itself. */
  applySchedule(intervalDays: number, lastCalibratedOn: string | null, nextDueOn: string): void {
    if (intervalDays <= 0) {
      throw new RuleViolationError('a calibration interval must be at least one day');
    }
    this.intervalDays = intervalDays;
    this.lastCalibratedOn = lastCalibratedOn;
    this.nextDueOn = nextDueOn;
  }

  /** How many days remain before the instrument is due, negative when overdue. */
  daysUntilDue(today: string): number | null {
    if (this.nextDueOn === null) {
      return null;
    }
    const due = Date.parse(`${this.nextDueOn}T00:00:00Z`);
    const now = Date.parse(`${today}T00:00:00Z`);

    return Math.round((due - now) / 86_400_000);
  }

  retire(on: string): void {
    if (on < this.acquiredOn) {
      throw new RuleViolationError('cannot retire an instrument before it was acquired');
    }
    this.transitionTo(InstrumentStatus.RETIRED);
    this.retiredOn = on;
  }

  markAsReference(isReference: boolean): void {
    this.isReference = isReference;
  }
}
