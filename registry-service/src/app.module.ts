import { Module } from '@nestjs/common';

import { CalibrationModule } from './calibration/calibration.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { InstrumentModule } from './instrument/instrument.module';
import { IntervalModule } from './interval/interval.module';
import { TraceabilityModule } from './traceability/traceability.module';

@Module({
  imports: [ConfigModule, DatabaseModule, InstrumentModule, CalibrationModule, TraceabilityModule, IntervalModule],
})
export class AppModule {}
