import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';

import { CloseAssessmentDto, DisposeItemDto } from './dto/dispose-item.dto';
import type { ImpactView } from './dto/impact.views';
import { ImpactService } from './impact.service';

/**
 * The queue the quality manager works through after a failure. Nothing here
 * raises an assessment: that happens the moment the failing sheet is filed,
 * because an assessment somebody has to remember to start is one that gets
 * started a week late.
 */
@Controller('impact')
export class ImpactController {
  constructor(private readonly impact: ImpactService) {}

  @Get()
  open(): Promise<ImpactView[]> {
    return this.impact.open();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<ImpactView> {
    return this.impact.get(id);
  }

  @Get('instruments/:instrumentId')
  forInstrument(
    @Param('instrumentId', ParseIntPipe) instrumentId: number,
  ): Promise<ImpactView[]> {
    return this.impact.forInstrument(instrumentId);
  }

  @Post(':id/items/:itemId/disposition')
  dispose(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() request: DisposeItemDto,
  ): Promise<ImpactView> {
    return this.impact.disposeItem(id, itemId, request);
  }

  @Post(':id/closure')
  close(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: CloseAssessmentDto,
  ): Promise<ImpactView> {
    return this.impact.close(id, request);
  }
}
