import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';

import { NotFoundError } from '../common/errors';
import type { InstrumentClassView, StorageLocationView } from './dto/instrument.views';
import { InstrumentClass } from './instrument-class.entity';
import { Criticality, Discipline, InstrumentStatus } from './instrument.enums';
import { InstrumentMapper } from './instrument.mapper';
import { StorageLocationService } from './storage-location.service';

/**
 * The lookup lists every form on the console needs. Read only and cacheable,
 * which is why they sit apart from the register endpoints rather than being
 * bolted onto them as extra query parameters.
 */
@ApiTags('instruments')
@ApiBearerAuth('registry-token')
@Controller('reference')
export class ReferenceController {
  constructor(
    @InjectRepository(InstrumentClass) private readonly classes: Repository<InstrumentClass>,
    private readonly locations: StorageLocationService,
    private readonly mapper: InstrumentMapper,
  ) {}

  @Get('classes')
  async listClasses(
    @Query('discipline') discipline?: Discipline,
  ): Promise<InstrumentClassView[]> {
    const found = await this.classes.find({
      where: discipline ? { discipline } : {},
      order: { code: 'ASC' },
    });
    return found.map((type) => this.mapper.toClassView(type));
  }

  @Get('classes/:code')
  async classByCode(@Param('code') code: string): Promise<InstrumentClassView> {
    const type = await this.classes.findOne({ where: { code } });

    if (!type) {
      throw new NotFoundError('instrument class', code);
    }
    return this.mapper.toClassView(type);
  }

  @Get('locations')
  async listLocations(): Promise<StorageLocationView[]> {
    const found = await this.locations.all();
    return found.map((location) => this.mapper.toLocationView(location));
  }

  @Get('disciplines')
  disciplines(): Discipline[] {
    return Object.values(Discipline);
  }

  @Get('statuses')
  statuses(): InstrumentStatus[] {
    return Object.values(InstrumentStatus);
  }

  @Get('criticalities')
  criticalities(): Criticality[] {
    return Object.values(Criticality);
  }
}
