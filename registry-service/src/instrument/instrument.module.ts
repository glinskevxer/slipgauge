import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssetTagService } from './asset-tag.service';
import { Instrument } from './instrument.entity';
import { InstrumentClass } from './instrument-class.entity';
import { InstrumentController } from './instrument.controller';
import { InstrumentMapper } from './instrument.mapper';
import { InstrumentService } from './instrument.service';
import { StorageLocation } from './storage-location.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, InstrumentClass, StorageLocation])],
  controllers: [InstrumentController],
  providers: [InstrumentService, InstrumentMapper, AssetTagService],
  exports: [TypeOrmModule, InstrumentService, InstrumentMapper],
})
export class InstrumentModule {}
