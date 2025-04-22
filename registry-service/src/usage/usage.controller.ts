import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';

import type { Page } from '../common/page';
import { LogUsageDto, UsageView } from './dto/log-usage.dto';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Post()
  logUse(@Body() request: LogUsageDto): Promise<UsageView> {
    return this.usage.logUse(request);
  }

  @Get('work-orders/:workOrder')
  byWorkOrder(@Param('workOrder') workOrder: string): Promise<UsageView[]> {
    return this.usage.forWorkOrder(workOrder);
  }

  @Get('instruments/:assetTag')
  byInstrument(
    @Param('assetTag') assetTag: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('size', new DefaultValuePipe(50), ParseIntPipe) size: number,
    @Query('sort') sort?: string,
  ): Promise<Page<UsageView>> {
    return this.usage.forInstrument(assetTag, page, size, sort);
  }
}
