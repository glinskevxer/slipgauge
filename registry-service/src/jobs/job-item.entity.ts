import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import { RuleViolationError } from '../common/errors';
import { numericTransformer } from '../common/numeric';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Instrument } from '../instrument/instrument.entity';
import { ItemCondition, JobService } from './job.enums';
import { Job } from './job.entity';

/**
 * One line on a job: a thing that arrived, and what the customer wants doing to
 * it.
 *
 * <p>The line carries the customer's own description of the item as well as the
 * class the desk decided it belongs to. They are not the same thing and both
 * are worth keeping. The description is what gets read back to the customer on
 * the phone; the class is what decides which tolerance profile applies.
 */
@Entity({ name: 'job_item' })
export class JobItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Job, (job) => job.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @RelationId((item: JobItem) => item.job)
  jobId: number;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({ type: 'varchar', length: 24 })
  service: JobService;

  @Column({ type: 'varchar', length: 300 })
  description: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  model: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 80, nullable: true })
  serialNumber: string | null;

  @ManyToOne(() => InstrumentClass, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass | null;

  @RelationId((item: JobItem) => item.instrumentClass)
  classId: number | null;

  /**
   * The register row this line became. Null until the job is accepted, which
   * is the whole reason a job item is its own table.
   */
  @ManyToOne(() => Instrument, { nullable: true })
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument | null;

  @RelationId((item: JobItem) => item.instrument)
  instrumentId: number | null;

  @Column({ type: 'varchar', length: 24, default: ItemCondition.SERVICEABLE })
  condition: ItemCondition;

  @Column({ type: 'varchar', length: 400, nullable: true })
  accessories: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  /**
   * The top of the range the customer says the item reads to. Written off the
   * label rather than measured, and only used by contract review to ask whether
   * the laboratory covers it.
   */
  @Column({
    name: 'range_high',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  rangeHigh: number | null;

  /** The customer stated what they want it held to, which a verification needs. */
  @Column({ name: 'tolerance_stated', type: 'boolean', default: false })
  toleranceStated: boolean;

  identifiedAs(manufacturer: string | null, model: string | null, serial: string | null): this {
    this.manufacturer = manufacturer;
    this.model = model;
    this.serialNumber = serial;
    return this;
  }

  arrivedIn(condition: ItemCondition, accessories: string | null): this {
    this.condition = condition;
    this.accessories = accessories;
    return this;
  }

  /**
   * Ties the line to the register row that was raised for it. Once tied it
   * stays tied: a line pointed at a second instrument would leave the first one
   * in the register with nothing explaining where it came from.
   */
  registeredAs(instrument: Instrument): this {
    if (this.instrument && this.instrument.id !== instrument.id) {
      throw new RuleViolationError(
        `line ${this.lineNumber} is already registered as ${this.instrument.assetTag}`,
      );
    }
    this.instrument = instrument;
    return this;
  }

  /**
   * True when the line can be calibrated as it stands. A damaged item is not
   * refused, it is quoted for repair first, and a calibration certificate on a
   * damaged item is worth nothing.
   */
  isCalibratable(): boolean {
    return (
      this.condition === ItemCondition.SERVICEABLE &&
      (this.service === JobService.CALIBRATION || this.service === JobService.VERIFICATION)
    );
  }

  /** True when the desk has enough to raise a register row from this line. */
  isIdentified(): boolean {
    return Boolean(this.instrumentClass && this.manufacturer && this.model && this.serialNumber);
  }

  /** How the line reads on the receiving note. */
  describe(): string {
    const parts = [this.description];

    if (this.manufacturer || this.model) {
      parts.push([this.manufacturer, this.model].filter(Boolean).join(' '));
    }
    if (this.serialNumber) {
      parts.push(`s/n ${this.serialNumber}`);
    }
    return parts.join(', ');
  }
}

export function jobItem(
  lineNumber: number,
  service: JobService,
  description: string,
): JobItem {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    throw new RuleViolationError('a job line is numbered from one');
  }

  const item = new JobItem();

  item.lineNumber = lineNumber;
  item.service = service;
  item.description = description.trim();
  item.manufacturer = null;
  item.model = null;
  item.serialNumber = null;
  item.instrumentClass = null;
  item.instrument = null;
  item.condition = ItemCondition.SERVICEABLE;
  item.accessories = null;
  item.note = null;
  item.rangeHigh = null;
  item.toleranceStated = false;
  return item;
}
