import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { contentDisposition, exportFilename, toCsv } from '../common/csv';
import { RECALL_EXPORT_COLUMNS } from '../common/export-columns';
import { IntervalDecision } from '../interval/interval-decision.entity';
import { IntervalService } from '../interval/interval.service';
import { RecallService } from './recall.service';
import type { RecallEntry } from './recall-standing';

/** The parts of a decision the console shows on the interval timeline. */
export interface IntervalSummary {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly intervalDays: number;
  readonly previousIntervalDays: number | null;
  readonly delta: number;
  readonly basis: string;
  readonly consecutivePasses: number;
  readonly driftRatio: number | null;
  readonly rationale: string;
  readonly current: boolean;
}

export function toIntervalSummary(decision: IntervalDecision): IntervalSummary {
  return {
    id: decision.id,
    effectiveFrom: decision.effectiveFrom,
    intervalDays: decision.intervalDays,
    previousIntervalDays: decision.previousIntervalDays,
    delta:
      decision.previousIntervalDays === null
        ? 0
        : decision.intervalDays - decision.previousIntervalDays,
    basis: decision.basis,
    consecutivePasses: decision.consecutivePasses,
    driftRatio: decision.driftRatio,
    rationale: decision.rationale,
    current: !decision.superseded,
  };
}

@ApiTags('recalls')
@ApiBearerAuth('registry-token')
@Controller('recalls')
export class RecallController {
  constructor(
    private readonly recalls: RecallService,
    private readonly intervals: IntervalService,
  ) {}

  @Get()
  board(
    @Query('horizonDays', new DefaultValuePipe(60), ParseIntPipe) horizonDays: number,
  ): Promise<RecallEntry[]> {
    return this.recalls.board(horizonDays);
  }

  /**
   * The board as a spreadsheet. The chase list is what actually gets emailed
   * round on a Monday, so the horizon defaults to the same seven days.
   */
  @Get('export.csv')
  async exportCsv(
    @Query('horizonDays', new DefaultValuePipe(7), ParseIntPipe) horizonDays: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const entries = await this.recalls.board(horizonDays);
    const filename = exportFilename('Recalls', new Date().toISOString().slice(0, 10));

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', contentDisposition(filename));
    response.setHeader('X-Row-Count', String(entries.length));

    return toCsv(entries, RECALL_EXPORT_COLUMNS);
  }

  @Get('chase')
  chase(): Promise<RecallEntry[]> {
    return this.recalls.chaseList();
  }

  @Get('unscheduled')
  unscheduled(): Promise<RecallEntry[]> {
    return this.recalls.unscheduled();
  }

  @Get('summary')
  summary(@Query('horizonDays', new DefaultValuePipe(60), ParseIntPipe) horizonDays: number) {
    return this.recalls.summary(horizonDays);
  }

  @RequireRoles(Role.METROLOGIST)
  @Post('instruments/:instrumentId/reassessment')
  async reassess(
    @Param('instrumentId', ParseIntPipe) instrumentId: number,
  ): Promise<IntervalSummary> {
    return toIntervalSummary(await this.intervals.reassess(instrumentId));
  }

  @Get('instruments/:instrumentId/decisions')
  async decisions(
    @Param('instrumentId', ParseIntPipe) instrumentId: number,
  ): Promise<IntervalSummary[]> {
    const history = await this.intervals.historyFor(instrumentId);

    return history.map((decision) => toIntervalSummary(decision));
  }
}
