import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { numericTransformer, requiredNumericTransformer } from '../common/numeric';
import { StorageLocation } from '../instrument/storage-location.entity';
import { Discipline } from '../instrument/instrument.enums';
import type { EnvironmentLimit as LimitShape } from './excursion';
import { ExcursionKind, ExcursionSeverity } from './excursion';

/**
 * The conditions a room has to hold for the work done in it.
 *
 * <p>Written per room and optionally per discipline, because one room can serve
 * two disciplines with different needs: the dimensional bench in the corner of
 * a general room wants a degree either side of twenty, the balance in the same
 * room only wants no draught.
 */
@Entity({ name: 'environment_limit' })
export class EnvironmentLimitRecord extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => StorageLocation, { nullable: false })
  @JoinColumn({ name: 'location_id' })
  location: StorageLocation;

  @RelationId((record: EnvironmentLimitRecord) => record.location)
  locationId: number;

  /** Null when the limit applies to everything done in the room. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  discipline: Discipline | null;

  @Column({
    name: 'temperature_min',
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: requiredNumericTransformer,
  })
  temperatureMin: number;

  @Column({
    name: 'temperature_max',
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: requiredNumericTransformer,
  })
  temperatureMax: number;

  @Column({
    name: 'humidity_min',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  humidityMin: number | null;

  @Column({
    name: 'humidity_max',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  humidityMax: number | null;

  @Column({
    name: 'drift_per_hour',
    type: 'numeric',
    precision: 6,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  driftPerHour: number | null;

  /**
   * How long an item has to sit in the room before it is measured. Not checked
   * by anything yet; recorded because it is on the method and the assessor
   * asks, and a number nobody can find is a number nobody follows.
   */
  @Column({ name: 'soak_hours', type: 'int', default: 0 })
  soakHours: number;

  @Column({ name: 'method_reference', type: 'varchar', length: 120, nullable: true })
  methodReference: string | null;

  /** The shape the rules read. */
  toLimit(): LimitShape {
    return {
      temperatureMin: this.temperatureMin,
      temperatureMax: this.temperatureMax,
      humidityMin: this.humidityMin,
      humidityMax: this.humidityMax,
      driftPerHour: this.driftPerHour,
    };
  }

  band(min: number, max: number): this {
    if (max <= min) {
      throw new RuleViolationError('the top of a band has to sit above the bottom');
    }
    this.temperatureMin = min;
    this.temperatureMax = max;
    return this;
  }

  humidity(min: number | null, max: number | null): this {
    if ((min === null) !== (max === null)) {
      throw new RuleViolationError('a humidity band is stated as a pair, or not at all');
    }
    if (min !== null && max !== null && max <= min) {
      throw new RuleViolationError('the top of a humidity band has to sit above the bottom');
    }
    this.humidityMin = min;
    this.humidityMax = max;
    return this;
  }

  /** How the limit reads on a certificate remark. */
  describe(): string {
    const temperature = `${this.temperatureMin} to ${this.temperatureMax} C`;

    if (this.humidityMin === null) {
      return temperature;
    }
    return `${temperature}, ${this.humidityMin} to ${this.humidityMax} %RH`;
  }
}

/** One sample from a logger, or one somebody wrote on the sheet by the door. */
@Entity({ name: 'environment_reading' })
export class EnvironmentReading {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => StorageLocation, { nullable: false })
  @JoinColumn({ name: 'location_id' })
  location: StorageLocation;

  @RelationId((record: EnvironmentReading) => record.location)
  locationId: number;

  @Column({ name: 'taken_at', type: 'timestamptz' })
  takenAt: Date;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: requiredNumericTransformer,
  })
  temperature: number;

  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  humidity: number | null;

  @Column({ name: 'logger_ref', type: 'varchar', length: 64, nullable: true })
  loggerRef: string | null;

  @Column({ type: 'varchar', length: 16, default: 'LOGGER' })
  source: 'LOGGER' | 'MANUAL';
}

/**
 * A run of readings that broke a limit, once somebody or something has decided
 * where it started and where it stopped.
 *
 * <p>Stored rather than recomputed, because the assessment hangs off it: a
 * quality manager writes a finding against this row, and a recomputed excursion
 * whose boundaries moved when a late logger upload arrived would orphan it.
 */
@Entity({ name: 'environment_excursion' })
export class EnvironmentExcursion extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => StorageLocation, { nullable: false })
  @JoinColumn({ name: 'location_id' })
  location: StorageLocation;

  @RelationId((record: EnvironmentExcursion) => record.location)
  locationId: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'varchar', length: 24 })
  kind: ExcursionKind;

  @Column({ type: 'varchar', length: 16 })
  severity: ExcursionSeverity;

  @Column({
    name: 'worst_value',
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: requiredNumericTransformer,
  })
  worstValue: number;

  @Column({
    name: 'limit_value',
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: requiredNumericTransformer,
  })
  limitValue: number;

  @Column({ type: 'int' })
  readings: number;

  @Column({ name: 'assessed_at', type: 'timestamptz', nullable: true })
  assessedAt: Date | null;

  @Column({ name: 'assessed_by', type: 'varchar', length: 120, nullable: true })
  assessedBy: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  finding: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', update: false })
  declare createdAt: Date;

  isOpen(): boolean {
    return this.endedAt === null || this.endedAt === undefined;
  }

  isAssessed(): boolean {
    return this.assessedAt !== null && this.assessedAt !== undefined;
  }

  assess(by: string, finding: string, at: Date): void {
    if (!finding.trim()) {
      throw new RuleViolationError('an excursion is closed with a finding, not a tick');
    }
    if (this.isOpen()) {
      throw new RuleViolationError(
        'this excursion has not ended yet, there is nothing to assess',
      );
    }
    this.assessedBy = by;
    this.finding = finding;
    this.assessedAt = at;
  }

  /** True when work done in the room during it has to be looked at. */
  putsWorkInQuestion(): boolean {
    return this.severity !== ExcursionSeverity.MINOR;
  }

  /** How far past the limit the room got, always positive. */
  overshoot(): number {
    return Math.abs(this.worstValue - this.limitValue);
  }
}
