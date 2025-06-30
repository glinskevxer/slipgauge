import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * The validators the registry's own rules need. Each one mirrors a check the
 * service also makes, so a mistake is caught at the keyboard rather than three
 * fields later, and each returns the same key the service's problem document
 * would use so the messages can be written once.
 */

/** The measuring span has to have a low end below its high end. */
export function spanOrdered(lowKey: string, highKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const low = numberOf(group.get(lowKey)?.value);
    const high = numberOf(group.get(highKey)?.value);
    if (low === null || high === null) {
      return null;
    }
    return low < high ? null : { spanOrdered: { low, high } };
  };
}

/** A resolution wider than the span it belongs to is meaningless. */
export function resolutionFitsSpan(
  lowKey: string,
  highKey: string,
  resolutionKey: string,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const low = numberOf(group.get(lowKey)?.value);
    const high = numberOf(group.get(highKey)?.value);
    const resolution = numberOf(group.get(resolutionKey)?.value);
    if (low === null || high === null || resolution === null) {
      return null;
    }
    if (resolution <= 0) {
      return { resolutionPositive: true };
    }
    return resolution <= high - low ? null : { resolutionFitsSpan: { resolution } };
  };
}

/** A date the operator cannot have lived through yet. */
export const notInTheFuture: ValidatorFn = (control: AbstractControl) => {
  const value = String(control.value ?? '');
  if (!value) {
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  return value <= today ? null : { notInTheFuture: { value } };
};

/** A range where the from date must not sit after the to date. */
export function dateRangeOrdered(fromKey: string, toKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = String(group.get(fromKey)?.value ?? '');
    const to = String(group.get(toKey)?.value ?? '');
    if (!from || !to) {
      return null;
    }
    return from <= to ? null : { dateRangeOrdered: { from, to } };
  };
}

/** Serial numbers are printed on a plate and read back, so no stray spaces. */
export const trimmedNotBlank: ValidatorFn = (control: AbstractControl) => {
  const value = String(control.value ?? '');
  if (!value) {
    return null;
  }
  return value.trim().length > 0 ? null : { trimmedNotBlank: true };
};

export function maxDecimalPlaces(places: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    if (!value) {
      return null;
    }
    const decimals = value.split('.')[1];
    if (!decimals) {
      return null;
    }
    return decimals.length <= places ? null : { maxDecimalPlaces: { places } };
  };
}

const MESSAGES: Readonly<Record<string, (detail: unknown) => string>> = {
  required: () => 'This field is needed.',
  maxlength: (detail) =>
    `Keep this to ${(detail as { requiredLength: number }).requiredLength} characters.`,
  spanOrdered: () => 'The low end of the range must sit below the high end.',
  resolutionFitsSpan: () => 'The resolution cannot be wider than the range itself.',
  resolutionPositive: () => 'The resolution has to be more than zero.',
  notInTheFuture: () => 'That date has not happened yet.',
  dateRangeOrdered: () => 'The from date sits after the to date.',
  trimmedNotBlank: () => 'This cannot be only spaces.',
  maxDecimalPlaces: (detail) =>
    `At most ${(detail as { places: number }).places} decimal places.`,
};

/** The first message worth showing for a control, or null when it is fine. */
export function firstMessage(errors: ValidationErrors | null): string | null {
  if (!errors) {
    return null;
  }
  for (const [key, detail] of Object.entries(errors)) {
    const builder = MESSAGES[key];
    if (builder) {
      return builder(detail);
    }
  }
  return 'That value was not accepted.';
}

function numberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
