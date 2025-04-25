import { InstrumentRegister1736000000001 } from './1736000000001-InstrumentRegister';
import { ReferenceData1736000000002 } from './1736000000002-ReferenceData';
import { Certificates1736000000005 } from './1736000000005-Certificates';
import { Traceability1736000000006 } from './1736000000006-Traceability';
import { IntervalDecisions1736000000007 } from './1736000000007-IntervalDecisions';
import { UsageLog1736000000008 } from './1736000000008-UsageLog';
import { ImpactAssessments1736000000009 } from './1736000000009-ImpactAssessments';
import { ProfileClassLinks1736000000004 } from './1736000000004-ProfileClassLinks';
import { ToleranceProfiles1736000000003 } from './1736000000003-ToleranceProfiles';

/**
 * Every migration, in the order they run.
 *
 * <p>Listed explicitly rather than globbed. A glob resolves differently from
 * source and from a built bundle, and a migration that silently does not run
 * is the worst failure this file could have.
 */
export const MIGRATIONS = [
  InstrumentRegister1736000000001,
  ReferenceData1736000000002,
  ToleranceProfiles1736000000003,
  ProfileClassLinks1736000000004,
  Certificates1736000000005,
  Traceability1736000000006,
  IntervalDecisions1736000000007,
  UsageLog1736000000008,
  ImpactAssessments1736000000009,
];
