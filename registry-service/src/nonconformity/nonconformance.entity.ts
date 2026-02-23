import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';
import { RuleViolationError } from '../common/errors';
import {
  CapaStage,
  NonconformitySeverity,
  NonconformitySource,
  isOpen,
  latenessOf,
  mayClose,
  needsEscalation,
  requireMove,
  stageNeededToClose,
} from './capa-stage';

/**
 * One thing that went wrong, and the four answers that close it.
 *
 * <p>Each stage writes its text and its date together, through a method that
 * refuses one without the other. That pairing is the whole design: a stage with
 * a date and no text is a tick in a box, and a CAPA system full of ticks is the
 * thing an assessor spends the afternoon on.
 */
@Entity({ name: 'nonconformance' })
export class Nonconformance extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24, unique: true })
  reference: string;

  @Column({ name: 'raised_on', type: 'date' })
  raisedOn: string;

  @Column({ name: 'raised_by', type: 'varchar', length: 120 })
  raisedBy: string;

  @Column({ type: 'varchar', length: 24 })
  source: NonconformitySource;

  /** The excursion id, certificate number or audit reference it came off. */
  @Column({ name: 'source_ref', type: 'varchar', length: 64, nullable: true })
  sourceRef: string | null;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  detail: string;

  @Column({ type: 'varchar', length: 16 })
  severity: NonconformitySeverity;

  @Column({ type: 'varchar', length: 24 })
  state: CapaStage;

  @Column({ type: 'varchar', length: 120, nullable: true })
  owner: string | null;

  @Column({ name: 'due_on', type: 'date', nullable: true })
  dueOn: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  containment: string | null;

  @Column({ name: 'contained_on', type: 'date', nullable: true })
  containedOn: string | null;

  @Column({ name: 'root_cause', type: 'varchar', length: 1000, nullable: true })
  rootCause: string | null;

  @Column({ name: 'cause_found_on', type: 'date', nullable: true })
  causeFoundOn: string | null;

  @Column({ name: 'corrective_action', type: 'varchar', length: 1000, nullable: true })
  correctiveAction: string | null;

  @Column({ name: 'action_taken_on', type: 'date', nullable: true })
  actionTakenOn: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  effectiveness: string | null;

  @Column({ name: 'effectiveness_on', type: 'date', nullable: true })
  effectivenessOn: string | null;

  @Column({ name: 'closed_on', type: 'date', nullable: true })
  closedOn: string | null;

  @Column({ name: 'closed_by', type: 'varchar', length: 120, nullable: true })
  closedBy: string | null;

  assignTo(owner: string | null, dueOn: string | null): this {
    if (dueOn !== null && dueOn < this.raisedOn) {
      throw new RuleViolationError('a nonconformance cannot be due before it was raised');
    }
    this.owner = owner;
    this.dueOn = dueOn;
    return this;
  }

  contain(text: string, on: string): void {
    requireMove(this.reference, this.state, CapaStage.CONTAINED);
    this.containment = this.requireText(text, 'containment');
    this.containedOn = on;
    this.state = CapaStage.CONTAINED;
  }

  recordCause(text: string, on: string): void {
    requireMove(this.reference, this.state, CapaStage.CAUSE_FOUND);
    this.rootCause = this.requireText(text, 'a root cause');
    this.causeFoundOn = on;
    this.state = CapaStage.CAUSE_FOUND;
  }

  recordAction(text: string, on: string): void {
    requireMove(this.reference, this.state, CapaStage.ACTION_TAKEN);
    this.correctiveAction = this.requireText(text, 'a corrective action');
    this.actionTakenOn = on;
    this.state = CapaStage.ACTION_TAKEN;
  }

  recordEffectiveness(text: string, on: string): void {
    requireMove(this.reference, this.state, CapaStage.EFFECTIVENESS_CHECKED);
    this.effectiveness = this.requireText(text, 'an effectiveness check');
    this.effectivenessOn = on;
    this.state = CapaStage.EFFECTIVENESS_CHECKED;
  }

  /**
   * Closes it, if the severity allows closing from here. The refusal names the
   * stage that is missing rather than saying no, because the person closing it
   * is usually the person who could do the missing stage.
   */
  close(by: string, on: string): void {
    if (!isOpen(this.state)) {
      throw new RuleViolationError(`${this.reference} is already ${this.state.toLowerCase()}`);
    }
    if (!mayClose(this.state, this.severity)) {
      throw new RuleViolationError(
        `${this.reference} is ${this.severity.toLowerCase()} severity and cannot close ` +
          `until it reaches ${stageNeededToClose(this.severity).toLowerCase()}`,
      );
    }
    this.state = CapaStage.CLOSED;
    this.closedBy = by;
    this.closedOn = on;
  }

  abandon(reason: string, on: string): void {
    requireMove(this.reference, this.state, CapaStage.ABANDONED);
    this.detail = `${this.detail}\n\nabandoned: ${this.requireText(reason, 'a reason')}`;
    this.state = CapaStage.ABANDONED;
    this.closedOn = on;
    this.closedBy = this.owner ?? this.raisedBy;
  }

  isOpen(): boolean {
    return isOpen(this.state);
  }

  latenessOn(today: string): number {
    return latenessOf(this.dueOn, this.closedOn, today);
  }

  needsEscalationOn(today: string): boolean {
    return needsEscalation(this.severity, this.state, this.dueOn, today);
  }

  /** How many of the four answers are written down. */
  answersGiven(): number {
    return [this.containment, this.rootCause, this.correctiveAction, this.effectiveness].filter(
      (answer) => answer !== null,
    ).length;
  }

  private requireText(text: string, what: string): string {
    if (!text || !text.trim()) {
      throw new RuleViolationError(`${this.reference} needs ${what} written down, not a date`);
    }
    return text.trim();
  }
}

export function nonconformance(
  reference: string,
  raisedBy: string,
  raisedOn: string,
  source: NonconformitySource,
  severity: NonconformitySeverity,
  title: string,
  detail: string,
): Nonconformance {
  const record = new Nonconformance();

  record.reference = reference;
  record.raisedBy = raisedBy;
  record.raisedOn = raisedOn;
  record.source = source;
  record.sourceRef = null;
  record.severity = severity;
  record.state = CapaStage.RAISED;
  record.title = title.trim();
  record.detail = detail.trim();
  record.owner = null;
  record.dueOn = null;
  record.containment = null;
  record.containedOn = null;
  record.rootCause = null;
  record.causeFoundOn = null;
  record.correctiveAction = null;
  record.actionTakenOn = null;
  record.effectiveness = null;
  record.effectivenessOn = null;
  record.closedOn = null;
  record.closedBy = null;
  return record;
}
