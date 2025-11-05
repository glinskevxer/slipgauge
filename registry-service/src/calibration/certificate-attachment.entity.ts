import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { RuleViolationError } from '../common/errors';
import { CalibrationCertificate } from './calibration-certificate.entity';

/** What the file is, which decides where it is shown and how long it is kept. */
export enum AttachmentKind {
  /** The signed certificate as it went to the customer. */
  CERTIFICATE_SCAN = 'CERTIFICATE_SCAN',
  /** Whatever the bench software wrote, in whatever format it writes. */
  RAW_DATA = 'RAW_DATA',
  /** The budget sheet, when it was worked out somewhere other than here. */
  UNCERTAINTY_BUDGET = 'UNCERTAINTY_BUDGET',
  /** A photograph of the instrument or of the setup. */
  PHOTOGRAPH = 'PHOTOGRAPH',
  /** An email or a note that belongs with the certificate. */
  CORRESPONDENCE = 'CORRESPONDENCE',
}

/** As large as the document store will take in one file. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * A file that belongs to a certificate, held somewhere else.
 *
 * <p>The bytes live in the laboratory's document store. This row is the
 * pointer, and the checksum on it is what makes the pointer worth having: a
 * file swapped in the store is a file this register can prove was swapped.
 */
@Entity({ name: 'certificate_attachment' })
export class CertificateAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CalibrationCertificate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificate_id' })
  certificate: CalibrationCertificate;

  @RelationId((attachment: CertificateAttachment) => attachment.certificate)
  certificateId: number;

  @Column({ type: 'varchar', length: 24 })
  kind: AttachmentKind;

  @Column({ type: 'varchar', length: 200 })
  filename: string;

  @Column({ name: 'media_type', type: 'varchar', length: 120 })
  mediaType: string;

  @Column({
    name: 'byte_size',
    type: 'bigint',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  byteSize: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 400 })
  storageKey: string;

  @Column({ name: 'uploaded_by', type: 'varchar', length: 120 })
  uploadedBy: string;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;

  @Column({ type: 'varchar', length: 400, nullable: true })
  note: string | null;

  /** True when the file is the certificate itself rather than something beside it. */
  isTheCertificate(): boolean {
    return this.kind === AttachmentKind.CERTIFICATE_SCAN;
  }

  /** A size a person can read, which is what the console shows. */
  describeSize(): string {
    if (this.byteSize < 1024) {
      return `${this.byteSize} B`;
    }
    if (this.byteSize < 1024 * 1024) {
      return `${(this.byteSize / 1024).toFixed(1)} kB`;
    }
    return `${(this.byteSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** The first eight characters, which is what gets quoted in a conversation. */
  shortChecksum(): string {
    return this.sha256.slice(0, 8);
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Storage keys are opaque to everything but the document store. */
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9/._-]{2,399}$/;

export function certificateAttachment(
  certificate: CalibrationCertificate,
  kind: AttachmentKind,
  filename: string,
  mediaType: string,
  byteSize: number,
  sha256: string,
  storageKey: string,
  uploadedBy: string,
): CertificateAttachment {
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    throw new RuleViolationError('an attachment has to have a size');
  }
  if (byteSize > MAX_ATTACHMENT_BYTES) {
    throw new RuleViolationError(
      `the document store will not take a file over ${MAX_ATTACHMENT_BYTES} bytes`,
    );
  }
  if (!SHA256.test(sha256)) {
    throw new RuleViolationError('a checksum has to be sixty four lower case hex characters');
  }
  if (!STORAGE_KEY.test(storageKey)) {
    throw new RuleViolationError(`${storageKey} is not a usable storage key`);
  }

  const attachment = new CertificateAttachment();

  attachment.certificate = certificate;
  attachment.kind = kind;
  attachment.filename = filename.trim().slice(0, 200);
  attachment.mediaType = mediaType.trim().slice(0, 120);
  attachment.byteSize = byteSize;
  attachment.sha256 = sha256;
  attachment.storageKey = storageKey;
  attachment.uploadedBy = uploadedBy;
  attachment.note = null;
  return attachment;
}
