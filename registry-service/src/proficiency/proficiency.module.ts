import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentClass } from '../instrument/instrument-class.entity';
import { Instrument } from '../instrument/instrument.entity';
import { NonconformityModule } from '../nonconformity/nonconformity.module';
import { ProficiencyController } from './proficiency.controller';
import { ProficiencyResultRow, ProficiencyRound } from './proficiency.entities';
import { ProficiencyService } from './proficiency.service';

/**
 * Interlaboratory comparisons. Reads the register for the instrument a result
 * was taken on, and raises a nonconformance when a round comes back badly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProficiencyRound,
      ProficiencyResultRow,
      InstrumentClass,
      Instrument,
    ]),
    NonconformityModule,
  ],
  controllers: [ProficiencyController],
  providers: [ProficiencyService],
  exports: [TypeOrmModule, ProficiencyService],
})
export class ProficiencyModule {}
