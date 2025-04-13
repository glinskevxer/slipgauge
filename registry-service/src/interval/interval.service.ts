import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { NotFoundError, RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { IntervalBasis, IntervalOutcome } from './interval-basis';
import { IntervalDecision, addDays, intervalDecision } from './interval-decision.entity';
import { IntervalEngine } from './interval.engine';

/**
 * Keeps the interval decision table and the instrument's own schedule in step.
 *
 * <p>Reassessment is idempotent on purpose. It runs after a certificate is
 * filed, after one is withdrawn, and from the nightly sweep, and all three
 * have to be able to run twice without leaving two live decisions behind.
 */
@Injectable()
export class IntervalService {
  private readonly log = new Logger(IntervalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly engine: IntervalEngine,
  ) {}

  /**
   * Works the interval out again from the live history and records it if it
   * differs from what is already on file.
   */
  async reassess(
    instrumentId: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<IntervalDecision> {
    const instrument = await this.load(manager, instrumentId);
    const history = await this.liveHistory(manager, instrumentId);
    const outcome = this.engine.decide(instrument, history);

    const current = await manager.getRepository(IntervalDecision).findOne({
      where: { instrument: { id: instrumentId }, superseded: false },
    });

    const effectiveFrom = history.at(-1)?.performedOn ?? instrument.acquiredOn;
    const triggeredBy = history.at(-1) ?? null;

    if (current && this.sameAnswer(current, outcome, effectiveFrom)) {
      await this.applyToInstrument(manager, instrument, current, effectiveFrom);
      return current;
    }

    if (current) {
      current.supersede();
      await manager.getRepository(IntervalDecision).save(current);
    }

    const decision = await manager
      .getRepository(IntervalDecision)
      .save(
        intervalDecision(
          instrument,
          effectiveFrom,
          outcome,
          current?.intervalDays ?? null,
          triggeredBy,
        ),
      );

    await this.applyToInstrument(manager, instrument, decision, effectiveFrom);

    this.log.log(
      `${instrument.assetTag} interval ${decision.intervalDays} days, ` +
        `${decision.basis}, due ${decision.dueDate()}`,
    );
    return decision;
  }

  /**
   * A person overriding the engine. The reason is mandatory because this is
   * the one route the accreditation body reads line by line.
   */
  async override(
    instrumentId: number,
    intervalDays: number,
    reason: string,
  ): Promise<IntervalDecision> {
    if (!reason || !reason.trim()) {
      throw new RuleViolationError('an interval override needs a written reason');
    }

    return this.dataSource.transaction(async (manager) => {
      const instrument = await this.load(manager, instrumentId);
      const clamped = instrument.instrumentClass.clampInterval(intervalDays);

      if (clamped !== intervalDays) {
        throw new RuleViolationError(
          `class ${instrument.instrumentClass.code} allows ` +
            `${instrument.instrumentClass.minIntervalDays} to ` +
            `${instrument.instrumentClass.maxIntervalDays} days, not ${intervalDays}`,
        );
      }

      const current = await manager.getRepository(IntervalDecision).findOne({
        where: { instrument: { id: instrumentId }, superseded: false },
      });

      if (current) {
        current.supersede();
        await manager.getRepository(IntervalDecision).save(current);
      }

      const history = await this.liveHistory(manager, instrumentId);
      const effectiveFrom = history.at(-1)?.performedOn ?? instrument.acquiredOn;

      const outcome: IntervalOutcome = {
        intervalDays,
        basis: IntervalBasis.MANUAL,
        consecutivePasses: 0,
        driftRatio: null,
        rationale: `set by hand to ${intervalDays} days: ${reason.trim()}`,
      };

      const decision = await manager
        .getRepository(IntervalDecision)
        .save(
          intervalDecision(
            instrument,
            effectiveFrom,
            outcome,
            current?.intervalDays ?? null,
            history.at(-1) ?? null,
          ),
        );

      await this.applyToInstrument(manager, instrument, decision, effectiveFrom);
      this.log.warn(`${instrument.assetTag} interval overridden by hand, reason ${reason.trim()}`);
      return decision;
    });
  }

  /** Every decision ever made for the instrument, newest first. */
  async historyFor(instrumentId: number): Promise<IntervalDecision[]> {
    return this.dataSource.getRepository(IntervalDecision).find({
      where: { instrument: { id: instrumentId } },
      order: { effectiveFrom: 'DESC', id: 'DESC' },
    });
  }

  async current(instrumentId: number): Promise<IntervalDecision | null> {
    return this.dataSource.getRepository(IntervalDecision).findOne({
      where: { instrument: { id: instrumentId }, superseded: false },
    });
  }

  /**
   * A decision that says the same thing about the same evidence does not need
   * a new row. Without this every nightly sweep would write one per instrument
   * and the history would be unreadable within a month.
   */
  private sameAnswer(
    current: IntervalDecision,
    outcome: IntervalOutcome,
    effectiveFrom: string,
  ): boolean {
    return (
      current.intervalDays === outcome.intervalDays &&
      current.basis === outcome.basis &&
      current.effectiveFrom === effectiveFrom
    );
  }

  private async applyToInstrument(
    manager: EntityManager,
    instrument: Instrument,
    decision: IntervalDecision,
    effectiveFrom: string,
  ): Promise<void> {
    const lastCalibrated = decision.triggeredById === null ? null : effectiveFrom;

    instrument.applySchedule(
      decision.intervalDays,
      lastCalibrated,
      addDays(effectiveFrom, decision.intervalDays),
    );
    await manager.getRepository(Instrument).save(instrument);
  }

  /** Live certificates for the instrument, oldest first, as the engine wants. */
  private async liveHistory(
    manager: EntityManager,
    instrumentId: number,
  ): Promise<CalibrationCertificate[]> {
    return manager.getRepository(CalibrationCertificate).find({
      where: { instrument: { id: instrumentId }, withdrawnAt: IsNull() },
      relations: { points: true },
      order: { performedOn: 'ASC', id: 'ASC' },
    });
  }

  private async load(manager: EntityManager, instrumentId: number): Promise<Instrument> {
    const instrument = await manager.getRepository(Instrument).findOne({
      where: { id: instrumentId },
      relations: { instrumentClass: true },
    });

    if (!instrument) {
      throw new NotFoundError('instrument', instrumentId);
    }
    return instrument;
  }
}
