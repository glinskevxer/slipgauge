import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConflictError, NotFoundError } from '../common/errors';
import { Clock } from '../config/clock';
import { addWorkingDays } from '../jobs/working-days';
import {
  CapaStage,
  NonconformitySeverity,
  NonconformitySource,
  allowedDaysFor,
  isOpen,
  stageNeededToClose,
} from './capa-stage';
import type {
  AbandonNonconformanceDto,
  AssignNonconformanceDto,
  CapaSummary,
  NonconformanceView,
  RaiseNonconformanceDto,
  RecordStageDto,
} from './dto/nonconformity.dto';
import { Nonconformance, nonconformance } from './nonconformance.entity';

/** NC-2025-001, one sequence per year, the same shape as a job reference. */
const PATTERN = /^NC-(\d{4})-(\d{3,5})$/;

/**
 * The nonconformance register.
 *
 * <p>Raising is deliberately cheap and closing is deliberately not. Anybody can
 * raise one in three fields; closing a high severity one needs four written
 * answers and the dates they were given on. A register that is hard to write to
 * and easy to close is the wrong way round, and it is the way most of them end
 * up.
 */
@Injectable()
export class NonconformityService {
  private readonly log = new Logger(NonconformityService.name);

  constructor(
    @InjectRepository(Nonconformance) private readonly records: Repository<Nonconformance>,
    private readonly clock: Clock,
  ) {}

  async raise(request: RaiseNonconformanceDto, raisedBy: string): Promise<NonconformanceView> {
    if (request.sourceRef) {
      const existing = await this.records.findOne({
        where: { source: request.source, sourceRef: request.sourceRef },
      });

      if (existing) {
        throw new ConflictError(
          `${existing.reference} was already raised against ${request.source.toLowerCase()} ` +
            `${request.sourceRef}`,
        );
      }
    }

    const today = this.clock.today();
    const record = nonconformance(
      await this.nextReference(today),
      raisedBy,
      today,
      request.source,
      request.severity,
      request.title,
      request.detail,
    );

    record.sourceRef = request.sourceRef ?? null;
    record.assignTo(
      request.owner ?? null,
      request.dueOn ?? addWorkingDays(today, allowedDaysFor(request.severity)),
    );

    const saved = await this.records.save(record);
    this.log.warn(
      `${saved.reference} raised by ${raisedBy}, ${saved.severity} severity, due ${saved.dueOn}`,
    );
    return this.toView(saved);
  }

  /**
   * Raises one off another part of the register, quietly returning the one that
   * already exists rather than failing. The room log calls this from inside a
   * sweep, and a sweep that threw because it had already raised the record
   * would stop sweeping.
   */
  async raiseFor(
    source: NonconformitySource,
    sourceRef: string,
    severity: NonconformitySeverity,
    title: string,
    detail: string,
    raisedBy = 'registry',
  ): Promise<Nonconformance> {
    const existing = await this.records.findOne({ where: { source, sourceRef } });

    if (existing) {
      return existing;
    }
    const today = this.clock.today();
    const record = nonconformance(
      await this.nextReference(today),
      raisedBy,
      today,
      source,
      severity,
      title,
      detail,
    );

    record.sourceRef = sourceRef;
    record.assignTo(null, addWorkingDays(today, allowedDaysFor(severity)));
    return this.records.save(record);
  }

  async get(reference: string): Promise<NonconformanceView> {
    return this.toView(await this.byReference(reference));
  }

  async byReference(reference: string): Promise<Nonconformance> {
    const record = await this.records.findOne({
      where: { reference: reference.trim().toUpperCase() },
    });

    if (!record) {
      throw new NotFoundError('nonconformance', reference);
    }
    return record;
  }

  /** The board: open work by default, worst and latest first. */
  async list(state?: CapaStage, includeClosed = false): Promise<NonconformanceView[]> {
    const rows = await this.records.find({ order: { raisedOn: 'DESC', id: 'DESC' } });
    const today = this.clock.today();

    const rank: Readonly<Record<NonconformitySeverity, number>> = {
      [NonconformitySeverity.HIGH]: 2,
      [NonconformitySeverity.MEDIUM]: 1,
      [NonconformitySeverity.LOW]: 0,
    };

    return rows
      .filter((row) => (state ? row.state === state : includeClosed || row.isOpen()))
      .sort(
        (a, b) =>
          rank[b.severity] - rank[a.severity] || b.latenessOn(today) - a.latenessOn(today),
      )
      .map((row) => this.toView(row));
  }

