import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Clock } from '../config/clock';
import { Public } from '../security/roles.decorator';

export interface HealthReport {
  readonly status: 'up' | 'down';
  readonly checkedAt: string;
  readonly checks: Readonly<Record<string, string>>;
}

/**
 * Liveness and readiness, kept apart on purpose.
 *
 * <p>Liveness says the process is running and nothing else. If it touched the
 * database, a database outage would make the orchestrator restart every
 * instance, which turns a recoverable outage into a full one. Readiness is the
 * one that checks the database, because a service that cannot read the
 * register genuinely cannot serve a request.
 */
@Public()
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  @Get('health')
  live(): HealthReport {
    return {
      status: 'up',
      checkedAt: this.clock.now().toISOString(),
      checks: { process: 'up' },
    };
  }

  @Get('health/readiness')
  @HttpCode(200)
  async ready(): Promise<HealthReport> {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
      await this.dataSource.query('select 1');
      checks['database'] = 'up';
    } catch (failure) {
      checks['database'] = `down: ${String(failure)}`.slice(0, 200);
      healthy = false;
    }

    const report: HealthReport = {
      status: healthy ? 'up' : 'down',
      checkedAt: this.clock.now().toISOString(),
      checks,
    };

    if (!healthy) {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
