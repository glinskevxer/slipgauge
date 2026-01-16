import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentClass } from '../instrument/instrument-class.entity';
import { CompetenceController } from './competence.controller';
import { Competence } from './competence.entity';
import { CompetenceService } from './competence.service';

/**
 * Who may do what. Imported by anything that has to refuse work rather than
 * merely record it, which so far is the calibration module and the job desk.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Competence, InstrumentClass])],
  controllers: [CompetenceController],
  providers: [CompetenceService],
  exports: [TypeOrmModule, CompetenceService],
})
export class CompetenceModule {}
