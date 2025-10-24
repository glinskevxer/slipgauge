import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { contentDisposition, exportFilename, toCsv } from '../common/csv';
import { REGISTER_EXPORT_COLUMNS } from '../common/export-columns';
import type { Page } from '../common/page';
import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import type { InstrumentDetail, InstrumentSummary } from './dto/instrument.views';
import { InstrumentQueryDto } from './dto/instrument-query.dto';
import { RegisterInstrumentDto } from './dto/register-instrument.dto';
import { UpdateInstrumentDto } from './dto/update-instrument.dto';
import { InstrumentService } from './instrument.service';
import { InstrumentStatus } from './instrument.enums';

/** As many rows as one export will carry. */
const EXPORT_LIMIT = 5_000;

@ApiTags('instruments')
@ApiBearerAuth('registry-token')
@Controller('instruments')
export class InstrumentController {
  constructor(private readonly service: InstrumentService) {}

  @RequireRoles(Role.TECHNICIAN)
  @Post()
  async register(
    @Body() request: RegisterInstrumentDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<InstrumentDetail> {
    const created = await this.service.register(request);
    response.status(201).setHeader('Location', `/api/instruments/${created.id}`);
    return created;
  }

  @Get()
  search(@Query() query: InstrumentQueryDto): Promise<Page<InstrumentSummary>> {
    return this.service.search(query);
  }

  /**
   * The same search, written out rather than paged. The cap is deliberate: a
   * spreadsheet nobody can open is not an export, and a register this size
   * has never needed more.
   */
  @Get('export.csv')
  async exportCsv(
    @Query() query: InstrumentQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const page = await this.service.search({ ...query, page: 0, size: EXPORT_LIMIT });
    const filename = exportFilename('Instrument register', new Date().toISOString().slice(0, 10));

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', contentDisposition(filename));
    response.setHeader('X-Row-Count', String(page.items.length));
    response.setHeader('X-Row-Total', String(page.totalItems));

    return toCsv(page.items, REGISTER_EXPORT_COLUMNS);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<InstrumentDetail> {
    return this.service.get(id);
  }

  @Get('by-tag/:assetTag')
  getByTag(@Param('assetTag') assetTag: string): Promise<InstrumentDetail> {
    return this.service.getByAssetTag(assetTag);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: UpdateInstrumentDto,
  ): Promise<InstrumentDetail> {
    return this.service.update(id, request);
  }

  @RequireRoles(Role.TECHNICIAN)
  @Post(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Query('target') target: InstrumentStatus,
  ): Promise<InstrumentDetail> {
    return this.service.changeStatus(id, target);
  }

  @RequireRoles(Role.METROLOGIST)
  @Post(':id/retirement')
  retire(
    @Param('id', ParseIntPipe) id: number,
    @Query('on') on?: string,
  ): Promise<InstrumentDetail> {
    return this.service.retire(id, on);
  }
}
