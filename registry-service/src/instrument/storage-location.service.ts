import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { NotFoundError } from '../common/errors';
import { StorageLocation } from './storage-location.entity';

/**
 * Rows the ancestor walk needs. Selected by hand rather than through the
 * entity metadata because the recursive term has to name its columns and a
 * changing entity should not silently change the shape of the union.
 */
interface AncestorRow {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly site: string;
  readonly parent_id: number | null;
}

/**
 * One statement that walks from a set of locations up to their roots.
 *
 * <p>The alternative is asking the ORM for parent.parent.parent, which fixes
 * the depth of the tree in the query and quietly truncates the breadcrumb the
 * day somebody adds a shelf under a bench. That is exactly the bug this
 * replaced.
 */
const ANCESTORS = `
with recursive ancestor as (
  select id, code, name, site, parent_id
  from storage_location
  where id = any($1::int[])
  union
  select parent.id, parent.code, parent.name, parent.site, parent.parent_id
  from storage_location parent
  join ancestor child on child.parent_id = parent.id
)
select id, code, name, site, parent_id from ancestor
`;

@Injectable()
export class StorageLocationService {
  constructor(
    @InjectRepository(StorageLocation) private readonly locations: Repository<StorageLocation>,
  ) {}

  async byCode(code: string): Promise<StorageLocation> {
    const location = await this.locations.findOne({ where: { code } });

    if (!location) {
      throw new NotFoundError('location', code);
    }
    await this.hydrate([location]);
    return location;
  }

  /** Every location, each already carrying its own chain of parents. */
  async all(): Promise<StorageLocation[]> {
    const found = await this.locations.find({ order: { code: 'ASC' } });
    await this.hydrate(found);
    return found;
  }

  /** Children of one location, or the roots when no parent is named. */
  async childrenOf(parentCode: string | null): Promise<StorageLocation[]> {
    if (parentCode === null) {
      const roots = await this.locations.find({
        where: { parent: IsNull() },
        order: { code: 'ASC' },
      });
      await this.hydrate(roots);
      return roots;
    }

    const parent = await this.byCode(parentCode);
    const children = await this.locations.find({
      where: { parent: { id: parent.id } },
      order: { code: 'ASC' },
    });

    for (const child of children) {
      child.parent = parent;
    }
    return children;
  }

  /**
   * Links each location to its parent object so pathCodes can walk it. Loaded
   * locations are reused, so passing a whole page costs one query however many
   * rows share a branch.
   */
  async hydrate(locations: readonly StorageLocation[]): Promise<void> {
    const seeds = locations.filter((location) => location.parentId !== null);
    if (seeds.length === 0) {
      return;
    }

    const rows: AncestorRow[] = await this.locations.query(ANCESTORS, [
      seeds.map((location) => location.id),
    ]);

    const known = new Map<number, StorageLocation>();
    for (const location of locations) {
      known.set(location.id, location);
    }
    for (const row of rows) {
      if (!known.has(row.id)) {
        known.set(row.id, this.fromRow(row));
      }
    }

    const parentOf = new Map<number, number | null>();
    for (const row of rows) {
      parentOf.set(row.id, row.parent_id);
    }

    for (const location of known.values()) {
      const parentId = parentOf.get(location.id) ?? location.parentId;
      location.parent = parentId === null ? null : known.get(parentId) ?? null;
    }
  }

  /** Ids of a location and everything nested below it, for a subtree filter. */
  async subtreeIds(code: string): Promise<number[]> {
    const root = await this.byCode(code);
    const found = new Set<number>([root.id]);
    let frontier = [root.id];

    while (frontier.length > 0) {
      const children = await this.locations.find({ where: { parent: { id: In(frontier) } } });
      frontier = [];

      for (const child of children) {
        if (!found.has(child.id)) {
          found.add(child.id);
          frontier.push(child.id);
        }
      }
    }
    return [...found];
  }

  private fromRow(row: AncestorRow): StorageLocation {
    const location = new StorageLocation();
    location.id = row.id;
    location.code = row.code;
    location.name = row.name;
    location.site = row.site;
    location.parentId = row.parent_id;
    return location;
  }
}
