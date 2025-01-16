import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { AuditedEntity } from '../common/audited.entity';

/** Sites nest three or four deep in practice. The guard is only a cycle stop. */
const MAX_DEPTH = 32;

/**
 * Somewhere an instrument physically sits. Locations nest, so a bench belongs
 * to a room which belongs to a site, and the register can be filtered at any
 * depth of that tree.
 */
@Entity({ name: 'storage_location' })
export class StorageLocation extends AuditedEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 24, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 64 })
  site: string;

  @ManyToOne(() => StorageLocation, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: StorageLocation | null;

  /**
   * Codes from the root down, which is what the console renders as a
   * breadcrumb and what the export writes into the location column. Only walks
   * the parents that were actually loaded; a relation left unfetched simply
   * ends the path rather than throwing.
   */
  pathCodes(): string[] {
    const path: string[] = [];
    let cursor: StorageLocation | null = this;
    let guard = 0;

    while (cursor && guard++ < MAX_DEPTH) {
      path.unshift(cursor.code);
      cursor = cursor.parent ?? null;
    }
    return path;
  }

  isDescendantOf(candidate: StorageLocation): boolean {
    let cursor: StorageLocation | null = this.parent ?? null;
    let guard = 0;

    while (cursor && guard++ < MAX_DEPTH) {
      if (cursor.id === candidate.id) {
        return true;
      }
      cursor = cursor.parent ?? null;
    }
    return false;
  }

  reparent(newParent: StorageLocation | null): void {
    if (newParent && (newParent.id === this.id || newParent.isDescendantOf(this))) {
      throw new Error(`location ${this.code} cannot be nested inside its own subtree`);
    }
    this.parent = newParent;
  }
}
