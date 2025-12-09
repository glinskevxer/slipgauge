import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstrumentClass } from '../instrument/instrument-class.entity';
import { InstrumentModule } from '../instrument/instrument.module';
import { ToleranceProfile } from '../calibration/tolerance-profile.entity';
import { Instrument } from '../instrument/instrument.entity';
import { CapabilityService } from './capability.service';
import { ContractReview } from './contract-review.entity';
import { ContractReviewService } from './contract-review.service';
import { Customer } from './customer.entity';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { Job } from './job.entity';
import { JobController } from './job.controller';
import { JobItem } from './job-item.entity';
import { JobMapper } from './job.mapper';
import { JobReferenceService } from './job-reference.service';
import { JobService } from './job.service';

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
  imports: [TypeOrmModule.forFeature([
      Customer,
      Job,
      JobItem,
      ContractReview,
      InstrumentClass,
      ToleranceProfile,
      Instrument,
    ]), InstrumentModule],
  controllers: [CustomerController, JobController],
  providers: [
    CustomerService,
    JobService,
    JobReferenceService,
    JobMapper,
    CapabilityService,
    ContractReviewService,
  ],
  exports: [TypeOrmModule, CustomerService, JobService, JobMapper, CapabilityService],
})
export class JobsModule {}
