import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConflictError } from '../common/errors';
import type { LabConfig } from '../config/lab.config';
import { Instrument } from './instrument.entity';

/**
 * Hands out the next asset tag in the laboratory's sequence. Tags are read
 * aloud across a bench and typed into paper job sheets, so they stay short,
 * fixed width and strictly increasing rather than becoming identifiers.
 */
@Injectable()
export class AssetTagService {
  private readonly lab: LabConfig;

  constructor(
    @InjectRepository(Instrument) private readonly instruments: Repository<Instrument>,
    config: ConfigService,
  ) {
    this.lab = config.getOrThrow<LabConfig>('lab');
  }

  async next(): Promise<string> {
    const prefix = `${this.lab.assetTagPrefix}-`;

    const highest = await this.instruments
      .createQueryBuilder('instrument')
      .select('max(instrument.asset_tag)', 'tag')
      .where('instrument.asset_tag like :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ tag: string | null }>();

    return this.format(this.parseSequence(highest?.tag ?? null, prefix) + 1);
  }

  format(sequence: number): string {
    const ceiling = 10 ** this.lab.assetTagWidth;

    if (sequence >= ceiling) {
      throw new ConflictError(
        `the asset tag sequence has run out of width at ${this.lab.assetTagWidth} digits`,
      );
    }
    return this.lab.assetTagPrefix + '-' + String(sequence).padStart(this.lab.assetTagWidth, '0');
  }

  /**
   * Reads the numeric tail of a tag. Anything that does not match the shape
   * this allocator produces is treated as sequence zero, which lets tags
   * imported from the old paper register sit alongside generated ones.
   */
  parseSequence(tag: string | null, prefix: string): number {
    if (!tag) {
      return 0;
    }
    const pattern = new RegExp(`^${escapeForRegExp(prefix)}(\\d+)$`);
    const match = pattern.exec(tag);
    return match ? Number(match[1]) : 0;
  }
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
