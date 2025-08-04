import { AcceptancePolicy, StandardRole } from '@core/models/calibration.model';

/** One row of the calibration sheet as the bench fills it in. */
export interface PointDraft {
  readonly key: string;
  sequenceNo: number;
  label: string;
  nominal: number | null;
  asFound: number | null;
  asLeft: number | null;
  expandedUncertainty: number | null;
  coverageFactor: number | null;
}

/** One standard the calibration leaned on. */
export interface StandardDraft {
  readonly key: string;
  source: 'internal' | 'external';
  assetTag: string;
  externalRef: string;
  externalLab: string;
  externalCertificateNumber: string;
  externalAccreditation: string;
  externalValidFrom: string;
  externalValidTo: string;
  role: StandardRole;
}

export interface SheetDraft {
  certificateNumber: string;
  assetTag: string;
  performedOn: string;
  issuedOn: string;
  performedBy: string;
  issuingLab: string;
  externalLab: boolean;
  adjusted: boolean;
  ambientTemperature: number | null;
  ambientHumidity: number | null;
  remarks: string;
  acceptancePolicy: AcceptancePolicy;
  traceabilityOverrideReason: string;
  points: PointDraft[];
  standards: StandardDraft[];
}

let keySequence = 0;

function nextKey(prefix: string): string {
  keySequence += 1;
  return `${prefix}-${keySequence}`;
}

export function emptyPoint(sequenceNo: number): PointDraft {
  return {
    key: nextKey('point'),
    sequenceNo,
    label: '',
    nominal: null,
    asFound: null,
    asLeft: null,
    expandedUncertainty: null,
    coverageFactor: 2,
  };
}

export function emptyStandard(source: 'internal' | 'external' = 'internal'): StandardDraft {
  return {
    key: nextKey('standard'),
    source,
    assetTag: '',
    externalRef: '',
    externalLab: '',
    externalCertificateNumber: '',
    externalAccreditation: '',
    externalValidFrom: '',
    externalValidTo: '',
    role: 'REFERENCE',
  };
}

export function emptySheet(): SheetDraft {
  const today = new Date().toISOString().slice(0, 10);
  return {
    certificateNumber: '',
    assetTag: '',
    performedOn: today,
    issuedOn: today,
    performedBy: '',
    issuingLab: 'Slipgauge Metrology',
    externalLab: false,
    adjusted: false,
    ambientTemperature: null,
    ambientHumidity: null,
    remarks: '',
    acceptancePolicy: 'MANAGED_RISK',
    traceabilityOverrideReason: '',
    points: [emptyPoint(1)],
    standards: [emptyStandard('internal')],
  };
}

export type SheetStep = 'header' | 'standards' | 'points' | 'review';

export const STEP_ORDER: readonly SheetStep[] = ['header', 'standards', 'points', 'review'];

export interface StepProblem {
  readonly step: SheetStep;
  readonly field: string;
  readonly message: string;
}

/**
 * Everything wrong with the draft, grouped by the step it belongs to.
 *
 * <p>The wizard refuses to move on from a step with problems, but it shows
 * every step's problems at once. A technician filling a sheet in from a paper
 * record wants to know the whole shape of what is missing, not to discover it
 * one screen at a time.
 */
