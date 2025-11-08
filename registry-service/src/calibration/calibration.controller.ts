import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { Role } from '../security/role';
import { CurrentUser } from '../security/current-user.decorator';
import { RequireRoles } from '../security/roles.decorator';
import type { Principal } from '../security/token.service';
import { BadRequestError } from '../common/errors';
import { AttachmentService } from './attachment.service';
import { CalibrationService } from './calibration.service';
import { AttachFileDto, AttachmentView } from './dto/attach-file.dto';
import type { CertificateView } from './dto/certificate.views';
import { RecordCalibrationDto } from './dto/record-calibration.dto';

/**
 * The bench terminal files a sheet here and gets the judged certificate back.
 * There is deliberately no update route: a certificate is corrected by
 * withdrawing it and filing a replacement.
 */
@ApiTags('certificates')
@ApiBearerAuth('registry-token')
@Controller('certificates')
export class CalibrationController {
  constructor(
    private readonly calibrations: CalibrationService,
    private readonly attachments: AttachmentService,
  ) {}

  @RequireRoles(Role.TECHNICIAN)
  @Post()
  record(@Body() request: RecordCalibrationDto): Promise<CertificateView> {
    return this.calibrations.record(request);
  }

  @Get(':id/attachments')
  attachments_(@Param('id', ParseIntPipe) id: number): Promise<AttachmentView[]> {
    return this.attachments.forCertificate(id);
  }

  /**
   * Records a file the document store already holds. Nothing is uploaded
   * through the register: the store has its own upload path, its own virus
   * scanning and its own retention, and putting a second one here would mean
   * two things to keep in step.
   */
  @RequireRoles(Role.TECHNICIAN)
  @Post(':id/attachments')
  attach(
    @Param('id', ParseIntPipe) id: number,
    @Body() request: AttachFileDto,
    @CurrentUser() principal: Principal,
  ): Promise<AttachmentView> {
    return this.attachments.attach(id, request, principal.username);
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
@ApiTags('certificates')
@ApiBearerAuth('registry-token')
@Controller('instruments/:assetTag/certificates')
export class CertificateHistoryController {
  constructor(private readonly calibrations: CalibrationService) {}

  @Get()
  history(@Param('assetTag') assetTag: string): Promise<CertificateView[]> {
    return this.calibrations.historyFor(assetTag);
  }
}
