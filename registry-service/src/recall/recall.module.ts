import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Instrument } from '../instrument/instrument.entity';
import { IntervalDecision } from '../interval/interval-decision.entity';
import { IntervalModule } from '../interval/interval.module';
import { RecallController } from './recall.controller';
import { RecallService } from './recall.service';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, IntervalDecision]), IntervalModule],
  controllers: [RecallController],
  providers: [RecallService],
  exports: [RecallService],
})
export class RecallModule {}
