import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../security/current-user.decorator';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { Principal } from '../security/token.service';
import {
  AssessExcursionDto,
  SetEnvironmentLimitDto,
  UploadReadingsDto,
  WithdrawAffectedDto,
} from './dto/environment.dto';
import type {
  AffectedWork,
  EnvironmentLimitView,
  ExcursionView,
  RoomTrace,
  UploadResult,
} from './dto/environment.dto';
import { EnvironmentService } from './environment.service';

@ApiTags('environment')
@ApiBearerAuth('registry-token')
@Controller('environment')
export class EnvironmentController {
  constructor(private readonly environment: EnvironmentService) {}

  @Get('limits')
  limits(@Query('location') locationCode?: string): Promise<EnvironmentLimitView[]> {
    return this.environment.limitsFor(locationCode);
  }

  /**
   * Setting a band is a quality decision, not a bench one. A room whose limits
   * can be widened by whoever is standing in it has no limits.
   */
  @RequireRoles(Role.QUALITY_MANAGER)
  @Put('limits')
  setLimit(@Body() request: SetEnvironmentLimitDto): Promise<EnvironmentLimitView> {
    return this.environment.setLimit(request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post('readings')
  upload(@Body() request: UploadReadingsDto): Promise<UploadResult> {
    return this.environment.upload(request);
  }

  @Get('excursions')
  excursions(
    @Query('location') locationCode: string | undefined,
    @Query('unassessed', new DefaultValuePipe(false), ParseBoolPipe) unassessedOnly: boolean,
  ): Promise<ExcursionView[]> {
    return this.environment.excursionsFor(locationCode, unassessedOnly);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post('excursions/:id/assessment')
  assess(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: AssessExcursionDto,
    @CurrentUser() user: Principal,
  ): Promise<ExcursionView> {
    return this.environment.assess(id, user.username, request);
  }

  /** What was issued in the room while it was out. */
  @Get('excursions/:id/affected')
  affected(@Param('id', ParseIntPipe) id: number): Promise<AffectedWork> {
    return this.environment.affectedBy(id);
  }

  /**
   * Withdraws everything the excursion put in question. A quality manager
   * decision: it moves recall dates across the whole room.
   */
  @RequireRoles(Role.QUALITY_MANAGER)
  @Post('excursions/:id/withdrawals')
  withdrawAffected(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: WithdrawAffectedDto,
  ): Promise<{ withdrawn: number; alreadyWithdrawn: number }> {
    return this.environment.withdrawAffected(id, request.reason);
  }

  @Get('rooms/:code/trace')
  trace(
    @Param('code') code: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<RoomTrace> {
    return this.environment.trace(code, from, to);
  }
}
