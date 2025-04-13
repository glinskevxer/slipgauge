import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { Instrument } from '../instrument/instrument.entity';
import { IntervalDecision } from './interval-decision.entity';
import { IntervalEngine } from './interval.engine';
import { IntervalService } from './interval.service';

/**
 * Like the traceability module, this deliberately takes only the repositories
 * it reads rather than the calibration module itself. The calibration service
 * calls back into this one after a sheet is filed, and importing both ways
 * would be a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([IntervalDecision, Instrument, CalibrationCertificate])],
  providers: [IntervalEngine, IntervalService],
  exports: [TypeOrmModule, IntervalEngine, IntervalService],
})
export class IntervalModule {}
