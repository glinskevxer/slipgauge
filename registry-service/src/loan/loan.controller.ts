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

import { CurrentUser } from '../security/current-user.decorator';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { Principal } from '../security/token.service';
import { IssueLoanDto, ReturnLoanDto } from './dto/loan.dto';
import type { LoanView } from './dto/loan.dto';
import { LoanService } from './loan.service';

@ApiTags('loans')
@ApiBearerAuth('registry-token')
@Controller('loans')
export class LoanController {
  constructor(private readonly loans: LoanService) {}

  @Get()
  list(
    @Query('includeReturned', new DefaultValuePipe(false), ParseBoolPipe)
    includeReturned: boolean,
  ): Promise<LoanView[]> {
    return this.loans.list(includeReturned);
  }

  @Get('instruments/:assetTag')
  forInstrument(@Param('assetTag') assetTag: string): Promise<LoanView[]> {
    return this.loans.forInstrument(assetTag);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<LoanView> {
    return this.loans.get(id);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post()
  issue(@Body() request: IssueLoanDto, @CurrentUser() user: Principal): Promise<LoanView> {
    return this.loans.issue(request, user.username);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':id/return')
  bookBack(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: ReturnLoanDto,
    @CurrentUser() user: Principal,
  ): Promise<LoanView> {
    return this.loans.bookBack(id, request, user.username);
  }
}
