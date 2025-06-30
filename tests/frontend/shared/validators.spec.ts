import { FormControl, FormGroup } from '@angular/forms';

import {
  dateRangeOrdered,
  firstMessage,
  maxDecimalPlaces,
  notInTheFuture,
  resolutionFitsSpan,
  spanOrdered,
  trimmedNotBlank,
} from '@shared/forms/validators';

function span(low: unknown, high: unknown, resolution: unknown = null): FormGroup {
  return new FormGroup({
    rangeLow: new FormControl(low),
    rangeHigh: new FormControl(high),
    resolution: new FormControl(resolution),
  });
}

describe('span validators', () => {
  it('accepts a range the right way round', () => {
    expect(spanOrdered('rangeLow', 'rangeHigh')(span(0, 25))).toBeNull();
  });

  it('rejects a range with equal ends, which measures nothing', () => {
    expect(spanOrdered('rangeLow', 'rangeHigh')(span(25, 25))).toEqual({
      spanOrdered: { low: 25, high: 25 },
    });
  });

  it('says nothing while a field is still empty', () => {
    expect(spanOrdered('rangeLow', 'rangeHigh')(span('', 25))).toBeNull();
    expect(spanOrdered('rangeLow', 'rangeHigh')(span(0, null))).toBeNull();
  });

  it('accepts a bipolar range', () => {
    expect(spanOrdered('rangeLow', 'rangeHigh')(span(-1000, 1000))).toBeNull();
  });

  it('accepts a resolution that fits inside the span', () => {
    const check = resolutionFitsSpan('rangeLow', 'rangeHigh', 'resolution');
    expect(check(span(0, 25, 0.001))).toBeNull();
    expect(check(span(0, 25, 25))).toBeNull();
  });

  it('rejects a resolution wider than the span', () => {
    const check = resolutionFitsSpan('rangeLow', 'rangeHigh', 'resolution');
    expect(check(span(0, 1, 2))).toEqual({ resolutionFitsSpan: { resolution: 2 } });
  });

  it('rejects a resolution of zero or less', () => {
    const check = resolutionFitsSpan('rangeLow', 'rangeHigh', 'resolution');
    expect(check(span(0, 25, 0))).toEqual({ resolutionPositive: true });
    expect(check(span(0, 25, -0.1))).toEqual({ resolutionPositive: true });
  });
});

describe('date validators', () => {
  it('accepts today and refuses tomorrow', () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

    expect(notInTheFuture(new FormControl(today))).toBeNull();
    expect(notInTheFuture(new FormControl(tomorrow))).toEqual({
      notInTheFuture: { value: tomorrow },
    });
  });

  it('ignores an empty date rather than calling it invalid', () => {
    expect(notInTheFuture(new FormControl(''))).toBeNull();
  });

  it('checks that a range runs forwards', () => {
    const group = new FormGroup({
      from: new FormControl('2025-01-01'),
      to: new FormControl('2024-12-31'),
    });

    expect(dateRangeOrdered('from', 'to')(group)).toEqual({
      dateRangeOrdered: { from: '2025-01-01', to: '2024-12-31' },
    });
  });

  it('accepts a range that starts and ends on the same day', () => {
    const group = new FormGroup({
      from: new FormControl('2025-01-01'),
      to: new FormControl('2025-01-01'),
    });

    expect(dateRangeOrdered('from', 'to')(group)).toBeNull();
  });
});

describe('text and precision validators', () => {
  it('refuses a value made only of spaces', () => {
    expect(trimmedNotBlank(new FormControl('   '))).toEqual({ trimmedNotBlank: true });
    expect(trimmedNotBlank(new FormControl(' A '))).toBeNull();
    expect(trimmedNotBlank(new FormControl(''))).toBeNull();
  });

  it('counts decimal places', () => {
    const check = maxDecimalPlaces(3);
    expect(check(new FormControl('0.001'))).toBeNull();
    expect(check(new FormControl('0.0001'))).toEqual({ maxDecimalPlaces: { places: 3 } });
    expect(check(new FormControl('12'))).toBeNull();
  });
});

describe('message selection', () => {
  it('says nothing when there is nothing wrong', () => {
    expect(firstMessage(null)).toBeNull();
  });

  it('turns each error into a sentence a technician can act on', () => {
    expect(firstMessage({ required: true })).toBe('This field is needed.');
    expect(firstMessage({ spanOrdered: { low: 1, high: 0 } })).toContain('low end');
    expect(firstMessage({ maxlength: { requiredLength: 24 } })).toContain('24 characters');
    expect(firstMessage({ maxDecimalPlaces: { places: 3 } })).toContain('3 decimal places');
  });

  it('falls back to a plain sentence for an error it does not know', () => {
    expect(firstMessage({ somethingNew: true })).toBe('That value was not accepted.');
  });
});
