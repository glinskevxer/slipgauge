import { Instrument } from '@registry/instrument/instrument.entity';
import { InstrumentClass } from '@registry/instrument/instrument-class.entity';
import {
  Criticality,
  Discipline,
  InstrumentStatus,
  canTransition,
  extensionFactor,
  statusIsUsable,
  transitionsFrom,
} from '@registry/instrument/instrument.enums';

const ACQUIRED = '2023-04-11';

function micrometerClass(): InstrumentClass {
  const type = new InstrumentClass();
  type.code = 'MIC-EXT';
  type.name = 'External micrometer';
  type.discipline = Discipline.DIMENSIONAL;
  type.criticality = Criticality.IMPORTANT;
  type.applyIntervals(365, 180, 730);
  return type;
}

function micrometer(): Instrument {
  const instrument = new Instrument();
  instrument.assetTag = 'SG-000101';
  instrument.instrumentClass = micrometerClass();
  instrument.manufacturer = 'Mitutoyo';
  instrument.model = '103-137';
  instrument.serialNumber = '7241188';
  instrument.unit = 'mm';
  instrument.acquiredOn = ACQUIRED;
  instrument.status = InstrumentStatus.IN_SERVICE;
  instrument.applySpan(0, 25, 0.001);
  return instrument;
}

describe('instrument spans', () => {
  it('reject a low bound at or above the high bound', () => {
    expect(() => micrometer().applySpan(25, 25, 0.001)).toThrow(
      'range low must sit below range high',
    );
  });

  it('reject a resolution wider than the span itself', () => {
    expect(() => micrometer().applySpan(0, 1, 2)).toThrow('resolution cannot exceed the span');
  });

  it('reject a resolution of zero', () => {
    expect(() => micrometer().applySpan(0, 25, 0)).toThrow('resolution must be positive');
  });

  it('include both end points in coverage', () => {
    const instrument = micrometer();

    expect(instrument.covers(0)).toBe(true);
    expect(instrument.covers(25)).toBe(true);
    expect(instrument.covers(25.0001)).toBe(false);
    expect(instrument.covers(-0.0001)).toBe(false);
  });

  it('report the span as the arithmetic width of the range', () => {
    expect(micrometer().span()).toBe(25);
  });
});

describe('retiring an instrument', () => {
  it('is refused before the acquisition date', () => {
    const instrument = micrometer();

    expect(() => instrument.retire('2023-04-10')).toThrow('before it was acquired');
    expect(instrument.status).toBe(InstrumentStatus.IN_SERVICE);
  });

  it('cannot be undone', () => {
    const instrument = micrometer();
    instrument.retire('2025-01-06');

    expect(instrument.retiredOn).toBe('2025-01-06');
    expect(() => instrument.transitionTo(InstrumentStatus.IN_SERVICE)).toThrow(
      'cannot move from RETIRED',
    );
  });
});

describe('status transitions', () => {
  it('refuse a move to the status it is already in', () => {
    expect(canTransition(InstrumentStatus.IN_SERVICE, InstrumentStatus.IN_SERVICE)).toBe(false);
  });

  it('let an in service instrument go anywhere', () => {
    expect(transitionsFrom(InstrumentStatus.IN_SERVICE)).toHaveLength(5);
  });

  it('never let a retired instrument come back', () => {
    expect(transitionsFrom(InstrumentStatus.RETIRED)).toEqual([]);
  });

  it('will not send a quarantined instrument straight back into service', () => {
    expect(canTransition(InstrumentStatus.QUARANTINED, InstrumentStatus.IN_SERVICE)).toBe(false);
    expect(canTransition(InstrumentStatus.QUARANTINED, InstrumentStatus.IN_CALIBRATION)).toBe(true);
  });

  it('only call in service and on loan usable', () => {
    expect(statusIsUsable(InstrumentStatus.IN_SERVICE)).toBe(true);
    expect(statusIsUsable(InstrumentStatus.ON_LOAN)).toBe(true);
    expect(statusIsUsable(InstrumentStatus.QUARANTINED)).toBe(false);
    expect(statusIsUsable(InstrumentStatus.RETIRED)).toBe(false);
  });
});

describe('instrument classes', () => {
  it('insist the three interval bounds are ordered', () => {
    expect(() => new InstrumentClass().applyIntervals(100, 200, 300)).toThrow(
      'min <= base <= max',
    );
  });

  it('refuse a zero minimum interval', () => {
    expect(() => new InstrumentClass().applyIntervals(100, 0, 300)).toThrow(
      'minimum interval must be positive',
    );
  });

  it('pull a proposal back inside the window', () => {
    const type = new InstrumentClass();
    type.applyIntervals(730, 365, 1095);

    expect(type.clampInterval(30)).toBe(365);
    expect(type.clampInterval(5000)).toBe(1095);
    expect(type.clampInterval(800)).toBe(800);
  });

  it('shrink how far a critical class may be extended', () => {
    expect(extensionFactor(Criticality.ROUTINE)).toBe(1);
    expect(extensionFactor(Criticality.IMPORTANT)).toBe(0.75);
    expect(extensionFactor(Criticality.CRITICAL)).toBe(0.5);
  });
});
