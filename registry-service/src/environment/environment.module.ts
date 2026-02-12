import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { CalibrationModule } from '../calibration/calibration.module';
import { InstrumentModule } from '../instrument/instrument.module';
import { EnvironmentController } from './environment.controller';
import {
  EnvironmentExcursion,
  EnvironmentLimitRecord,
  EnvironmentReading,
} from './environment.entities';
import { EnvironmentService } from './environment.service';

/**
 * What the rooms were doing. Depends on the register for its idea of a room and
 * on nothing else, so a laboratory with no loggers simply has no readings.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EnvironmentLimitRecord,
      EnvironmentReading,
      EnvironmentExcursion,
      CalibrationCertificate,
    ]),
    InstrumentModule,
    CalibrationModule,
  ],
  controllers: [EnvironmentController],
  providers: [EnvironmentService],
  exports: [TypeOrmModule, EnvironmentService],
})
export class EnvironmentModule {}