export function problemsIn(draft: SheetDraft): readonly StepProblem[] {
  const problems: StepProblem[] = [];

  if (!draft.certificateNumber.trim()) {
    problems.push(header('certificateNumber', 'The certificate needs a number.'));
  }
  if (!draft.assetTag.trim()) {
    problems.push(header('assetTag', 'Choose the instrument this sheet belongs to.'));
  }
  if (!draft.performedBy.trim()) {
    problems.push(header('performedBy', 'Record who did the work.'));
  }
  if (!draft.issuingLab.trim()) {
    problems.push(header('issuingLab', 'Record which laboratory issued it.'));
  }
  if (draft.performedOn && draft.issuedOn && draft.issuedOn < draft.performedOn) {
    problems.push(header('issuedOn', 'A certificate cannot be issued before the work was done.'));
  }
  if (draft.performedOn > new Date().toISOString().slice(0, 10)) {
    problems.push(header('performedOn', 'A calibration cannot be dated in the future.'));
  }

  const references = draft.standards.filter((entry) => entry.role === 'REFERENCE');
  if (references.length === 0) {
    problems.push(standards('role', 'At least one standard has to carry the reference role.'));
  }
  draft.standards.forEach((entry, index) => {
    if (entry.source === 'internal' && !entry.assetTag.trim()) {
      problems.push(standards(`assetTag.${index}`, `Standard ${index + 1} needs an asset tag.`));
    }
    if (entry.source === 'external' && !entry.externalRef.trim()) {
      problems.push(
        standards(`externalRef.${index}`, `Standard ${index + 1} needs an outside reference.`),
      );
    }
    if (
      entry.source === 'external' &&
      entry.externalValidFrom &&
      entry.externalValidTo &&
      entry.externalValidFrom > entry.externalValidTo
    ) {
      problems.push(
        standards(`validity.${index}`, `Standard ${index + 1} has a validity window that runs backwards.`),
      );
    }
    if (
      entry.source === 'external' &&
      entry.role === 'REFERENCE' &&
      entry.externalValidTo &&
      draft.performedOn &&
      entry.externalValidTo < draft.performedOn
    ) {
      problems.push(
        standards(
          `expiry.${index}`,
          `Standard ${index + 1} had expired by the day this calibration was done.`,
        ),
      );
    }
  });

  if (draft.points.length === 0) {
    problems.push(points('points', 'A sheet needs at least one measurement point.'));
  }
  const seen = new Set<number>();
  draft.points.forEach((point, index) => {
    if (point.nominal === null) {
      problems.push(points(`nominal.${index}`, `Point ${index + 1} needs a nominal value.`));
    }
    if (point.expandedUncertainty === null || point.expandedUncertainty < 0) {
      problems.push(
        points(`uncertainty.${index}`, `Point ${index + 1} needs an expanded uncertainty.`),
      );
    }
    if (point.coverageFactor !== null && point.coverageFactor <= 0) {
      problems.push(points(`coverage.${index}`, `Point ${index + 1} needs a positive coverage factor.`));
    }
    if (seen.has(point.sequenceNo)) {
      problems.push(points(`sequence.${index}`, `Point number ${point.sequenceNo} appears twice.`));
    }
    seen.add(point.sequenceNo);
  });

  return problems;
}

export function problemsFor(
  draft: SheetDraft,
  step: SheetStep,
): readonly StepProblem[] {
  return problemsIn(draft).filter((problem) => problem.step === step);
}

export function isComplete(draft: SheetDraft): boolean {
  return problemsIn(draft).length === 0;
}

function header(field: string, message: string): StepProblem {
  return { step: 'header', field, message };
}

function standards(field: string, message: string): StepProblem {
  return { step: 'standards', field, message };
}

function points(field: string, message: string): StepProblem {
  return { step: 'points', field, message };
}

/** Turns the draft into the payload the service expects. */
export function toRequest(draft: SheetDraft): Record<string, unknown> {
  return {
    certificateNumber: draft.certificateNumber.trim(),
    assetTag: draft.assetTag.trim(),
    performedOn: draft.performedOn,
    issuedOn: draft.issuedOn,
    performedBy: draft.performedBy.trim(),
    issuingLab: draft.issuingLab.trim(),
    externalLab: draft.externalLab,
    adjusted: draft.adjusted,
    ambientTemperature: draft.ambientTemperature,
    ambientHumidity: draft.ambientHumidity,
    remarks: draft.remarks.trim() || null,
    acceptancePolicy: draft.acceptancePolicy,
    traceabilityOverrideReason: draft.traceabilityOverrideReason.trim() || null,
    points: draft.points.map((point) => ({
      sequenceNo: point.sequenceNo,
      label: point.label.trim() || null,
      nominal: point.nominal,
      asFound: point.asFound,
      asLeft: point.asLeft,
      expandedUncertainty: point.expandedUncertainty,
      coverageFactor: point.coverageFactor,
    })),
    standards: draft.standards.map((entry) =>
      entry.source === 'internal'
        ? { assetTag: entry.assetTag.trim(), role: entry.role }
        : {
            externalRef: entry.externalRef.trim(),
            externalLab: entry.externalLab.trim() || null,
            externalCertificateNumber: entry.externalCertificateNumber.trim() || null,
            externalAccreditation: entry.externalAccreditation.trim() || null,
            externalValidFrom: entry.externalValidFrom || null,
            externalValidTo: entry.externalValidTo || null,
            role: entry.role,
          },
    ),
  };
}
