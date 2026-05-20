import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { Competence } from '../competence/competence.entity';
import { EnvironmentExcursion } from '../environment/environment.entities';
import { Instrument } from '../instrument/instrument.entity';
import { Job } from '../jobs/job.entity';
import { Nonconformance } from '../nonconformity/nonconformance.entity';
import { ProficiencyResultRow, ProficiencyRound } from '../proficiency/proficiency.entities';
import { AccreditationScope } from '../scope/accreditation-scope.entity';
import { ManagementReviewController } from './review.controller';
import { ManagementReviewService } from './management-review.service';

/**
 * The management review pack. Reads every other module and writes nothing,
 * which is why it takes the entities directly rather than depending on eleven
 * modules and dragging their controllers into a circle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Instrument,
      CalibrationCertificate,
      Job,
      Nonconformance,
      ProficiencyRound,
      ProficiencyResultRow,
      EnvironmentExcursion,
      Competence,
      AccreditationScope,
    ]),
  ],
  controllers: [ManagementReviewController],
  providers: [ManagementReviewService],
  exports: [ManagementReviewService],
})
export class ReviewModule {}
