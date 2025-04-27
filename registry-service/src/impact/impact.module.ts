import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { CertificateStandard } from '../traceability/certificate-standard.entity';
import { UsageRecord } from '../usage/usage-record.entity';
import { ImpactAnalyser } from './impact.analyser';
import { ImpactAssessment } from './impact-assessment.entity';
import { ImpactController } from './impact.controller';
import { ImpactItem } from './impact-item.entity';
import { ImpactService } from './impact.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImpactAssessment,
      ImpactItem,
      CalibrationCertificate,
      CertificateStandard,
      UsageRecord,
    ]),
  ],
  controllers: [ImpactController],
  providers: [ImpactAnalyser, ImpactService],
  exports: [TypeOrmModule, ImpactAnalyser, ImpactService],
})
export class ImpactModule {}
