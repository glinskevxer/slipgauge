import { InstrumentRegister1736000000001 } from './1736000000001-InstrumentRegister';
import { ReferenceData1736000000002 } from './1736000000002-ReferenceData';

/**
 * Every migration, in the order they run.
 *
 * <p>Listed explicitly rather than globbed. A glob resolves differently from
 * source and from a built bundle, and a migration that silently does not run
 * is the worst failure this file could have.
 */
export const MIGRATIONS = [InstrumentRegister1736000000001, ReferenceData1736000000002];
