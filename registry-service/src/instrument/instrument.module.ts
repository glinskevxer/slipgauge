import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssetTagService } from './asset-tag.service';
import { InstrumentImportController } from './import/import.controller';
import { InstrumentImportService } from './import/instrument-import.service';
import { Instrument } from './instrument.entity';
import { InstrumentClass } from './instrument-class.entity';
import { InstrumentController } from './instrument.controller';
import { InstrumentMapper } from './instrument.mapper';
import { InstrumentService } from './instrument.service';
import { ReferenceController } from './reference.controller';
import { StorageLocation } from './storage-location.entity';
import { StorageLocationService } from './storage-location.service';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, InstrumentClass, StorageLocation])],
  controllers: [InstrumentController, InstrumentImportController, ReferenceController],
  providers: [
    InstrumentService,
    InstrumentMapper,
    AssetTagService,
    StorageLocationService,
    InstrumentImportService,
  ],
  exports: [
    TypeOrmModule,
    InstrumentService,
    InstrumentMapper,
    StorageLocationService,
    AssetTagService,
    InstrumentImportService,
  ],
})
export class InstrumentModule {}
