import { InstrumentDetail, InstrumentStatus, statusLabel } from '@core/models/instrument.model';

/**
 * Moving an instrument between states.
 *
 * <p>The service enforces which moves are legal. This exists so the console can
 * offer only the legal ones, say what each will do before it is done, and
 * insist on a reason for the two that a customer may later ask about.
 */

export interface StatusMove {
  readonly target: InstrumentStatus;
  readonly label: string;
  readonly effect: string;
  readonly needsReason: boolean;
  readonly severe: boolean;
}

const TRANSITIONS: Readonly<Record<InstrumentStatus, readonly InstrumentStatus[]>> = {
  IN_SERVICE: ['IN_CALIBRATION', 'QUARANTINED', 'UNDER_REPAIR', 'ON_LOAN', 'RETIRED'],
  IN_CALIBRATION: ['IN_SERVICE', 'QUARANTINED', 'UNDER_REPAIR', 'RETIRED'],
  QUARANTINED: ['UNDER_REPAIR', 'IN_CALIBRATION', 'RETIRED'],
  UNDER_REPAIR: ['IN_CALIBRATION', 'RETIRED'],
  ON_LOAN: ['IN_SERVICE', 'QUARANTINED'],
  RETIRED: [],
};

const EFFECTS: Readonly<Record<InstrumentStatus, string>> = {
  IN_SERVICE: 'It can be used to take readings again, and it stays on the recall board.',
  IN_CALIBRATION: 'It cannot be used while it is at calibration. Nothing else changes.',
  QUARANTINED:
    'It cannot be used, and it will not come back into service without going through calibration first.',
  UNDER_REPAIR:
    'It cannot be used, and it has to be recalibrated before it can come back, whatever the repair was.',
  ON_LOAN: 'It can still be used, but somebody else is holding it.',
  RETIRED:
    'This cannot be undone. The record stays for the audit trail, but the instrument leaves the register for good.',
};

/** The two a customer may later ask the laboratory to justify. */
const NEEDS_REASON: readonly InstrumentStatus[] = ['QUARANTINED', 'RETIRED'];

export function movesFrom(status: InstrumentStatus): readonly StatusMove[] {
  return TRANSITIONS[status].map((target) => ({
    target,
    label: statusLabel(target),
    effect: EFFECTS[target],
    needsReason: NEEDS_REASON.includes(target),
    severe: target === 'RETIRED' || target === 'QUARANTINED',
  }));
}

export function canMove(from: InstrumentStatus, to: InstrumentStatus): boolean {
  return from !== to && TRANSITIONS[from].includes(to);
}

export function moveTo(status: InstrumentStatus, target: InstrumentStatus): StatusMove | null {
  return movesFrom(status).find((move) => move.target === target) ?? null;
}

/** Why a move is not offered, for the cases people ask about. */
export function whyNot(from: InstrumentStatus, to: InstrumentStatus): string | null {
  if (canMove(from, to)) {
    return null;
  }
  if (from === to) {
    return `It is already ${statusLabel(to).toLowerCase()}.`;
  }
  if (from === 'RETIRED') {
    return 'A retired instrument cannot come back. Book the instrument in again as a new record.';
  }
  if (to === 'IN_SERVICE' && (from === 'QUARANTINED' || from === 'UNDER_REPAIR')) {
    return 'It has to go through calibration before it can be used again.';
  }
  return `${statusLabel(from)} cannot become ${statusLabel(to).toLowerCase()} directly.`;
}

export function reasonIsUsable(move: StatusMove, reason: string): boolean {
  if (!move.needsReason) {
    return true;
  }
  const trimmed = reason.trim();
  return trimmed.length >= 8 && trimmed.length <= 400;
}

/**
 * What the console shows before the move happens. The point is that somebody
 * reads a sentence about their instrument rather than the name of a state.
 */
export function confirmationFor(instrument: InstrumentDetail, move: StatusMove): string {
  const what = `${instrument.assetTag}, ${instrument.manufacturer} ${instrument.model}`;
  return `${what} will move from ${statusLabel(instrument.status).toLowerCase()} to ${move.label.toLowerCase()}. ${move.effect}`;
}
