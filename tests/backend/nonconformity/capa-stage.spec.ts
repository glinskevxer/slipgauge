import { InvalidTransitionError } from '@registry/common/errors';
import {
  CapaStage,
  NonconformitySeverity,
  allowedDaysFor,
  canMove,
  isOpen,
  isTerminal,
  latenessOf,
  mayClose,
  needsEscalation,
  nextStage,
  requireMove,
  stageLabel,
  stageNeededToClose,
  stageRank,
} from '@registry/nonconformity/capa-stage';

describe('the stages', () => {
  it('runs containment before cause before action before effectiveness', () => {
    expect(stageRank(CapaStage.RAISED)).toBeLessThan(stageRank(CapaStage.CONTAINED));
    expect(stageRank(CapaStage.CONTAINED)).toBeLessThan(stageRank(CapaStage.CAUSE_FOUND));
    expect(stageRank(CapaStage.CAUSE_FOUND)).toBeLessThan(stageRank(CapaStage.ACTION_TAKEN));
    expect(stageRank(CapaStage.ACTION_TAKEN)).toBeLessThan(
      stageRank(CapaStage.EFFECTIVENESS_CHECKED),
    );
  });

  it('knows which stages are finished', () => {
    expect(isTerminal(CapaStage.CLOSED)).toBe(true);
    expect(isTerminal(CapaStage.ABANDONED)).toBe(true);
    expect(isTerminal(CapaStage.ACTION_TAKEN)).toBe(false);
    expect(isOpen(CapaStage.RAISED)).toBe(true);
    expect(isOpen(CapaStage.CLOSED)).toBe(false);
  });

  it('names the next stage, and nothing after the last', () => {
    expect(nextStage(CapaStage.RAISED)).toBe(CapaStage.CONTAINED);
    expect(nextStage(CapaStage.EFFECTIVENESS_CHECKED)).toBe(CapaStage.CLOSED);
    expect(nextStage(CapaStage.CLOSED)).toBeNull();
    expect(nextStage(CapaStage.ABANDONED)).toBeNull();
  });

  it('reads each stage in words', () => {
    expect(stageLabel(CapaStage.CAUSE_FOUND)).toBe('Cause found');
    expect(stageLabel(CapaStage.EFFECTIVENESS_CHECKED)).toBe('Effectiveness checked');
  });
});

describe('moving between stages', () => {
  it('allows one step forward only', () => {
    expect(canMove(CapaStage.RAISED, CapaStage.CONTAINED)).toBe(true);
    expect(canMove(CapaStage.RAISED, CapaStage.CAUSE_FOUND)).toBe(false);
    expect(canMove(CapaStage.RAISED, CapaStage.CLOSED)).toBe(false);
  });

  it('never goes backwards', () => {
    expect(canMove(CapaStage.ACTION_TAKEN, CapaStage.CONTAINED)).toBe(false);
  });

  it('lets anything open be abandoned', () => {
    expect(canMove(CapaStage.RAISED, CapaStage.ABANDONED)).toBe(true);
    expect(canMove(CapaStage.ACTION_TAKEN, CapaStage.ABANDONED)).toBe(true);
  });

  it('moves nothing once it is finished', () => {
    expect(canMove(CapaStage.CLOSED, CapaStage.ABANDONED)).toBe(false);
    expect(canMove(CapaStage.ABANDONED, CapaStage.RAISED)).toBe(false);
  });

  it('names what the next stage should have been when it refuses', () => {
    expect(() => requireMove('NC-2025-001', CapaStage.RAISED, CapaStage.CLOSED)).toThrow(
      /the next stage is CONTAINED and not CLOSED/,
    );
  });

  it('says so plainly on a finished record', () => {
    expect(() => requireMove('NC-2025-001', CapaStage.CLOSED, CapaStage.ABANDONED)).toThrow(
      InvalidTransitionError,
    );
    expect(() => requireMove('NC-2025-001', CapaStage.CLOSED, CapaStage.ABANDONED)).toThrow(
      /is finished/,
    );
  });

  it('allows the move it should', () => {
    expect(() =>
      requireMove('NC-2025-001', CapaStage.CAUSE_FOUND, CapaStage.ACTION_TAKEN),
    ).not.toThrow();
  });
});

