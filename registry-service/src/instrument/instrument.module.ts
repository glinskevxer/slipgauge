import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Instrument } from './instrument.entity';
import { InstrumentClass } from './instrument-class.entity';
import { StorageLocation } from './storage-location.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, InstrumentClass, StorageLocation])],
  exports: [TypeOrmModule],
})
export class InstrumentModule {}
