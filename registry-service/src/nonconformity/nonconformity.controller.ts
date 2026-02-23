import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../security/current-user.decorator';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { Principal } from '../security/token.service';
import { CapaStage } from './capa-stage';
import {
  AbandonNonconformanceDto,
  AssignNonconformanceDto,
  RaiseNonconformanceDto,
  RecordStageDto,
} from './dto/nonconformity.dto';
import type { CapaSummary, NonconformanceView } from './dto/nonconformity.dto';
import { NonconformityService } from './nonconformity.service';

@ApiTags('nonconformity')
@ApiBearerAuth('registry-token')
@Controller('nonconformities')
export class NonconformityController {
  constructor(private readonly register: NonconformityService) {}

  @Get('summary')
  summary(): Promise<CapaSummary> {
    return this.register.summary();
  }

  @Get()
  list(
    @Query('state') state: CapaStage | undefined,
    @Query('includeClosed', new DefaultValuePipe(false), ParseBoolPipe) includeClosed: boolean,
  ): Promise<NonconformanceView[]> {
    return this.register.list(state, includeClosed);
  }

  @Get(':reference')
  get(@Param('reference') reference: string): Promise<NonconformanceView> {
    return this.register.get(reference);
  }

  /**
   * Anybody on the bench may raise one. That is deliberate: a register only the
   * quality manager can write to is a register that records what the quality
   * manager already knew.
   */
  @RequireRoles(Role.TECHNICIAN)
  @Post()
  raise(
    @Body() request: RaiseNonconformanceDto,
    @CurrentUser() user: Principal,
  ): Promise<NonconformanceView> {
    return this.register.raise(request, user.username);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':reference/assignment')
  assign(
    @Param('reference') reference: string,
    @Body() request: AssignNonconformanceDto,
  ): Promise<NonconformanceView> {
    return this.register.assign(reference, request);
  }

  /**
   * The four stages, one route each.
   *
   * <p>Written out rather than matched with a pattern in the path. Express 5
   * dropped inline groups, and four three line methods say what the API is far
   * better than one that reads its own path back to find out.
   */
  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/containment')
  contain(
    @Param('reference') reference: string,
    @Body() request: RecordStageDto,
  ): Promise<NonconformanceView> {
    return this.register.recordStage(reference, CapaStage.CONTAINED, request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/cause')
  cause(
    @Param('reference') reference: string,
    @Body() request: RecordStageDto,
  ): Promise<NonconformanceView> {
    return this.register.recordStage(reference, CapaStage.CAUSE_FOUND, request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/action')
  action(
    @Param('reference') reference: string,
    @Body() request: RecordStageDto,
  ): Promise<NonconformanceView> {
    return this.register.recordStage(reference, CapaStage.ACTION_TAKEN, request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':reference/effectiveness')
  effectiveness(
    @Param('reference') reference: string,
    @Body() request: RecordStageDto,
  ): Promise<NonconformanceView> {
    return this.register.recordStage(reference, CapaStage.EFFECTIVENESS_CHECKED, request);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':reference/closure')
  close(
    @Param('reference') reference: string,
    @CurrentUser() user: Principal,
  ): Promise<NonconformanceView> {
    return this.register.close(reference, user.username);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':reference/abandonment')
  abandon(
    @Param('reference') reference: string,
    @Body() request: AbandonNonconformanceDto,
  ): Promise<NonconformanceView> {
    return this.register.abandon(reference, request);
  }
}
