import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Nonconformance } from './nonconformance.entity';
import { NonconformityController } from './nonconformity.controller';
import { NonconformityService } from './nonconformity.service';

/**
 * Things that went wrong. Depends on nothing else in the register, which is
 * what lets the room log, the impact cascade and the audit programme all raise
 * one without any of them knowing about the others.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Nonconformance])],
  controllers: [NonconformityController],
  providers: [NonconformityService],
  exports: [TypeOrmModule, NonconformityService],
})
export class NonconformityModule {}
