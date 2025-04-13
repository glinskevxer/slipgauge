import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { numericTransformer } from '../common/numeric';
import { Instrument } from '../instrument/instrument.entity';
import { IntervalBasis, IntervalOutcome } from './interval-basis';

/**
 * One recorded answer from the interval engine. Rows are never edited; a new
 * decision supersedes the last one, which is what lets the console show the
 * interval as it moved over the instrument's life.
 */
@Entity({ name: 'interval_decision' })
export class IntervalDecision {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Instrument)
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument;

  @RelationId((decision: IntervalDecision) => decision.instrument)
  instrumentId: number;

  @CreateDateColumn({ name: 'decided_at', type: 'timestamptz' })
  decidedAt: Date;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'interval_days', type: 'int' })
  intervalDays: number;

  @Column({ name: 'previous_interval_days', type: 'int', nullable: true })
  previousIntervalDays: number | null;

  @Column({ type: 'varchar', length: 24 })
  basis: IntervalBasis;

  @Column({ name: 'consecutive_passes', type: 'int', default: 0 })
  consecutivePasses: number;

  @Column({
    name: 'drift_ratio',
    type: 'numeric',
    precision: 10,
    scale: 6,
    nullable: true,
    transformer: numericTransformer,
  })
  driftRatio: number | null;

  @ManyToOne(() => CalibrationCertificate, { nullable: true })
  @JoinColumn({ name: 'triggered_by_id' })
  triggeredBy: CalibrationCertificate | null;

  @RelationId((decision: IntervalDecision) => decision.triggeredBy)
  triggeredById: number | null;

  @Column({ type: 'varchar', length: 400 })
  rationale: string;

  @Column({ type: 'boolean', default: false })
  superseded: boolean;

  /** The day the instrument falls due if this decision is the live one. */
  dueDate(): string {
    return addDays(this.effectiveFrom, this.intervalDays);
  }

  /** True when the decision changed the number rather than confirming it. */
  moved(): boolean {
    return this.previousIntervalDays !== null && this.previousIntervalDays !== this.intervalDays;
  }

  supersede(): void {
    this.superseded = true;
  }
}

/**
 * Builds a decision from what the engine worked out. The previous interval is
 * carried across so the console can show the step without joining back to the
 * row before it.
 */
export function intervalDecision(
  instrument: Instrument,
  effectiveFrom: string,
  outcome: IntervalOutcome,
  previousIntervalDays: number | null,
  triggeredBy: CalibrationCertificate | null,
): IntervalDecision {
  const decision = new IntervalDecision();

  decision.instrument = instrument;
  decision.effectiveFrom = effectiveFrom;
  decision.intervalDays = outcome.intervalDays;
  decision.previousIntervalDays = previousIntervalDays;
  decision.basis = outcome.basis;
  decision.consecutivePasses = outcome.consecutivePasses;
  decision.driftRatio = outcome.driftRatio;
  decision.triggeredBy = triggeredBy;
  decision.rationale = outcome.rationale.slice(0, 400);
  decision.superseded = false;
  return decision;
}

/** Dates are ISO strings everywhere in this service, so this stays local. */
export function addDays(from: string, days: number): string {
  const date = new Date(`${from}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
