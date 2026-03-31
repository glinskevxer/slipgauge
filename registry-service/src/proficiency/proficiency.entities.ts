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
import { InvalidTransitionError, RuleViolationError } from '../common/errors';
import { numericTransformer, requiredNumericTransformer } from '../common/numeric';
import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Instrument } from '../instrument/instrument.entity';
import { Discipline } from '../instrument/instrument.enums';
import {
  ProficiencyOutcome,
  ProficiencyResult as ScorableResult,
  enNumber,
  overallOutcome,
  zScore,
} from './scoring';

export enum RoundState {
  /** The artefact is here or on its way. Nothing has been sent back. */
  OPEN = 'OPEN',
  /** We have reported. The scheme has not. */
  SUBMITTED = 'SUBMITTED',
  /** The scheme's report is in and every line is scored. */
  SCORED = 'SCORED',
  /** The scheme pulled the round, or we did not take part after all. */
  WITHDRAWN = 'WITHDRAWN',
}

const MOVES: Readonly<Record<RoundState, readonly RoundState[]>> = {
  [RoundState.OPEN]: [RoundState.SUBMITTED, RoundState.WITHDRAWN],
  [RoundState.SUBMITTED]: [RoundState.SCORED, RoundState.WITHDRAWN],
  [RoundState.SCORED]: [],
  [RoundState.WITHDRAWN]: [],
};

/** One artefact from one scheme, with a closing date. */
@Entity({ name: 'proficiency_round' })
export class ProficiencyRound extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 48, unique: true })
  reference: string;

  @Column({ type: 'varchar', length: 160 })
  scheme: string;

  @Column({ type: 'varchar', length: 160 })
  provider: string;

  @Column({ type: 'varchar', length: 32 })
  discipline: Discipline;

  @ManyToOne(() => InstrumentClass, { nullable: true })
  @JoinColumn({ name: 'class_id' })
  instrumentClass: InstrumentClass | null;

  @RelationId((round: ProficiencyRound) => round.instrumentClass)
  classId: number | null;

  @Column({ type: 'varchar', length: 120 })
  measurand: string;

  @Column({ type: 'varchar', length: 24 })
  unit: string;

  @Column({ name: 'opened_on', type: 'date' })
  openedOn: string;

  @Column({ name: 'closes_on', type: 'date' })
  closesOn: string;

  @Column({ name: 'reported_on', type: 'date', nullable: true })
  reportedOn: string | null;

  @Column({ type: 'varchar', length: 16 })
  state: RoundState;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  @OneToMany(() => ProficiencyResultRow, (row) => row.round, { cascade: ['insert'] })
  results: ProficiencyResultRow[];

  moveTo(state: RoundState, on: string): void {
    if (!(MOVES[this.state] ?? []).includes(state)) {
      const options = MOVES[this.state] ?? [];

      throw new InvalidTransitionError(
        `${this.reference} is ${this.state} and can only move to ` +
          `${options.length ? options.join(', ') : 'nothing, it is finished'}`,
      );
    }
    if (state === RoundState.SCORED) {
      this.reportedOn = on;
    }
    this.state = state;
  }

  isOpen(): boolean {
    return this.state === RoundState.OPEN || this.state === RoundState.SUBMITTED;
  }

  /** True when the closing date has gone and we have not reported. */
  isOverdueOn(today: string): boolean {
    return this.state === RoundState.OPEN && today > this.closesOn;
  }

  /** The worst outcome across every line, which is the round's own outcome. */
  worstOutcome(): ProficiencyOutcome {
    const rank: Readonly<Record<ProficiencyOutcome, number>> = {
      [ProficiencyOutcome.NOT_SCORED]: 0,
      [ProficiencyOutcome.SATISFACTORY]: 1,
      [ProficiencyOutcome.QUESTIONABLE]: 2,
      [ProficiencyOutcome.UNSATISFACTORY]: 3,
    };

    return (this.results ?? []).reduce<ProficiencyOutcome>(
      (worst, row) => (rank[row.outcome] > rank[worst] ? row.outcome : worst),
      ProficiencyOutcome.NOT_SCORED,
    );
  }
}

/** One measurement we reported in a round, and how it scored. */
@Entity({ name: 'proficiency_result' })
export class ProficiencyResultRow {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ProficiencyRound, (round) => round.results, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round: ProficiencyRound;

  @RelationId((row: ProficiencyResultRow) => row.round)
  roundId: number;

  @Column({ name: 'sequence_no', type: 'int' })
  sequenceNo: number;

  @Column({ name: 'performed_by', type: 'varchar', length: 120 })
  performedBy: string;

  @ManyToOne(() => Instrument, { nullable: true })
  @JoinColumn({ name: 'instrument_id' })
  instrument: Instrument | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 6,
    transformer: requiredNumericTransformer,
  })
  nominal: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 9,
    transformer: requiredNumericTransformer,
  })
  reported: number;

  @Column({
    name: 'reported_uncertainty',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  reportedUncertainty: number | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  assigned: number | null;

  @Column({
    name: 'assigned_uncertainty',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  assignedUncertainty: number | null;

  @Column({
    name: 'standard_deviation',
    type: 'numeric',
    precision: 18,
    scale: 9,
    nullable: true,
    transformer: numericTransformer,
  })
  standardDeviation: number | null;

  @Column({
    name: 'en_number',
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  enNumber: number | null;

  @Column({
    name: 'z_score',
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  zScore: number | null;

  @Column({ type: 'varchar', length: 16, default: ProficiencyOutcome.NOT_SCORED })
  outcome: ProficiencyOutcome;

  @Column({ type: 'varchar', length: 400, nullable: true })
  comment: string | null;

  /** The shape the scoring rules read. */
  toScorable(): ScorableResult {
    return {
      reported: this.reported,
      reportedUncertainty: this.reportedUncertainty,
      assigned: this.assigned ?? this.reported,
      assignedUncertainty: this.assignedUncertainty,
      standardDeviation: this.standardDeviation,
    };
  }

  /**
   * Takes the scheme's report for this line and scores it.
   *
   * <p>Both scores are stored beside the outcome. An assessor asks how a result
   * was graded, and "we would compute it the same way today" is a different
   * answer from "here is what it came out as".
   */
  score(
    assigned: number,
    assignedUncertainty: number | null,
    standardDeviation: number | null,
  ): void {
    if (this.assigned !== null && this.assigned !== undefined) {
      throw new RuleViolationError(
        `line ${this.sequenceNo} has already been scored against ${this.assigned}`,
      );
    }
    this.assigned = assigned;
    this.assignedUncertainty = assignedUncertainty;
    this.standardDeviation = standardDeviation;

    const scorable = this.toScorable();

    this.enNumber = round4(enNumber(scorable));
    this.zScore = round4(zScore(scorable));
    this.outcome = overallOutcome(scorable);
  }

  isScored(): boolean {
    return this.outcome !== ProficiencyOutcome.NOT_SCORED;
  }
}

function round4(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10_000) / 10_000;
}

export function proficiencyRound(
  reference: string,
  scheme: string,
  provider: string,
  discipline: Discipline,
  measurand: string,
  unit: string,
  openedOn: string,
  closesOn: string,
): ProficiencyRound {
  const record = new ProficiencyRound();

  record.reference = reference;
  record.scheme = scheme;
  record.provider = provider;
  record.discipline = discipline;
  record.instrumentClass = null;
  record.measurand = measurand;
  record.unit = unit;
  record.openedOn = openedOn;
  record.closesOn = closesOn;
  record.reportedOn = null;
  record.state = RoundState.OPEN;
  record.note = null;
  record.results = [];
  return record;
}
