import { Controller, Get, Header } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';

import { Clock } from '../config/clock';
import { ImpactAssessment } from '../impact/impact-assessment.entity';
import { ImpactStatus } from '../impact/impact-severity';
import { Instrument } from '../instrument/instrument.entity';
import { InstrumentStatus } from '../instrument/instrument.enums';
import { Public } from '../security/roles.decorator';
import { RegistryMetrics } from './registry-metrics.service';

/**
 * The scrape endpoint. Public because the scraper is inside the network and
 * has no way to hold a token, which is the usual arrangement and the reason
 * nothing identifying goes into a label.
 */
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: RegistryMetrics,
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    @InjectRepository(ImpactAssessment)
    private readonly assessments: Repository<ImpactAssessment>,
    private readonly clock: Clock,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(): Promise<string> {
    // The two gauges are read at scrape time rather than kept up to date on
    // every write. They are counts over the whole register, and a counter that
    // has to be right after a rollback is a counter that will not be.
    const [overdue, open] = await Promise.all([
      this.instruments.count({
        where: { nextDueOn: LessThan(this.clock.today()), status: Not(InstrumentStatus.RETIRED) },
      }),
      this.assessments.count({ where: { status: Not(ImpactStatus.CLOSED) } }),
    ]);

    this.metrics.overdueInstruments(overdue);
    this.metrics.openAssessments(open);
    return this.metrics.render();
  }
}
