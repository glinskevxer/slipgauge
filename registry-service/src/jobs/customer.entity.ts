import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';

/**
 * Somebody who sends items in. Thin on purpose: the finance system holds the
 * account, the addresses and the credit position, and duplicating any of that
 * here would give the desk two answers to the same question.
 *
 * <p>What is here is what the bench needs while the item is in the building.
 */
@Entity({ name: 'customer' })
export class Customer extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 120, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 200, nullable: true })
  contactEmail: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 40, nullable: true })
  contactPhone: string | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  address: string | null;

  /**
   * True when this customer's work has to be done under the accreditation. It
   * changes what contract review is allowed to wave through, so it lives on the
   * customer rather than being asked again on every job.
   */
  @Column({ name: 'accredited_required', type: 'boolean', default: false })
  accreditedRequired: boolean;

  /** Working days the desk quotes this customer by default. */
  @Column({ name: 'turnaround_days', type: 'int', default: 10 })
  turnaroundDays: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  contactedBy(name: string | null, email: string | null, phone: string | null): this {
    this.contactName = name;
    this.contactEmail = email;
    this.contactPhone = phone;
    return this;
  }

  quoting(turnaroundDays: number): this {
    if (!Number.isInteger(turnaroundDays) || turnaroundDays < 1 || turnaroundDays > 180) {
      throw new RuleViolationError('a turnaround has to be between 1 and 180 working days');
    }
    this.turnaroundDays = turnaroundDays;
    return this;
  }

  /**
   * A customer is not deleted. Work already done for them has to stay
   * readable, and an assessment reads the customer name off a certificate that
   * was issued years ago.
   */
  close(): void {
    this.active = false;
  }

  reopen(): void {
    this.active = true;
  }

  /** How the customer reads on a job line and on a certificate. */
  describe(): string {
    return `${this.name} (${this.code})`;
  }

  /** True when there is somebody to ring about a query on a job. */
  isReachable(): boolean {
    return Boolean(this.contactEmail || this.contactPhone);
  }
}

export function customer(code: string, name: string): Customer {
  const record = new Customer();

  record.code = code.trim().toUpperCase();
  record.name = name.trim();
  record.contactName = null;
  record.contactEmail = null;
  record.contactPhone = null;
  record.address = null;
  record.accreditedRequired = false;
  record.turnaroundDays = 10;
  record.active = true;
  record.note = null;
  return record;
}
