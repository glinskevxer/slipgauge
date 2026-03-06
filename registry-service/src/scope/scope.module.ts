import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentClass } from '../instrument/instrument-class.entity';
import { AccreditationScope } from './accreditation-scope.entity';
import { ScopeController } from './scope.controller';
import { ScopeService } from './scope.service';

/**
 * The schedule of accreditation. Read by contract review and by the certificate
 * printer, written only by the quality manager.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccreditationScope, InstrumentClass])],
  controllers: [ScopeController],
  providers: [ScopeService],
  exports: [TypeOrmModule, ScopeService],
})
export class ScopeModule {}
