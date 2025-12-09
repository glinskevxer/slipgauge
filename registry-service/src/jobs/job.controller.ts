import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AcceptancePolicy } from '../calibration/conformity/acceptance-policy';
import type { Page } from '../common/page';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { CurrentUser } from '../security/current-user.decorator';
import type { Principal } from '../security/token.service';
import { ContractReviewService } from './contract-review.service';
import { AddJobItemDto, BookInJobDto, RepromiseJobDto } from './dto/book-in.dto';
import type { JobDeskSummary, JobSummary, JobView } from './dto/job.views';
import { DeclineJobDto, ReviewJobDto } from './dto/review-job.dto';
import type { ReviewPreview } from './dto/review-job.dto';
import { toReviewView } from './job.mapper';
import type { ContractReviewView } from './dto/job.views';
import { JobService } from './job.service';
import { JobState } from './job.enums';

@ApiTags('jobs')
@ApiBearerAuth('registry-token')
@Controller('jobs')
export class JobController {
  constructor(
    private readonly jobs: JobService,
    private readonly reviews: ContractReviewService,
  ) {}

  /** The counts across the top of the desk. */
  @Get('desk')
  desk(): Promise<JobDeskSummary> {
    return this.jobs.desk();
  }

  @Get()
  search(
    @Query('state') state: JobState | undefined,
    @Query('customer') customerCode: string | undefined,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('sort') sort?: string,
  ): Promise<Page<JobSummary>> {
    return this.jobs.search(state, customerCode, page, size, sort);
  }

  @Get(':reference')
  get(@Param('reference') reference: string): Promise<JobView> {
    return this.jobs.get(reference);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post()
  bookIn(@Body() request: BookInJobDto): Promise<JobView> {
    return this.jobs.bookIn(request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/items')
  addItem(
    @Param('reference') reference: string,
    @Body() request: AddJobItemDto,
  ): Promise<JobView> {
    return this.jobs.addItem(reference, request);
  }

  /** What contract review would say, without recording anything. */
  @Get(':reference/review/preview')
  preview(
    @Param('reference') reference: string,
    @Query('policy') policy?: AcceptancePolicy,
  ): Promise<ReviewPreview> {
    // The console sends the parameter with nothing in it when the reviewer has
    // not chosen a rule yet, and a blank is not a rule.
    return this.reviews.preview(reference, policy?.trim() ? policy : null);
  }

  @Get(':reference/review')
  async review(@Param('reference') reference: string): Promise<ContractReviewView> {
    return toReviewView(await this.reviews.get(reference));
  }

  @RequireRoles(Role.METROLOGIST)
  @Post(':reference/review')
  record(
    @Param('reference') reference: string,
    @Body() request: ReviewJobDto,
    @CurrentUser() user: Principal,
  ): Promise<JobView> {
    return this.reviews.review(reference, user.username, request);
  }

  @RequireRoles(Role.METROLOGIST)
  @Post(':reference/decline')
  decline(
    @Param('reference') reference: string,
    @Body() request: DeclineJobDto,
    @CurrentUser() user: Principal,
  ): Promise<JobView> {
    return this.reviews.decline(reference, user.username, request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/promise')
  repromise(
    @Param('reference') reference: string,
    @Body() request: RepromiseJobDto,
  ): Promise<JobView> {
    return this.jobs.repromise(reference, request);
  }
}
