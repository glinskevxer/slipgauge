import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationModule } from '../calibration/calibration.module';
import { CertificateStandard } from './certificate-standard.entity';
import { TraceabilityValidator } from './traceability.validator';

@Module({
  imports: [TypeOrmModule.forFeature([CertificateStandard]), CalibrationModule],
  providers: [TraceabilityValidator],
  exports: [TypeOrmModule, TraceabilityValidator],
})
export class TraceabilityModule {}
