import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentModule } from '../instrument/instrument.module';
import { ConformityAssessor } from './conformity';
import { ToleranceProfile } from './tolerance-profile.entity';
import { ToleranceProfileService } from './tolerance-profile.service';

@Module({
  imports: [TypeOrmModule.forFeature([ToleranceProfile]), InstrumentModule],
  providers: [ConformityAssessor, ToleranceProfileService],
  exports: [TypeOrmModule, ConformityAssessor, ToleranceProfileService],
})
export class CalibrationModule {}
