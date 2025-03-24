/**
 * A specific reason a chain does not hold. Each one names the edge it came
 * from, because a certificate with six standards on it is useless to a
 * technician if all it says is that something was wrong.
 */
export enum ChainDefectKind {
  /** The standard has no certificate covering the date it was used. */
  NO_CERTIFICATE_ON_DATE = 'NO_CERTIFICATE_ON_DATE',
  /** The standard's own last result was not serviceable. */
  STANDARD_NOT_SERVICEABLE = 'STANDARD_NOT_SERVICEABLE',
  /** The standard was past its own recall date when it was used. */
  STANDARD_OVERDUE = 'STANDARD_OVERDUE',
  /** The instrument used as a reference is not registered as a standard. */
  NOT_A_REFERENCE_STANDARD = 'NOT_A_REFERENCE_STANDARD',
  /** An outside standard's stated validity window did not cover the date. */
  EXTERNAL_WINDOW_MISSED = 'EXTERNAL_WINDOW_MISSED',
  /** The chain loops back on itself. */
  CIRCULAR = 'CIRCULAR',
  /** No reference standard was recorded at all. */
  NO_REFERENCE = 'NO_REFERENCE',
}

export interface ChainDefect {
  /** Which rule was broken. */
  readonly kind: ChainDefectKind;
  /** How the offending standard is written on the certificate. */
  readonly standard: string;
  /** A sentence a technician can act on. */
  readonly detail: string;
}

export const chainDefect = {
  noCertificate(standard: string, on: string): ChainDefect {
    return {
      kind: ChainDefectKind.NO_CERTIFICATE_ON_DATE,
      standard,
      detail: `no live certificate for ${standard} covers ${on}`,
    };
  },

  notServiceable(standard: string, verdict: string): ChainDefect {
    return {
      kind: ChainDefectKind.STANDARD_NOT_SERVICEABLE,
      standard,
      detail: `${standard} was left ${verdict} at its own last calibration`,
    };
  },

  overdue(standard: string, dueOn: string, usedOn: string): ChainDefect {
    return {
      kind: ChainDefectKind.STANDARD_OVERDUE,
      standard,
      detail: `${standard} was due on ${dueOn} and was used on ${usedOn}`,
    };
  },

  notAStandard(standard: string): ChainDefect {
    return {
      kind: ChainDefectKind.NOT_A_REFERENCE_STANDARD,
      standard,
      detail: `${standard} is not registered as a reference standard`,
    };
  },

  externalWindow(standard: string, on: string): ChainDefect {
    return {
      kind: ChainDefectKind.EXTERNAL_WINDOW_MISSED,
      standard,
      detail: `the validity quoted for ${standard} does not cover ${on}`,
    };
  },

  circular(standard: string): ChainDefect {
    return {
      kind: ChainDefectKind.CIRCULAR,
      standard,
      detail: `the chain returns to ${standard} and cannot terminate`,
    };
  },

  missingReference(): ChainDefect {
    return {
      kind: ChainDefectKind.NO_REFERENCE,
      standard: '-',
      detail: 'no reference standard was recorded on the certificate',
    };
  },
};
