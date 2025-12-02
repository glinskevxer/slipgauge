import { Body, Controller, DefaultValuePipe, Get, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import type { CustomerSummary, CustomerView } from './dto/customer.dto';

@ApiTags('customers')
@ApiBearerAuth('registry-token')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  list(
    @Query('includeClosed', new DefaultValuePipe(false), ParseBoolPipe) includeClosed: boolean,
  ): Promise<CustomerSummary[]> {
    return this.customers.list(includeClosed);
  }

  @Get(':code')
  get(@Param('code') code: string): Promise<CustomerView> {
    return this.customers.get(code);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post()
  create(@Body() request: CreateCustomerDto): Promise<CustomerView> {
    return this.customers.create(request);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Patch(':code')
  update(@Param('code') code: string, @Body() request: UpdateCustomerDto): Promise<CustomerView> {
    return this.customers.update(code, request);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':code/close')
  close(@Param('code') code: string): Promise<CustomerView> {
    return this.customers.close(code);
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':code/reopen')
  reopen(@Param('code') code: string): Promise<CustomerView> {
    return this.customers.reopen(code);
  }
}