describe('how far a record has to get before it can be closed', () => {
  it('lets a low one close once something was done about it', () => {
    expect(mayClose(CapaStage.ACTION_TAKEN, NonconformitySeverity.LOW)).toBe(true);
    expect(mayClose(CapaStage.CAUSE_FOUND, NonconformitySeverity.LOW)).toBe(false);
  });

  it('makes a high one prove the action worked', () => {
    expect(mayClose(CapaStage.ACTION_TAKEN, NonconformitySeverity.HIGH)).toBe(false);
    expect(mayClose(CapaStage.EFFECTIVENESS_CHECKED, NonconformitySeverity.HIGH)).toBe(true);
  });

  it('names the stage each severity has to reach', () => {
    expect(stageNeededToClose(NonconformitySeverity.LOW)).toBe(CapaStage.ACTION_TAKEN);
    expect(stageNeededToClose(NonconformitySeverity.MEDIUM)).toBe(CapaStage.ACTION_TAKEN);
    expect(stageNeededToClose(NonconformitySeverity.HIGH)).toBe(
      CapaStage.EFFECTIVENESS_CHECKED,
    );
  });

  it('treats the same stage as closeable for a lower severity but not a higher one', () => {
    expect(mayClose(CapaStage.ACTION_TAKEN, NonconformitySeverity.MEDIUM)).toBe(true);
    expect(mayClose(CapaStage.ACTION_TAKEN, NonconformitySeverity.HIGH)).toBe(false);
  });
});

describe('how long a severity buys', () => {
  it('gives a high severity ten days and a low one sixty', () => {
    expect(allowedDaysFor(NonconformitySeverity.HIGH)).toBe(10);
    expect(allowedDaysFor(NonconformitySeverity.MEDIUM)).toBe(30);
    expect(allowedDaysFor(NonconformitySeverity.LOW)).toBe(60);
  });
});

describe('how late a record is', () => {
  it('is negative while there is still time', () => {
    expect(latenessOf('2025-12-01', null, '2025-11-20')).toBe(-11);
  });

  it('is positive once the date has gone', () => {
    expect(latenessOf('2025-11-10', null, '2025-11-20')).toBe(10);
  });

  it('stops counting once the record closed', () => {
    expect(latenessOf('2025-11-10', '2025-11-12', '2026-06-01')).toBe(2);
  });

  it('is nothing at all when no date was set', () => {
    expect(latenessOf(null, null, '2025-11-20')).toBe(0);
  });
});

describe('escalation', () => {
  it('escalates a high severity record the day it goes late', () => {
    expect(
      needsEscalation(NonconformitySeverity.HIGH, CapaStage.RAISED, '2025-11-19', '2025-11-20'),
    ).toBe(true);
  });

  it('leaves a high severity record alone while there is time', () => {
    expect(
      needsEscalation(NonconformitySeverity.HIGH, CapaStage.RAISED, '2025-11-21', '2025-11-20'),
    ).toBe(false);
  });

  it('lets a low severity record run late before it escalates', () => {
    expect(
      needsEscalation(NonconformitySeverity.LOW, CapaStage.RAISED, '2025-11-10', '2025-11-20'),
    ).toBe(false);
    expect(
      needsEscalation(NonconformitySeverity.LOW, CapaStage.RAISED, '2025-08-01', '2025-11-20'),
    ).toBe(true);
  });

  it('escalates a medium record past twice its allowance', () => {
    expect(
      needsEscalation(NonconformitySeverity.MEDIUM, CapaStage.RAISED, '2025-10-10', '2025-11-20'),
    ).toBe(true);
    expect(
      needsEscalation(NonconformitySeverity.MEDIUM, CapaStage.RAISED, '2025-11-01', '2025-11-20'),
    ).toBe(false);
  });

  it('never escalates something that is finished', () => {
    expect(
      needsEscalation(NonconformitySeverity.HIGH, CapaStage.CLOSED, '2020-01-01', '2025-11-20'),
    ).toBe(false);
    expect(
      needsEscalation(NonconformitySeverity.HIGH, CapaStage.ABANDONED, '2020-01-01', '2025-11-20'),
    ).toBe(false);
  });

  it('never escalates something with no date on it', () => {
    expect(needsEscalation(NonconformitySeverity.HIGH, CapaStage.RAISED, null, '2025-11-20')).toBe(
      false,
    );
  });
});
