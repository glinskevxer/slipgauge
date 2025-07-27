import { InstrumentDetail, UpdateInstrumentRequest } from '@core/models/instrument.model';

/**
 * Editing a registered instrument.
 *
 * <p>Three fields are not here on purpose. Manufacturer, model and serial
 * number identify the physical thing, and letting them be edited would let one
 * asset quietly become another while keeping its whole calibration history.
 * Correcting those means retiring the record and booking the instrument in
 * again, which is the honest answer.
 */

export interface EditDraft {
  description: string;
  rangeLow: number | null;
  rangeHigh: number | null;
  resolution: number | null;
  locationCode: string;
  custodian: string;
  referenceStandard: boolean;
}

export interface EditProblem {
  readonly field: keyof EditDraft | 'span';
  readonly message: string;
}

export function draftFrom(instrument: InstrumentDetail): EditDraft {
  return {
    description: instrument.description ?? '',
    rangeLow: instrument.rangeLow,
    rangeHigh: instrument.rangeHigh,
    resolution: instrument.resolution,
    locationCode: instrument.locationCode ?? '',
    custodian: instrument.custodian ?? '',
    referenceStandard: instrument.referenceStandard,
  };
}

export function problemsIn(draft: EditDraft): readonly EditProblem[] {
  const problems: EditProblem[] = [];

  if (draft.rangeLow === null) {
    problems.push({ field: 'rangeLow', message: 'The low end of the range is needed.' });
  }
  if (draft.rangeHigh === null) {
    problems.push({ field: 'rangeHigh', message: 'The high end of the range is needed.' });
  }
  if (draft.resolution === null) {
    problems.push({ field: 'resolution', message: 'A resolution is needed.' });
  }
  if (draft.rangeLow !== null && draft.rangeHigh !== null && draft.rangeLow >= draft.rangeHigh) {
    problems.push({
      field: 'span',
      message: 'The low end of the range has to sit below the high end.',
    });
  }
  if (draft.resolution !== null && draft.resolution <= 0) {
    problems.push({ field: 'resolution', message: 'The resolution has to be more than zero.' });
  }
  if (
    draft.resolution !== null &&
    draft.rangeLow !== null &&
    draft.rangeHigh !== null &&
    draft.resolution > draft.rangeHigh - draft.rangeLow
  ) {
    problems.push({
      field: 'resolution',
      message: 'The resolution cannot be wider than the range itself.',
    });
  }
  if (draft.description.length > 400) {
    problems.push({ field: 'description', message: 'Keep the description under 400 characters.' });
  }

  return problems;
}

export function isUsable(draft: EditDraft): boolean {
  return problemsIn(draft).length === 0;
}

/** What actually differs from the record, so nothing is reported as a change that is not one. */
export function changesBetween(
  instrument: InstrumentDetail,
  draft: EditDraft,
): readonly string[] {
  const changes: string[] = [];
  const original = draftFrom(instrument);

  if (original.description !== draft.description) {changes.push('description');}
  if (original.rangeLow !== draft.rangeLow) {changes.push('range low');}
  if (original.rangeHigh !== draft.rangeHigh) {changes.push('range high');}
  if (original.resolution !== draft.resolution) {changes.push('resolution');}
  if (original.locationCode !== draft.locationCode) {changes.push('location');}
  if (original.custodian !== draft.custodian) {changes.push('custodian');}
  if (original.referenceStandard !== draft.referenceStandard) {
    changes.push(
      draft.referenceStandard ? 'now a reference standard' : 'no longer a reference standard',
    );
  }

  return changes;
}

/**
 * Warnings a person should read before saving. None of them block the save;
 * they are the changes that reach further than the record being edited.
 */
export function consequencesOf(
  instrument: InstrumentDetail,
  draft: EditDraft,
): readonly string[] {
  const warnings: string[] = [];
  const original = draftFrom(instrument);

  if (!original.referenceStandard && draft.referenceStandard) {
    warnings.push(
      'Marking this as a reference standard means a failure on it will cascade to every certificate it signs off from now on.',
    );
  }
  if (original.referenceStandard && !draft.referenceStandard) {
    warnings.push(
      'Certificates already issued against this instrument keep their chain. Only future ones are affected.',
    );
  }
  if (
    original.rangeLow !== draft.rangeLow ||
    original.rangeHigh !== draft.rangeHigh
  ) {
    warnings.push(
      'Narrowing the range will refuse any future sheet with a nominal outside it. Certificates already filed are untouched.',
    );
  }
  if (original.resolution !== draft.resolution) {
    warnings.push(
      'The resolution feeds the uncertainty budget. Changing it does not recompute certificates already filed.',
    );
  }

  return warnings;
}

export function toRequest(draft: EditDraft): UpdateInstrumentRequest {
  return {
    description: draft.description.trim() || null,
    rangeLow: draft.rangeLow ?? 0,
    rangeHigh: draft.rangeHigh ?? 0,
    resolution: draft.resolution ?? 0,
    locationCode: draft.locationCode || null,
    custodian: draft.custodian.trim() || null,
    referenceStandard: draft.referenceStandard,
  };
}
