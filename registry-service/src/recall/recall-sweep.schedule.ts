import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RecallSweepService } from './recall-sweep.service';

/**
 * Ten past two in the morning, which is after the overnight backup and before
 * the first shift. Deliberately not on the hour: everything else in the
 * building is on the hour.
 */
export const SWEEP_CRON = '10 2 * * *';

/**
 * The clock that starts the sweep, kept apart from the sweep itself.
 *
 * <p>The service is called from a test and from an administrator's button as
 * well, and neither of those wants a scheduler attached. Keeping the trigger
 * in its own class also means the whole thing can be switched off with one
 * environment variable rather than by commenting a decorator out.
 */
@Injectable()
export class RecallSweepSchedule {
  private readonly log = new Logger(RecallSweepSchedule.name);

  constructor(private readonly sweep: RecallSweepService) {}

  @Cron(SWEEP_CRON, { name: 'recall-sweep' })
  async run(): Promise<void> {
    if (process.env['REGISTRY_SWEEP_ENABLED'] === 'false') {
      this.log.log('the nightly sweep is switched off');
      return;
    }

    try {
      await this.sweep.sweep('scheduler');
    } catch (failure) {
      // A sweep that throws must not take the scheduler down with it, or the
      // next one never runs either.
      this.log.error(`the nightly sweep failed: ${String(failure)}`);
    }
  }
}
