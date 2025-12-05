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

import type { Page } from '../common/page';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { AddJobItemDto, BookInJobDto, RepromiseJobDto } from './dto/book-in.dto';
import type { JobDeskSummary, JobSummary, JobView } from './dto/job.views';
import { JobService } from './job.service';
import { JobState } from './job.enums';

@ApiTags('jobs')
@ApiBearerAuth('registry-token')
@Controller('jobs')
export class JobController {
  constructor(private readonly jobs: JobService) {}

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

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/promise')
  repromise(
    @Param('reference') reference: string,
    @Body() request: RepromiseJobDto,
  ): Promise<JobView> {
    return this.jobs.repromise(reference, request);
  }
}
