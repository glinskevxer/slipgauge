import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Instrument } from '../instrument/instrument.entity';
import { NonconformityModule } from '../nonconformity/nonconformity.module';
import { EquipmentLoan } from './equipment-loan.entity';
import { LoanController } from './loan.controller';
import { LoanService } from './loan.service';

/**
 * The loan book. Moves the instrument's status as a side effect of the loan
 * rather than letting the two be set separately, which is the only way they
 * can be made to agree.
 */
@Module({
  imports: [TypeOrmModule.forFeature([EquipmentLoan, Instrument]), NonconformityModule],
  controllers: [LoanController],
  providers: [LoanService],
  exports: [TypeOrmModule, LoanService],
})
export class LoanModule {}
