import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { numericTransformer, requiredNumericTransformer } from '../common/numeric';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Discipline } from '../instrument/instrument.enums';

/** Proportional capability terms are stated in parts per million, as elsewhere. */
const PPM = 0.000001;

/**
 * One line of the schedule of accreditation.
 *
 * <p>A line covers a measurement over a range to a best measurement capability,
 * for a period. All four matter and the register asks about all four: work
 * outside the range, or on a date the line does not cover, is unaccredited work
 * however loudly the laboratory's letterhead says otherwise.
 */
@Entity({ name: 'accreditation_scope' })
export class AccreditationScope extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'schedule_ref', type: 'varchar', length: 64 })
  scheduleRef: string;

  @Column({ type: 'varchar', length: 32 })
  discipline: Discipline;

  /** Null when the line is written against a measurement rather than a class. */
  @ManyToOne(() => InstrumentClass, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass | null;

  @RelationId((scope: AccreditationScope) => scope.instrumentClass)
  classId: number | null;

  @Column({ type: 'varchar', length: 120 })
  measurand: string;

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
    name: 'cmc_absolute',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  cmcAbsolute: number | null;

  @Column({
    name: 'cmc_ppm',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  cmcPpm: number | null;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  /** True on a given day, before anything about the measurement is considered. */
  isLiveOn(on: string): boolean {
    if (on < this.validFrom) {
      return false;
    }
    return this.validTo === null || on <= this.validTo;
  }

  /** True when a value falls inside the range this line was granted for. */
  covers(value: number): boolean {
    return value >= this.rangeLow && value <= this.rangeHigh;
  }

  /**
   * The best the laboratory may claim at one value, which is the floor on any
   * uncertainty it reports. Stating a smaller uncertainty than the schedule
   * allows is the single thing an assessment will not let pass.
   */
  capabilityAt(value: number): number {
    const absolute = this.cmcAbsolute ?? 0;
    const proportional = (this.cmcPpm ?? 0) * PPM * Math.abs(value);

    return absolute + proportional;
  }

  over(low: number, high: number): this {
    if (high <= low) {
      throw new RuleViolationError('the top of a scope range has to sit above the bottom');
    }
    this.rangeLow = low;
    this.rangeHigh = high;
    return this;
  }

  running(from: string, to: string | null): this {
    if (to !== null && to < from) {
      throw new RuleViolationError('a schedule line cannot lapse before it starts');
    }
    this.validFrom = from;
    this.validTo = to;
    return this;
  }

  claiming(absolute: number | null, ppm: number | null): this {
    if (absolute === null && ppm === null) {
      throw new RuleViolationError('a schedule line has to state a capability');
    }
    this.cmcAbsolute = absolute;
    this.cmcPpm = ppm;
    return this;
  }

  /** How the line reads on the schedule. */
  describe(): string {
    const capability =
      this.cmcAbsolute !== null && this.cmcPpm !== null
        ? `${this.cmcAbsolute} ${this.unit} plus ${this.cmcPpm} ppm`
        : this.cmcAbsolute !== null
          ? `${this.cmcAbsolute} ${this.unit}`
          : `${this.cmcPpm} ppm`;

    return `${this.measurand}, ${this.rangeLow} to ${this.rangeHigh} ${this.unit}, ${capability}`;
  }
}

export function scopeLine(
  scheduleRef: string,
  discipline: Discipline,
  measurand: string,
  unit: string,
  validFrom: string,
): AccreditationScope {
  const line = new AccreditationScope();

  line.scheduleRef = scheduleRef;
  line.discipline = discipline;
  line.instrumentClass = null;
  line.measurand = measurand;
  line.unit = unit;
  line.rangeLow = 0;
  line.rangeHigh = 1;
  line.cmcAbsolute = null;
  line.cmcPpm = null;
  line.validFrom = validFrom;
  line.validTo = null;
  line.note = null;
  return line;
}
