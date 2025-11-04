import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Clock } from '../config/clock';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { IntervalService } from '../interval/interval.service';
import { AuditTrail } from '../security/audit-trail.service';
import { RecallService } from './recall.service';

/** How many instruments one sweep reassesses before it gives up for tonight. */
export const SWEEP_BATCH = 500;

export interface SweepReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly considered: number;
  readonly reassessed: number;
  readonly moved: number;
  readonly failed: number;
  readonly overdueAfter: number;
  readonly durationMs: number;
}

/**
 * Works every interval out again overnight.
 *
 * <p>Nothing here should change anything. Every event that moves an interval
 * already reassesses on the way through, so a sweep that finds a difference
 * has found a bug or a row somebody edited by hand, and both are worth a log
 * line at warning level.
 *
 * <p>It exists because the register is audited on its recall dates and
 * "nothing should have drifted" is not the same claim as "nothing has".
 */
@Injectable()
export class RecallSweepService {
  private readonly log = new Logger(RecallSweepService.name);

  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    private readonly intervals: IntervalService,
    private readonly recalls: RecallService,
    private readonly audit: AuditTrail,
    private readonly clock: Clock,
  ) {}

  async sweep(actor = 'scheduler'): Promise<SweepReport> {
    const started = this.clock.now();
    const startedAt = started.toISOString();

    const due = await this.instruments.find({
      where: { status: Not(InstrumentStatus.RETIRED) },
      order: { id: 'ASC' },
      take: SWEEP_BATCH,
    });

    let reassessed = 0;
    let moved = 0;
    let failed = 0;

    for (const instrument of due) {
      const before = instrument.intervalDays;

      try {
        const decision = await this.intervals.reassess(instrument.id);

        reassessed += 1;

        if (before !== null && before !== decision.intervalDays) {
          moved += 1;
          this.log.warn(
            `${instrument.assetTag} moved from ${before} to ${decision.intervalDays} days ` +
              `on a sweep, which should not happen: ${decision.rationale}`,
          );
        }
      } catch (failure) {
        failed += 1;
        this.log.error(`could not reassess ${instrument.assetTag}: ${String(failure)}`);
      }
    }

    const finished = this.clock.now();
    const report: SweepReport = {
      startedAt,
      finishedAt: finished.toISOString(),
      considered: due.length,
      reassessed,
      moved,
      failed,
      overdueAfter: await this.recalls.overdueCount(),
      durationMs: finished.getTime() - started.getTime(),
    };

    await this.audit.allowed(
      actor,
      'recall.sweep',
      'register',
      null,
      `${report.reassessed} reassessed, ${report.moved} moved, ${report.failed} failed, ` +
        `${report.overdueAfter} overdue`,
    );

    this.log.log(
      `sweep finished: ${report.reassessed} of ${report.considered} reassessed, ` +
        `${report.moved} moved, ${report.overdueAfter} overdue`,
    );
    return report;
  }
}
