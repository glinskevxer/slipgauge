import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';

/**
 * One occasion an instrument was used to take a reading that somebody relied
 * on. Kept deliberately thin. The register does not try to be the works order
 * system; it holds just enough to tell that system which jobs to look at.
 */
@Entity({ name: 'usage_record' })
export class UsageRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument;

  @RelationId((record: UsageRecord) => record.instrument)
  instrumentId: number;

  @Column({ name: 'used_on', type: 'date' })
  usedOn: string;

  @Column({ name: 'used_by', type: 'varchar', length: 120 })
  usedBy: string;

  @Column({ name: 'work_order', type: 'varchar', length: 64, nullable: true })
  workOrder: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  customer: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  purpose: string | null;

  @Column({ name: 'reading_count', type: 'int', default: 1 })
  readingCount: number;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  onJob(workOrder: string | null, customer: string | null, purpose: string | null): this {
    this.workOrder = workOrder;
    this.customer = customer;
    this.purpose = purpose;
    return this;
  }

  withReadings(readingCount: number): this {
    if (!Number.isInteger(readingCount) || readingCount < 1) {
      throw new RuleViolationError('a usage record needs at least one reading');
    }
    this.readingCount = readingCount;
    return this;
  }

  noting(note: string | null): this {
    this.note = note;
    return this;
  }

  /** True when this use falls inside a suspect window, both ends included. */
  fallsWithin(from: string, to: string): boolean {
    return this.usedOn >= from && this.usedOn <= to;
  }

  /** How the line reads on an impact report. */
  describe(): string {
    let text = this.usedBy;

    if (this.workOrder) {
      text += ` on ${this.workOrder}`;
    }
    if (this.customer) {
      text += ` for ${this.customer}`;
    }
    return text;
  }

  /** True when nothing here can be chased back to an outside job. */
  isInternal(): boolean {
    return !this.workOrder && !this.customer;
  }
}

export function usageRecord(instrument: Instrument, usedOn: string, usedBy: string): UsageRecord {
  const record = new UsageRecord();

  record.instrument = instrument;
  record.usedOn = usedOn;
  record.usedBy = usedBy;
  record.workOrder = null;
  record.customer = null;
  record.purpose = null;
  record.readingCount = 1;
  record.note = null;
  return record;
}
