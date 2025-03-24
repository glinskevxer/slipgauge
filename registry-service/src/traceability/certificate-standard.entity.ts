import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';

import { CalibrationCertificate } from '../calibration/calibration-certificate.entity';
import { RuleViolationError } from '../common/errors';
import { Instrument } from '../instrument/instrument.entity';
import { StandardRole } from './standard-role';

/**
 * One edge of the traceability chain. An edge either points at an instrument
 * this register holds, in which case the chain keeps walking, or it names an
 * outside standard, in which case the chain terminates there and the outside
 * laboratory's accreditation is what carries it the rest of the way.
 */
@Entity({ name: 'certificate_standard' })
export class CertificateStandard {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CalibrationCertificate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificate_id' })
  certificate: CalibrationCertificate;

  @RelationId((edge: CertificateStandard) => edge.certificate)
  certificateId: number;

  @ManyToOne(() => Instrument, { nullable: true })
  @JoinColumn({ name: 'standard_instrument_id' })
  standard: Instrument | null;

  @RelationId((edge: CertificateStandard) => edge.standard)
  standardId: number | null;

  @Column({ name: 'external_ref', type: 'varchar', length: 160, nullable: true })
  externalRef: string | null;

  @Column({ name: 'external_cert_number', type: 'varchar', length: 48, nullable: true })
  externalCertificateNumber: string | null;

  @Column({ name: 'external_lab', type: 'varchar', length: 120, nullable: true })
  externalLab: string | null;

  @Column({ name: 'external_accreditation', type: 'varchar', length: 64, nullable: true })
  externalAccreditation: string | null;

  @Column({ name: 'external_valid_from', type: 'date', nullable: true })
  externalValidFrom: string | null;

  @Column({ name: 'external_valid_to', type: 'date', nullable: true })
  externalValidTo: string | null;

  @Column({ type: 'varchar', length: 24 })
  role: StandardRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  isInternal(): boolean {
    return this.standard !== null && this.standard !== undefined;
  }

  /** True when an outside standard's own certificate covered the given date. */
  externallyValidOn(date: string): boolean {
    if (this.isInternal()) {
      return false;
    }
    if (this.externalValidFrom !== null && date < this.externalValidFrom) {
      return false;
    }
    return this.externalValidTo === null || date <= this.externalValidTo;
  }

  /** How the edge reads on the certificate and in a defect message. */
  describe(): string {
    if (this.isInternal()) {
      return this.standard?.assetTag ?? 'an unnamed instrument';
    }
    return this.externalLab ? `${this.externalRef} (${this.externalLab})` : `${this.externalRef}`;
  }

  /** True when the outside laboratory quoted an accreditation reference. */
  isAccredited(): boolean {
    return !this.isInternal() && !!this.externalAccreditation?.trim();
  }

  validFor(from: string | null, to: string | null, accreditation: string | null): this {
    if (from !== null && to !== null && from > to) {
      throw new RuleViolationError('an external validity window runs backwards');
    }
    this.externalValidFrom = from;
    this.externalValidTo = to;
    this.externalAccreditation = accreditation;
    return this;
  }
}

/** An edge pointing at another instrument this register holds. */
export function internalStandard(
  certificate: CalibrationCertificate,
  standard: Instrument,
  role: StandardRole,
): CertificateStandard {
  const edge = blankEdge(certificate, role);

  edge.standard = standard;
  return edge;
}

/** An edge naming a standard held somewhere else, which ends the walk. */
export function externalStandard(
  certificate: CalibrationCertificate,
  reference: string,
  lab: string | null,
  certificateNumber: string | null,
  role: StandardRole,
): CertificateStandard {
  if (!reference || !reference.trim()) {
    throw new RuleViolationError('an external standard needs a reference');
  }

  const edge = blankEdge(certificate, role);

  edge.externalRef = reference;
  edge.externalLab = lab;
  edge.externalCertificateNumber = certificateNumber;
  return edge;
}

function blankEdge(
  certificate: CalibrationCertificate,
  role: StandardRole,
): CertificateStandard {
  const edge = new CertificateStandard();

  edge.certificate = certificate;
  edge.standard = null;
  edge.externalRef = null;
  edge.externalCertificateNumber = null;
  edge.externalLab = null;
  edge.externalAccreditation = null;
  edge.externalValidFrom = null;
  edge.externalValidTo = null;
  edge.role = role;
  return edge;
}
