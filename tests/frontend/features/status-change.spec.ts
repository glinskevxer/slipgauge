import { detail } from '@fixtures';
import { InstrumentStatus } from '@core/models/instrument.model';
import {
  canMove,
  confirmationFor,
  moveTo,
  movesFrom,
  reasonIsUsable,
  whyNot,
} from '@features/instrument/status/status-change.model';

describe('which moves are offered', () => {
  it('offers everything from in service', () => {
    expect(movesFrom('IN_SERVICE').map((move) => move.target)).toEqual([
      'IN_CALIBRATION',
      'QUARANTINED',
      'UNDER_REPAIR',
      'ON_LOAN',
      'RETIRED',
    ]);
  });

  it('offers nothing at all from retired', () => {
    expect(movesFrom('RETIRED')).toEqual([]);
  });

  it('will not send a quarantined instrument straight back into service', () => {
    expect(movesFrom('QUARANTINED').map((move) => move.target)).not.toContain('IN_SERVICE');
    expect(canMove('QUARANTINED', 'IN_SERVICE')).toBe(false);
    expect(canMove('QUARANTINED', 'IN_CALIBRATION')).toBe(true);
  });

  it('refuses a move to the state it is already in', () => {
    expect(canMove('IN_SERVICE', 'IN_SERVICE')).toBe(false);
  });

  it('finds one move by its target', () => {
    expect(moveTo('IN_SERVICE', 'RETIRED')?.label).toBe('Retired');
    expect(moveTo('RETIRED', 'IN_SERVICE')).toBeNull();
  });
});

describe('what each move does', () => {
  it('says that retiring cannot be undone', () => {
    expect(moveTo('IN_SERVICE', 'RETIRED')?.effect).toContain('cannot be undone');
  });

  it('says that a quarantined instrument goes through calibration first', () => {
    expect(moveTo('IN_SERVICE', 'QUARANTINED')?.effect).toContain('calibration first');
  });

  it('marks the two severe moves as severe', () => {
    expect(moveTo('IN_SERVICE', 'RETIRED')?.severe).toBe(true);
    expect(moveTo('IN_SERVICE', 'QUARANTINED')?.severe).toBe(true);
    expect(moveTo('IN_SERVICE', 'ON_LOAN')?.severe).toBe(false);
  });

  it('asks for a reason only where a customer may later ask for one', () => {
    expect(moveTo('IN_SERVICE', 'RETIRED')?.needsReason).toBe(true);
    expect(moveTo('IN_SERVICE', 'QUARANTINED')?.needsReason).toBe(true);
    expect(moveTo('IN_SERVICE', 'IN_CALIBRATION')?.needsReason).toBe(false);
  });
});

describe('explaining a move that is not offered', () => {
  it('says nothing about a move that is fine', () => {
    expect(whyNot('IN_SERVICE', 'QUARANTINED')).toBeNull();
  });

  it('says so plainly when it is already there', () => {
    expect(whyNot('IN_SERVICE', 'IN_SERVICE')).toBe('It is already in service.');
  });

  it('explains that a retired record does not come back', () => {
    expect(whyNot('RETIRED', 'IN_SERVICE')).toContain('book the instrument in again'.slice(5));
  });

  it('explains the calibration step out of quarantine and repair', () => {
    expect(whyNot('QUARANTINED', 'IN_SERVICE')).toContain('through calibration');
    expect(whyNot('UNDER_REPAIR', 'IN_SERVICE')).toContain('through calibration');
  });

  it('falls back to naming both states', () => {
    expect(whyNot('ON_LOAN', 'RETIRED')).toBe('On loan cannot become retired directly.');
  });
});

describe('the reason', () => {
  const retiring = moveTo('IN_SERVICE', 'RETIRED')!;
  const lending = moveTo('IN_SERVICE', 'ON_LOAN')!;

  it('is not needed for an ordinary move', () => {
    expect(reasonIsUsable(lending, '')).toBe(true);
  });

  it('has to say something', () => {
    expect(reasonIsUsable(retiring, '')).toBe(false);
    expect(reasonIsUsable(retiring, 'broken')).toBe(false);
    expect(reasonIsUsable(retiring, 'dropped and the anvil is chipped')).toBe(true);
  });

  it('will not take more than the column holds', () => {
    expect(reasonIsUsable(retiring, 'x'.repeat(400))).toBe(true);
    expect(reasonIsUsable(retiring, 'x'.repeat(401))).toBe(false);
  });
});

describe('the confirmation', () => {
  it('names the instrument rather than the state', () => {
    const sentence = confirmationFor(
      detail('SG-000101'),
      moveTo('IN_SERVICE', 'QUARANTINED')!,
    );

    expect(sentence).toContain('SG-000101, Mitutoyo 103-137');
    expect(sentence).toContain('from in service to quarantined');
    expect(sentence).toContain('calibration first');
  });

  it('works from whatever state the instrument is actually in', () => {
    const sentence = confirmationFor(
      detail('SG-000101', { status: 'ON_LOAN' as InstrumentStatus }),
      moveTo('ON_LOAN', 'IN_SERVICE')!,
    );

    expect(sentence).toContain('from on loan to in service');
  });
});
