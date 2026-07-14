import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { ItemCondition } from '../jobs/job.enums';

/**
 * One instrument out of the laboratory, and its way back.
 *
 * <p>The condition is recorded twice on purpose. An instrument that goes out
 * serviceable and comes back damaged is the case that has to raise something,
 * and a single field would only ever hold the last answer.
 */
@Entity({ name: 'equipment_loan' })
export class EquipmentLoan extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Instrument, { nullable: false })
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument;

  @RelationId((loan: EquipmentLoan) => loan.instrument)
  instrumentId: number;

  @Column({ type: 'varchar', length: 120 })
  borrower: string;

  @Column({ type: 'varchar', length: 200 })
  destination: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  purpose: string | null;

  @Column({ name: 'issued_on', type: 'date' })
  issuedOn: string;

  @Column({ name: 'due_back_on', type: 'date' })
  dueBackOn: string;

  @Column({ name: 'returned_on', type: 'date', nullable: true })
  returnedOn: string | null;

  @Column({ name: 'issued_by', type: 'varchar', length: 120 })
  issuedBy: string;

  @Column({ name: 'received_by', type: 'varchar', length: 120, nullable: true })
  receivedBy: string | null;

  @Column({ name: 'condition_out', type: 'varchar', length: 24 })
  conditionOut: ItemCondition;

  @Column({ name: 'condition_back', type: 'varchar', length: 24, nullable: true })
  conditionBack: ItemCondition | null;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  isOut(): boolean {
    return this.returnedOn === null || this.returnedOn === undefined;
  }

  /** Days past the date it was due back. Negative while there is still time. */
  latenessOn(today: string): number {
    const measured = this.returnedOn ?? today;

    return Math.round(
      (Date.parse(`${measured}T00:00:00Z`) - Date.parse(`${this.dueBackOn}T00:00:00Z`)) /
        86_400_000,
    );
  }

  isOverdueOn(today: string): boolean {
    return this.isOut() && this.latenessOn(today) > 0;
  }

  due(on: string): this {
    if (on < this.issuedOn) {
      throw new RuleViolationError('a loan cannot be due back before it went out');
    }
    this.dueBackOn = on;
    return this;
  }

  /**
   * Books it back in. The condition on return is required rather than
   * optional: an instrument taken back without anybody looking at it is an
   * instrument nobody has checked, and that is the whole reason for the record.
   */
  bookBack(on: string, by: string, condition: ItemCondition, note: string | null): void {
    if (!this.isOut()) {
      throw new RuleViolationError(
        `this loan was already booked back in on ${this.returnedOn}`,
      );
    }
    if (on < this.issuedOn) {
      throw new RuleViolationError('a loan cannot come back before it went out');
    }
    this.returnedOn = on;
    this.receivedBy = by;
    this.conditionBack = condition;
    this.note = note ?? this.note;
  }

  /** True when it came back worse than it went out. */
  cameBackWorse(): boolean {
    return (
      this.conditionBack !== null &&
      this.conditionBack !== undefined &&
      this.conditionOut === ItemCondition.SERVICEABLE &&
      this.conditionBack !== ItemCondition.SERVICEABLE
    );
  }

  /** How the loan reads on the board. */
  describe(): string {
    const where = `${this.borrower}, ${this.destination}`;

    return this.isOut() ? `${where}, due back ${this.dueBackOn}` : `${where}, back ${this.returnedOn}`;
  }
}

export function equipmentLoan(
  instrument: Instrument,
  borrower: string,
  destination: string,
  issuedOn: string,
  issuedBy: string,
): EquipmentLoan {
  const loan = new EquipmentLoan();

  loan.instrument = instrument;
  loan.borrower = borrower.trim();
  loan.destination = destination.trim();
  loan.purpose = null;
  loan.issuedOn = issuedOn;
  loan.dueBackOn = issuedOn;
  loan.returnedOn = null;
  loan.issuedBy = issuedBy;
  loan.receivedBy = null;
  loan.conditionOut = ItemCondition.SERVICEABLE;
  loan.conditionBack = null;
  loan.note = null;
  return loan;
}
