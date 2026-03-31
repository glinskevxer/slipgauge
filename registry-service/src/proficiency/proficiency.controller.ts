import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import {
  OpenRoundDto,
  ScoreRoundDto,
  SubmitRoundDto,
} from './dto/proficiency.dto';
import type { ProficiencyResultView, ProficiencyRoundView } from './dto/proficiency.dto';
import { RoundState } from './proficiency.entities';
import { ProficiencyService } from './proficiency.service';

@ApiTags('proficiency')
@ApiBearerAuth('registry-token')
@Controller('proficiency')
export class ProficiencyController {
  constructor(private readonly proficiency: ProficiencyService) {}

  @Get()
  list(@Query('state') state?: RoundState): Promise<ProficiencyRoundView[]> {
    return this.proficiency.list(state);
  }

  @Get('people/:person')
  forPerson(@Param('person') person: string): Promise<ProficiencyResultView[]> {
    return this.proficiency.forPerson(person);
  }

  @Get(':reference')
  get(@Param('reference') reference: string): Promise<ProficiencyRoundView> {
    return this.proficiency.get(reference);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post()
  open(@Body() request: OpenRoundDto): Promise<ProficiencyRoundView> {
    return this.proficiency.open(request);
  }

  /** What the bench measured and is sending back. */
  @RequireRoles(Role.METROLOGIST)
  @Post(':reference/submission')
  submit(
    @Param('reference') reference: string,
    @Body() request: SubmitRoundDto,
  ): Promise<ProficiencyRoundView> {
    return this.proficiency.submit(reference, request);
  }

  /** The scheme's report, which is the only thing that may set an assigned value. */
  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':reference/score')
  score(
    @Param('reference') reference: string,
    @Body() request: ScoreRoundDto,
  ): Promise<ProficiencyRoundView> {
    return this.proficiency.score(reference, request);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':reference/withdrawal')
  withdraw(
    @Param('reference') reference: string,
    @Query('reason') reason: string,
  ): Promise<ProficiencyRoundView> {
    return this.proficiency.withdraw(reference, reason);
  }
}
