import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
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
