import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { ImpactItem } from './impact-item.entity';
import { ImpactSeverity, ImpactStatus, severityFrom } from './impact-severity';

/**
 * The record raised when an instrument is found out of tolerance. It owns the
 * suspect window, which runs from the last calibration the instrument was
 * known good at to the day the failure was found, and everything the cascade
 * caught inside it.
 */
@Entity({ name: 'impact_assessment' })
export class ImpactAssessment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CalibrationCertificate)
  @JoinColumn({ name: 'trigger_cert_id' })
  trigger: CalibrationCertificate;

  @RelationId((assessment: ImpactAssessment) => assessment.trigger)
  triggerId: number;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument;

  @RelationId((assessment: ImpactAssessment) => assessment.instrument)
  instrumentId: number;

  @CreateDateColumn({ name: 'raised_at', type: 'timestamptz' })
  raisedAt: Date;

  @Column({ name: 'window_from', type: 'date' })
  windowFrom: string;

  @Column({ name: 'window_to', type: 'date' })
  windowTo: string;

  @Column({ type: 'varchar', length: 16 })
  status: ImpactStatus;

  @Column({ type: 'varchar', length: 16 })
  severity: ImpactSeverity;

  @Column({ name: 'max_depth', type: 'int', default: 0 })
  maxDepth: number;

  @Column({ name: 'item_count', type: 'int', default: 0 })
  itemCount: number;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by', type: 'varchar', length: 120, nullable: true })
  closedBy: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  conclusion: string | null;

  @OneToMany(() => ImpactItem, (item) => item.assessment, { cascade: true })
  items: ImpactItem[];

  add(item: ImpactItem): void {
    this.items = this.items ?? [];
    item.assessment = this;
    this.items.push(item);
  }

  /** Items shallowest first, then in the order they happened. */
  orderedItems(): ImpactItem[] {
    return [...(this.items ?? [])].sort(
      (left, right) => left.depth - right.depth || left.occurredOn.localeCompare(right.occurredOn),
    );
  }

  /** Fixes the counts and the severity once the cascade has finished walking. */
  settle(criticalStandardsHit: number): void {
    const items = this.items ?? [];

    this.itemCount = items.length;
    this.maxDepth = items.reduce((deepest, item) => Math.max(deepest, item.depth), 0);
    this.severity = severityFrom(this.itemCount, this.maxDepth, criticalStandardsHit);
    this.status = ImpactStatus.ASSESSED;
  }

  close(by: string, conclusion: string, at: Date): void {
    if (!conclusion?.trim()) {
      throw new RuleViolationError('closing an assessment needs a conclusion');
    }
    if (this.status === ImpactStatus.CLOSED) {
      throw new RuleViolationError('this assessment was already closed');
    }
    if ((this.items ?? []).some((item) => !item.settled())) {
      throw new RuleViolationError('every item has to be disposed of before the assessment closes');
    }
    this.status = ImpactStatus.CLOSED;
    this.closedBy = by;
    this.conclusion = conclusion.trim();
    this.closedAt = at;
  }

  isOpen(): boolean {
    return this.status !== ImpactStatus.CLOSED;
  }

  /** How many lines still need somebody to look at them. */
  pendingCount(): number {
    return (this.items ?? []).filter((item) => !item.settled()).length;
  }
}

export function impactAssessment(
  trigger: CalibrationCertificate,
  instrument: Instrument,
  windowFrom: string,
  windowTo: string,
): ImpactAssessment {
  if (windowFrom > windowTo) {
    throw new RuleViolationError('the suspect window runs backwards');
  }

  const assessment = new ImpactAssessment();

  assessment.trigger = trigger;
  assessment.instrument = instrument;
  assessment.windowFrom = windowFrom;
  assessment.windowTo = windowTo;
  assessment.status = ImpactStatus.OPEN;
  assessment.severity = ImpactSeverity.NONE;
  assessment.maxDepth = 0;
  assessment.itemCount = 0;
  assessment.closedAt = null;
  assessment.closedBy = null;
  assessment.conclusion = null;
  assessment.items = [];
  return assessment;
}
