import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentModule } from '../instrument/instrument.module';
import { ContractReview } from './contract-review.entity';
import { Customer } from './customer.entity';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Job } from './job.entity';
import { JobItem } from './job-item.entity';

/**
 * The job desk. Everything a customer's item does between arriving at goods
 * inwards and going back out again.
 *
 * <p>It depends on the register rather than the other way round. A job raises
 * instrument rows once it is accepted; nothing in the register needs to know a
 * job exists, and keeping it that way is what lets the laboratory's own
 * equipment carry on with no job at all.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Customer, Job, JobItem, ContractReview]), InstrumentModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [TypeOrmModule, CustomerService],
})
export class JobsModule {}
