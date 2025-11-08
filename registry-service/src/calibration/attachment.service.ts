import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { ConflictError, NotFoundError, RuleViolationError } from '../common/errors';
import { AuditTrail } from '../security/audit-trail.service';
import { CalibrationCertificate } from './calibration-certificate.entity';
import {
  AttachmentKind,
  CertificateAttachment,
  certificateAttachment,
} from './certificate-attachment.entity';
import type { AttachFileDto, AttachmentView } from './dto/attach-file.dto';

/**
 * Files that belong to a certificate.
 *
 * <p>Attaching is allowed after a certificate is approved and after it is
 * withdrawn, which is not a gap. A scan arrives days after the work and a
 * withdrawn certificate is exactly the one somebody later needs the paperwork
 * for. Detaching is not allowed at all, for the same reason.
 */
@Injectable()
export class AttachmentService {
  private readonly log = new Logger(AttachmentService.name);

  constructor(
    @InjectRepository(CertificateAttachment)
    private readonly attachments: Repository<CertificateAttachment>,
    @InjectRepository(CalibrationCertificate)
    private readonly certificates: Repository<CalibrationCertificate>,
    private readonly audit: AuditTrail,
  ) {}

  async attach(
    certificateId: number,
    request: AttachFileDto,
    actor: string,
  ): Promise<AttachmentView> {
    const certificate = await this.certificateById(certificateId);

    if (request.kind === AttachmentKind.CERTIFICATE_SCAN) {
      const held = await this.attachments.findOne({
        where: {
          certificate: { id: certificateId },
          kind: AttachmentKind.CERTIFICATE_SCAN,
        },
      });

      if (held) {
        throw new ConflictError(
          `certificate ${certificate.certificateNumber} already has a signed scan on it`,
        );
      }
    }

    const attachment = certificateAttachment(
      certificate,
      request.kind,
      request.filename,
      request.mediaType,
      request.byteSize,
      request.sha256,
      request.storageKey,
      actor,
    );

    attachment.note = request.note?.trim() ?? null;

    const saved = await this.save(attachment, certificate.certificateNumber);

    await this.audit.allowed(
      actor,
      'certificate.attach',
      'certificate',
      String(certificateId),
      `${request.kind} ${request.filename} ${attachment.shortChecksum()}`,
    );

    this.log.log(
      `${request.filename} attached to ${certificate.certificateNumber} by ${actor}`,
    );
    return this.toView(saved);
  }

  async forCertificate(certificateId: number): Promise<AttachmentView[]> {
    await this.certificateById(certificateId);

    const found = await this.attachments.find({
      where: { certificate: { id: certificateId } },
      order: { kind: 'ASC', uploadedAt: 'ASC' },
    });

    return found.map((attachment) => this.toView(attachment));
  }

  /**
   * The same file filed against a second certificate, which is how a shared
   * raw data run is found. The checksum is the only thing that can tell.
   */
  async byChecksum(sha256: string): Promise<AttachmentView[]> {
    const found = await this.attachments.find({
      where: { sha256 },
      order: { id: 'ASC' },
    });

    return found.map((attachment) => this.toView(attachment));
  }

  private async save(
    attachment: CertificateAttachment,
    certificateNumber: string,
  ): Promise<CertificateAttachment> {
    try {
      return await this.attachments.save(attachment);
    } catch (failure) {
      if (failure instanceof QueryFailedError && String(failure.message).includes('ux_attachment')) {
        throw new ConflictError(
          `that file is already on ${certificateNumber}, checksum ${attachment.shortChecksum()}`,
        );
      }
      if (failure instanceof QueryFailedError && String(failure.message).includes('uq_attachment')) {
        throw new ConflictError(`${attachment.storageKey} is already pointed at by this register`);
      }
      throw failure;
    }
  }

  private async certificateById(id: number): Promise<CalibrationCertificate> {
    const certificate = await this.certificates.findOne({ where: { id } });

    if (!certificate) {
      throw new NotFoundError('certificate', id);
    }
    return certificate;
  }

  private toView(attachment: CertificateAttachment): AttachmentView {
    if (!attachment.certificateId && !attachment.certificate) {
      throw new RuleViolationError('an attachment with no certificate cannot be rendered');
    }

    return {
      id: attachment.id,
      certificateId: attachment.certificateId ?? attachment.certificate.id,
      kind: attachment.kind,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      byteSize: attachment.byteSize,
      readableSize: attachment.describeSize(),
      sha256: attachment.sha256,
      shortChecksum: attachment.shortChecksum(),
      storageKey: attachment.storageKey,
      uploadedBy: attachment.uploadedBy,
      uploadedAt: attachment.uploadedAt.toISOString(),
      note: attachment.note,
    };
  }
}
