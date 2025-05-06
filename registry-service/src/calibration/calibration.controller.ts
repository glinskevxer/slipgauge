import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';

import { Role } from '../security/role';
import { RequireRoles } from '../security/roles.decorator';
import { BadRequestError } from '../common/errors';
import { CalibrationService } from './calibration.service';
import type { CertificateView } from './dto/certificate.views';
import { RecordCalibrationDto } from './dto/record-calibration.dto';

/**
 * The bench terminal files a sheet here and gets the judged certificate back.
 * There is deliberately no update route: a certificate is corrected by
 * withdrawing it and filing a replacement.
 */
@RequireRoles(Role.AUDITOR)
@Controller('certificates')
export class CalibrationController {
  constructor(private readonly calibrations: CalibrationService) {}

  @RequireRoles(Role.TECHNICIAN)
  @Post()
  record(@Body() request: RecordCalibrationDto): Promise<CertificateView> {
    return this.calibrations.record(request);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number): Promise<CertificateView> {
    return this.calibrations.get(id);
  }

  @RequireRoles(Role.METROLOGIST)
  @Post(':id/approval')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Query('approver') approver: string,
  ): Promise<CertificateView> {
    if (!approver || !approver.trim()) {
      throw new BadRequestError('name the approver in the approver query parameter');
    }
    return this.calibrations.approve(id, approver.trim());
  }

  @RequireRoles(Role.QUALITY_MANAGER)
  @Post(':id/withdrawal')
  withdraw(
    @Param('id', ParseIntPipe) id: number,
    @Query('reason') reason: string,
  ): Promise<CertificateView> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('withdrawing a certificate needs a reason');
    }
    return this.calibrations.withdraw(id, reason.trim());
  }
}

/** History hangs off the instrument, because that is how anybody looks for it. */
@RequireRoles(Role.AUDITOR)
@Controller('instruments/:assetTag/certificates')
export class CertificateHistoryController {
  constructor(private readonly calibrations: CalibrationService) {}

  @Get()
  history(@Param('assetTag') assetTag: string): Promise<CertificateView[]> {
    return this.calibrations.historyFor(assetTag);
  }
}
