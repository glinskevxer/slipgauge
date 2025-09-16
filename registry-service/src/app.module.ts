import { Module } from '@nestjs/common';

import { CalibrationModule } from './calibration/calibration.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DemoModule } from './demo/demo.module';
import { ImpactModule } from './impact/impact.module';
import { InstrumentModule } from './instrument/instrument.module';
import { IntervalModule } from './interval/interval.module';
import { ObservabilityModule } from './observability/observability.module';
import { RecallModule } from './recall/recall.module';
import { SecurityModule } from './security/security.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { UsageModule } from './usage/usage.module';

/**
 * The whole service. The order here is the order the register was built in,
 * which is also the order the rules depend on each other: an instrument before
 * a certificate, a certificate before a chain, a chain before an interval.
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ObservabilityModule,
    SecurityModule,
    InstrumentModule,
    CalibrationModule,
    TraceabilityModule,
    IntervalModule,
    RecallModule,
    UsageModule,
    ImpactModule,
    DemoModule,
  ],
})
export class AppModule {}
