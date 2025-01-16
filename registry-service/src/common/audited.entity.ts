import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Creation and modification stamps shared by every persistent record. The lab
 * is audited against ISO/IEC 17025, so no table is allowed to lose the moment
 * a row appeared or last moved.
 */
export abstract class AuditedEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
