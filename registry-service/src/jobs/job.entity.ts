import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { Customer } from './customer.entity';
import { JobItem } from './job-item.entity';
import { JobPriority, JobState, jobIsOpen, requireJobMove } from './job.enums';

/**
 * A batch of items that arrived together and go back together.
 *
 * <p>The job is the unit the customer thinks in and the unit the desk manages.
 * Certificates hang off instruments rather than off jobs, because an instrument
 * that comes back next year is the same instrument on a different job, and a
 * history that restarted each time would make the interval procedure useless.
 */
@Entity({ name: 'job' })
export class Job extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24, unique: true })
  reference: string;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @RelationId((job: Job) => job.customer)
  customerId: number;

  @Column({ type: 'varchar', length: 24 })
  state: JobState;

  @Column({ type: 'varchar', length: 16, default: JobPriority.STANDARD })
  priority: JobPriority;

  @Column({ name: 'received_on', type: 'date' })
  receivedOn: string;

  @Column({ name: 'promised_on', type: 'date' })
  promisedOn: string;

  @Column({ name: 'completed_on', type: 'date', nullable: true })
  completedOn: string | null;

  @Column({ name: 'dispatched_on', type: 'date', nullable: true })
  dispatchedOn: string | null;

  @Column({ name: 'received_by', type: 'varchar', length: 120 })
  receivedBy: string;

  @Column({ name: 'customer_order', type: 'varchar', length: 64, nullable: true })
  customerOrder: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  instructions: string | null;

  @OneToMany(() => JobItem, (item) => item.job, { cascade: ['insert', 'update'] })
  items: JobItem[];

  /**
   * Moves the job on. The transition table refuses anything else, so no caller
   * has to remember which states are terminal.
   */
  moveTo(state: JobState, on: string): void {
    requireJobMove(this.reference, this.state, state);

    if (state === JobState.COMPLETED) {
      this.completedOn = on;
    }
    if (state === JobState.DISPATCHED) {
      this.dispatchedOn = on;
    }
    this.state = state;
  }

  promise(on: string): void {
    if (on < this.receivedOn) {
      throw new RuleViolationError('a job cannot be promised before it arrived');
    }
    this.promisedOn = on;
  }

  withInstructions(instructions: string | null): this {
    this.instructions = instructions;
    return this;
  }

  against(customerOrder: string | null): this {
    this.customerOrder = customerOrder;
    return this;
  }

  /** True while the items are still here. */
  isOpen(): boolean {
    return jobIsOpen(this.state);
  }

  /**
   * How late the job is against its promise, in days. Zero on the promise date
   * itself, and negative while there is still time. A closed job is measured
   * against the day it was completed, not against today, so the desk's late
   * count does not keep climbing after the work is done.
   */
  latenessOn(today: string): number {
    const measured = this.completedOn ?? today;
    return daysBetween(this.promisedOn, measured);
  }

  isLateOn(today: string): boolean {
    return this.latenessOn(today) > 0;
  }

  /** The lines the bench can actually work on as things stand. */
  workableItems(): JobItem[] {
    return (this.items ?? []).filter((item) => item.isCalibratable());
  }

  /** Every line that has been raised into the register. */
  registeredItems(): JobItem[] {
    return (this.items ?? []).filter((item) => item.instrument !== null);
  }

  /** How the job reads on the desk. */
  describe(): string {
    const count = this.items?.length ?? 0;
    return `${this.reference}, ${count} item${count === 1 ? '' : 's'} for ${this.customer?.name ?? 'unknown'}`;
  }
}

/** Whole days from one ISO date to another, positive when the second is later. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  return Math.round((end - start) / 86_400_000);
}

export function job(
  reference: string,
  owner: Customer,
  receivedOn: string,
  receivedBy: string,
): Job {
  const record = new Job();

  record.reference = reference;
  record.customer = owner;
  record.state = JobState.RECEIVED;
  record.priority = JobPriority.STANDARD;
  record.receivedOn = receivedOn;
  record.promisedOn = receivedOn;
  record.completedOn = null;
  record.dispatchedOn = null;
  record.receivedBy = receivedBy;
  record.customerOrder = null;
  record.instructions = null;
  record.items = [];
  return record;
}
