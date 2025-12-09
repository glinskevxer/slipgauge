import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { Criticality, Discipline } from './instrument.enums';

/**
 * A family of instruments that share a calibration regime. The three interval
 * numbers are the boundaries the interval engine works inside: it starts every
 * new instrument at the base and is never allowed outside the min and max.
 */
@Entity({ name: 'instrument_class' })
export class InstrumentClass extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  discipline: Discipline;

  @Column({ name: 'base_interval_days', type: 'int' })
  baseIntervalDays: number;

  @Column({ name: 'min_interval_days', type: 'int' })
  minIntervalDays: number;

  @Column({ name: 'max_interval_days', type: 'int' })
  maxIntervalDays: number;

  @Column({ type: 'varchar', length: 16 })
  criticality: Criticality;

  /**
   * The class sits on the schedule of accreditation. Work outside it is still
   * done and still certified, it simply does not carry the mark.
   */
  @Column({ type: 'boolean', default: false })
  accredited: boolean;

  /** The controlled document the work is carried out to, when there is one. */
  @Column({ name: 'method_reference', type: 'varchar', length: 120, nullable: true })
  methodReference: string | null;

  /**
   * Interval boundaries only make sense together, so they are set together and
   * rejected together. The database carries the same check, but failing here
   * gives the caller a usable message instead of a constraint name.
   */
  applyIntervals(base: number, min: number, max: number): void {
    if (min <= 0) {
      throw new Error('minimum interval must be positive');
    }
    if (min > base || base > max) {
      throw new Error(
        `intervals must satisfy min <= base <= max, got ${min} <= ${base} <= ${max}`,
      );
    }
    this.minIntervalDays = min;
    this.baseIntervalDays = base;
    this.maxIntervalDays = max;
  }

  /** Pulls an arbitrary proposal back into the window this class permits. */
  clampInterval(proposedDays: number): number {
    return Math.max(this.minIntervalDays, Math.min(this.maxIntervalDays, proposedDays));
  }
}
