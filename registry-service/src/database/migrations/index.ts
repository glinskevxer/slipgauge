import { InstrumentRegister1736000000001 } from './1736000000001-InstrumentRegister';
import { ReferenceData1736000000002 } from './1736000000002-ReferenceData';
import { Certificates1736000000005 } from './1736000000005-Certificates';
import { Traceability1736000000006 } from './1736000000006-Traceability';
import { IntervalDecisions1736000000007 } from './1736000000007-IntervalDecisions';
import { UsageLog1736000000008 } from './1736000000008-UsageLog';
import { ImpactAssessments1736000000009 } from './1736000000009-ImpactAssessments';
import { Accounts1736000000010 } from './1736000000010-Accounts';
import { Attachments1736000000011 } from './1736000000011-Attachments';
import { CustomerJobs1736000000012 } from './1736000000012-CustomerJobs';
import { ContractReview1736000000013 } from './1736000000013-ContractReview';
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
  Accounts1736000000010,
  Attachments1736000000011,
  CustomerJobs1736000000012,
  ContractReview1736000000013,
];
