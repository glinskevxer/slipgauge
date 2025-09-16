import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { DemoEstateService } from './demo-estate.service';

/**
 * Loads the demo laboratory on start up, and only when somebody has asked for
 * it by name.
 *
 * <p>The switch is separate from the service on purpose. The service's own
 * test needs to call it inside a transaction that rolls back, and a start up
 * hook writes outside any transaction, which would leave a laboratory behind
 * for every other suite sharing the database.
 */
@Injectable()
export class DemoEstateBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger(DemoEstateBootstrap.name);

  constructor(private readonly demo: DemoEstateService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env['REGISTRY_DEMO_ESTATE'] !== 'true') {
      return;
    }

    this.log.warn('REGISTRY_DEMO_ESTATE is on, loading the demo laboratory');
    await this.demo.load();
  }
}
