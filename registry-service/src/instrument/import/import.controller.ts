import { Body, Controller, DefaultValuePipe, Get, ParseBoolPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { toCsv } from '../../common/csv';
import { Role } from '../../security/role';
import { RequireRoles } from '../../security/roles.decorator';
import { OPTIONAL_COLUMNS, REQUIRED_COLUMNS } from './import-report';
import type { ImportReport } from './import-report';
import { InstrumentImportService } from './instrument-import.service';

/**
 * The file, as text.
 *
 * <p>Sent in the body rather than as a multipart upload. The console reads the
 * file itself, shows the operator the first few rows before anything is sent,
 * and a plain string keeps the whole path through validation, logging and the
 * problem filter identical to every other request.
 */
export class ImportFileDto {
  @IsString()
  @MaxLength(2_000_000)
  file: string;
}

@ApiTags('instruments')
@ApiBearerAuth('registry-token')
@Controller('instruments/import')
export class InstrumentImportController {
  constructor(private readonly imports: InstrumentImportService) {}

  /** The empty file, with the columns in the order the importer reads them. */
  @Get('template')
  template(): { readonly filename: string; readonly content: string } {
    const headers = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

    return {
      filename: 'instrument-import-template.csv',
      content: toCsv<Record<string, string>>(
        [],
        headers.map((header) => ({ header, value: (row) => row[header] ?? '' })),
      ),
    };
  }

  /**
   * Runs the import. A dry run by default, because the destructive reading of
   * an ambiguous parameter is the wrong one to guess.
   */
  @RequireRoles(Role.ADMIN)
  @Post()
  run(
    @Body() request: ImportFileDto,
    @Query('commit', new DefaultValuePipe(false), ParseBoolPipe) commit: boolean,
  ): Promise<ImportReport> {
    return this.imports.run(request.file, !commit);
  }
}
