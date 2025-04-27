import { Module } from '@nestjs/common';

import { CalibrationModule } from './calibration/calibration.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ImpactModule } from './impact/impact.module';
import { InstrumentModule } from './instrument/instrument.module';
import { IntervalModule } from './interval/interval.module';
import { RecallModule } from './recall/recall.module';
import { UsageModule } from './usage/usage.module';
import { TraceabilityModule } from './traceability/traceability.module';

@Module({
  imports: [ConfigModule, DatabaseModule, InstrumentModule, CalibrationModule, TraceabilityModule, IntervalModule, RecallModule, UsageModule, ImpactModule],
})
export class AppModule {}
