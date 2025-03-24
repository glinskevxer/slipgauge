import { ChainDefect, ChainDefectKind } from './chain-defect';

/**
 * The verdict on one certificate's traceability, plus how far the chain had to
 * be walked to terminate. Depth is reported because an accreditation assessor
 * asks for it directly, and because a chain that keeps getting deeper is a
 * sign a standard is being used where a working instrument would do.
 */
export class ChainReport {
  private constructor(
    /** True when nothing was found wrong. */
    readonly sound: boolean,
    /** Hops from this certificate to an outside standard. */
    readonly depth: number,
    /** True when every branch ended at an accredited outside laboratory. */
    readonly terminates: boolean,
    /** Everything found wrong, in the order the edges were read. */
    readonly defects: readonly ChainDefect[],
  ) {
    Object.freeze(this);
  }

  static sound(depth: number, terminates: boolean): ChainReport {
    return new ChainReport(true, depth, terminates, []);
  }

  static broken(depth: number, terminates: boolean, defects: readonly ChainDefect[]): ChainReport {
    return new ChainReport(false, depth, terminates, [...defects]);
  }

  hasDefect(kind: ChainDefectKind): boolean {
    return this.defects.some((defect) => defect.kind === kind);
  }

  /** The first defect, which is the one the error message leads with. */
  firstDefect(): ChainDefect | null {
    return this.defects[0] ?? null;
  }

  summarise(): string {
    if (this.sound) {
      const hops = `${this.depth} hop${this.depth === 1 ? '' : 's'}`;
      return this.terminates
        ? `traceable in ${hops}`
        : `traceable in ${hops} but no branch reaches an outside lab`;
    }
    const count = this.defects.length;
    return `${count} problem${count === 1 ? '' : 's'} on the chain`;
  }
}
