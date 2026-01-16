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
import { CurrentUser } from '../security/current-user.decorator';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { Principal } from '../security/token.service';
import { CompetenceService } from './competence.service';
import { GrantCompetenceDto, WithdrawCompetenceDto } from './dto/grant-competence.dto';
import type { CompetenceMatrix, CompetenceView } from './dto/grant-competence.dto';

@ApiTags('competence')
@ApiBearerAuth('registry-token')
@Controller('competence')
export class CompetenceController {
  constructor(private readonly competence: CompetenceService) {}

  /** Everybody against every discipline, which is the screen. */
  @Get('matrix')
  matrix(): Promise<CompetenceMatrix> {
    return this.competence.matrix();
  }

  @Get('expiring')
  expiring(
    @Query('withinDays', new DefaultValuePipe(60), ParseIntPipe) withinDays: number,
  ): Promise<CompetenceView[]> {
    return this.competence.expiring(withinDays);
  }

  @Get('people/:person')
  forPerson(
    @Param('person') person: string,
    @Query('includeWithdrawn', new DefaultValuePipe(false), ParseBoolPipe)
    includeWithdrawn: boolean,
  ): Promise<CompetenceView[]> {
    return this.competence.forPerson(person, includeWithdrawn);
  }

  @Get('disciplines/:discipline')
  forDiscipline(@Param('discipline') discipline: Discipline): Promise<CompetenceView[]> {
    return this.competence.forDiscipline(discipline);
  }

  /**
   * Granting is a quality manager decision. A technician who could grant their
   * own authorisation would make the whole register a formality.
   */
  @RequireRoles(Role.QUALITY_MANAGER)
  @Post()
  grant(
    @Body() request: GrantCompetenceDto,
    @CurrentUser() user: Principal,
  ): Promise<CompetenceView> {
    return this.competence.grant(request, user.username);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':id/withdrawal')
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: WithdrawCompetenceDto,
  ): Promise<CompetenceView> {
    return this.competence.withdraw(id, request);
  }
}
