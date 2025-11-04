import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Instrument } from '../instrument/instrument.entity';
import { IntervalDecision } from '../interval/interval-decision.entity';
import { IntervalModule } from '../interval/interval.module';
import { SecurityModule } from '../security/security.module';
import { RecallController } from './recall.controller';
import { RecallService } from './recall.service';
import { RecallSweepSchedule } from './recall-sweep.schedule';
import { RecallSweepService } from './recall-sweep.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Instrument, IntervalDecision]),
    IntervalModule,
    SecurityModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [RecallController],
  providers: [RecallService, RecallSweepService, RecallSweepSchedule],
  exports: [RecallService, RecallSweepService],
})
export class RecallModule {}
