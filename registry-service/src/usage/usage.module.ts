import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Instrument } from '../instrument/instrument.entity';
import { UsageController } from './usage.controller';
import { UsageRecord } from './usage-record.entity';
import { UsageService } from './usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsageRecord, Instrument])],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [TypeOrmModule, UsageService],
})
export class UsageModule {}
