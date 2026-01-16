import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import { numericTransformer } from '../common/numeric';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Discipline } from '../instrument/instrument.enums';
import type { Authorisation } from './authorisation';
import { CompetenceLevel } from './competence-level';

/**
 * One person's authorisation to do one kind of work.
 *
 * <p>Granted by name rather than by account id. Authorisations outlive
 * accounts: somebody who left three years ago signed certificates that are
 * still in date, and an assessor asks what they were authorised for at the
 * time, not whether they can still log in.
 */
@Entity({ name: 'competence' })
export class Competence extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  person: string;

  @Column({ type: 'varchar', length: 32 })
  discipline: Discipline;

  /** Null when the authorisation covers the whole discipline. */
  @ManyToOne(() => InstrumentClass, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass | null;

  @RelationId((record: Competence) => record.instrumentClass)
  classId: number | null;

  @Column({ type: 'varchar', length: 16 })
  level: CompetenceLevel;

  @Column({
    name: 'range_low',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  rangeLow: number | null;

  @Column({
    name: 'range_high',
    type: 'numeric',
    precision: 18,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  rangeHigh: number | null;

  @Column({ name: 'authorised_from', type: 'date' })
  authorisedFrom: string;

  @Column({ name: 'authorised_to', type: 'date', nullable: true })
  authorisedTo: string | null;

  @Column({ name: 'granted_by', type: 'varchar', length: 120 })
  grantedBy: string;

  @Column({ type: 'varchar', length: 400, nullable: true })
  evidence: string | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt: Date | null;

  @Column({ name: 'withdrawn_reason', type: 'varchar', length: 400, nullable: true })
  withdrawnReason: string | null;

  isWithdrawn(): boolean {
    return this.withdrawnAt !== null && this.withdrawnAt !== undefined;
  }

  /** True on a given day, before anything about the work is considered. */
  isLiveOn(on: string): boolean {
    if (this.isWithdrawn() || on < this.authorisedFrom) {
      return false;
    }
    return this.authorisedTo === null || on <= this.authorisedTo;
  }

  /** Narrows the grant to one span. Both ends or neither. */
  over(low: number | null, high: number | null): this {
    if ((low === null) !== (high === null)) {
      throw new RuleViolationError('a span is stated as a pair, or not at all');
    }
    if (low !== null && high !== null && high <= low) {
      throw new RuleViolationError('the top of a span has to sit above the bottom');
    }
    this.rangeLow = low;
    this.rangeHigh = high;
    return this;
  }

  running(from: string, to: string | null): this {
    if (to !== null && to < from) {
      throw new RuleViolationError('an authorisation cannot run out before it starts');
    }
    this.authorisedFrom = from;
    this.authorisedTo = to;
    return this;
  }

  withdraw(reason: string, at: Date): void {
    if (!reason.trim()) {
      throw new RuleViolationError('withdrawing an authorisation needs a reason');
    }
    if (this.isWithdrawn()) {
      throw new RuleViolationError(
        `${this.person}'s authorisation for ${this.discipline} was already withdrawn`,
      );
    }
    this.withdrawnAt = at;
    this.withdrawnReason = reason;
  }

  /** The shape the rules read, so the rules never touch an entity. */
  toAuthorisation(): Authorisation {
    return {
      id: this.id,
      person: this.person,
      discipline: this.discipline,
      classId: this.classId ?? this.instrumentClass?.id ?? null,
      level: this.level,
      rangeLow: this.rangeLow,
      rangeHigh: this.rangeHigh,
      authorisedFrom: this.authorisedFrom,
      authorisedTo: this.authorisedTo,
      withdrawn: this.isWithdrawn(),
    };
  }
}

export function competence(
  person: string,
  discipline: Discipline,
  level: CompetenceLevel,
  grantedBy: string,
  from: string,
): Competence {
  const record = new Competence();

  record.person = person.trim().toLowerCase();
  record.discipline = discipline;
  record.instrumentClass = null;
  record.level = level;
  record.rangeLow = null;
  record.rangeHigh = null;
  record.authorisedFrom = from;
  record.authorisedTo = null;
  record.grantedBy = grantedBy;
  record.evidence = null;
  record.withdrawnAt = null;
  record.withdrawnReason = null;
  return record;
}