  async assign(reference: string, request: AssignNonconformanceDto): Promise<NonconformanceView> {
    const record = await this.byReference(reference);

    record.assignTo(request.owner ?? record.owner, request.dueOn ?? record.dueOn);
    return this.toView(await this.records.save(record));
  }

  /**
   * Records one stage. The stage is chosen by the caller and the entity refuses
   * anything but the next one, so the order cannot be jumped from here either.
   */
  async recordStage(
    reference: string,
    stage: CapaStage,
    request: RecordStageDto,
  ): Promise<NonconformanceView> {
    const record = await this.byReference(reference);
    const on = request.on ?? this.clock.today();

    switch (stage) {
      case CapaStage.CONTAINED:
        record.contain(request.text, on);
        break;
      case CapaStage.CAUSE_FOUND:
        record.recordCause(request.text, on);
        break;
      case CapaStage.ACTION_TAKEN:
        record.recordAction(request.text, on);
        break;
      case CapaStage.EFFECTIVENESS_CHECKED:
        record.recordEffectiveness(request.text, on);
        break;
      default:
        throw new ConflictError(`${stage} is not a stage that carries an answer`);
    }
    return this.toView(await this.records.save(record));
  }

  async close(reference: string, by: string): Promise<NonconformanceView> {
    const record = await this.byReference(reference);

    record.close(by, this.clock.today());
    this.log.log(`${record.reference} closed by ${by}`);
    return this.toView(await this.records.save(record));
  }

  async abandon(
    reference: string,
    request: AbandonNonconformanceDto,
  ): Promise<NonconformanceView> {
    const record = await this.byReference(reference);

    record.abandon(request.reason, this.clock.today());
    return this.toView(await this.records.save(record));
  }

  async summary(): Promise<CapaSummary> {
    const rows = await this.records.find();
    const today = this.clock.today();
    const year = today.slice(0, 4);
    const open = rows.filter((row) => row.isOpen());

    const byStage: Record<string, number> = {};
    for (const row of open) {
      byStage[row.state] = (byStage[row.state] ?? 0) + 1;
    }

    return {
      open: open.length,
      late: open.filter((row) => row.latenessOn(today) > 0).length,
      escalating: open.filter((row) => row.needsEscalationOn(today)).length,
      high: open.filter((row) => row.severity === NonconformitySeverity.HIGH).length,
      closedThisYear: rows.filter(
        (row) => row.state === CapaStage.CLOSED && (row.closedOn ?? '').startsWith(year),
      ).length,
      byStage,
    };
  }

  private async nextReference(today: string): Promise<string> {
    const year = today.slice(0, 4);
    const highest = await this.records
      .createQueryBuilder('nc')
      .select('max(nc.reference)', 'reference')
      .where('nc.reference like :prefix', { prefix: `NC-${year}-%` })
      .getRawOne<{ reference: string | null }>();

    const match = PATTERN.exec(highest?.reference ?? '');
    const next = (match ? Number(match[2]) : 0) + 1;

    return `NC-${year}-${String(next).padStart(3, '0')}`;
  }

  private toView(record: Nonconformance): NonconformanceView {
    const today = this.clock.today();

    return {
      id: record.id,
      reference: record.reference,
      raisedOn: record.raisedOn,
      raisedBy: record.raisedBy,
      source: record.source,
      sourceRef: record.sourceRef,
      title: record.title,
      detail: record.detail,
      severity: record.severity,
      state: record.state,
      owner: record.owner,
      dueOn: record.dueOn,
      containment: record.containment,
      containedOn: record.containedOn,
      rootCause: record.rootCause,
      causeFoundOn: record.causeFoundOn,
      correctiveAction: record.correctiveAction,
      actionTakenOn: record.actionTakenOn,
      effectiveness: record.effectiveness,
      effectivenessOn: record.effectivenessOn,
      closedOn: record.closedOn,
      closedBy: record.closedBy,
      open: isOpen(record.state),
      lateness: record.latenessOn(today),
      escalate: record.needsEscalationOn(today),
      answersGiven: record.answersGiven(),
      closesFrom: stageNeededToClose(record.severity),
    };
  }
}
