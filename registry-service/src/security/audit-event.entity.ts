import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditOutcome {
  ALLOWED = 'ALLOWED',
  DENIED = 'DENIED',
  FAILED = 'FAILED',
}

/**
 * One line of the audit trail. Append only and never joined to anything: the
 * subject is written as text so the trail survives the row it names being
 * archived, which is the whole point of keeping it.
 */
@Entity({ name: 'audit_event' })
export class AuditEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 64 })
  actor: string;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 64 })
  subject: string;

  @Column({ name: 'subject_id', type: 'varchar', length: 64, nullable: true })
  subjectId: string | null;

  @Column({ type: 'varchar', length: 16 })
  outcome: AuditOutcome;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detail: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  correlation: string | null;
}

export function auditEvent(
  actor: string,
  action: string,
  subject: string,
  subjectId: string | null,
  outcome: AuditOutcome,
  detail: string | null = null,
  correlation: string | null = null,
): AuditEvent {
  const event = new AuditEvent();

  event.actor = actor.slice(0, 64);
  event.action = action.slice(0, 64);
  event.subject = subject.slice(0, 64);
  event.subjectId = subjectId === null ? null : subjectId.slice(0, 64);
  event.outcome = outcome;
  event.detail = detail === null ? null : detail.slice(0, 1000);
  event.correlation = correlation;
  return event;
}
