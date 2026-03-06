import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Discipline } from '../instrument/instrument.enums';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { SetScopeLineDto } from './dto/scope.dto';
import type { ScopeLineView } from './dto/scope.dto';
import { ScopeService } from './scope.service';

@ApiTags('scope')
@ApiBearerAuth('registry-token')
@Controller('scope')
export class ScopeController {
  constructor(private readonly scope: ScopeService) {}

  @Get()
  list(
    @Query('discipline') discipline: Discipline | undefined,
    @Query('includeLapsed', new DefaultValuePipe(false), ParseBoolPipe) includeLapsed: boolean,
  ): Promise<ScopeLineView[]> {
    return this.scope.list(discipline, includeLapsed);
  }

  /**
   * Only the quality manager writes the schedule, and only off the published
   * one. A schedule the laboratory can widen for itself is not a schedule.
   */
  @RequireRoles(Role.QUALITY_MANAGER)
  @Post()
  add(@Body() request: SetScopeLineDto): Promise<ScopeLineView> {
    return this.scope.add(request);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':id/lapse')
  lapse(
    @Param('id', ParseIntPipe) id: number,
    @Query('on') on?: string,
  ): Promise<ScopeLineView> {
    return this.scope.lapse(id, on);
  }
}
