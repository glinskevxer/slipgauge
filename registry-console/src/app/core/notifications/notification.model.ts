export type NoticeTone = 'info' | 'success' | 'warning' | 'failure';

export interface Notice {
  readonly id: string;
  readonly tone: NoticeTone;
  readonly headline: string;
  readonly detail?: string;
  readonly raisedAt: number;
  /** Milliseconds before it clears itself. Zero means it stays until dismissed. */
  readonly dismissAfterMs: number;
  readonly action?: NoticeAction;
}

export interface NoticeAction {
  readonly label: string;
  readonly run: () => void;
}

const DEFAULT_LIFETIMES: Readonly<Record<NoticeTone, number>> = {
  info: 6000,
  success: 4000,
  warning: 10000,
  failure: 0,
};

let sequence = 0;

/**
 * Builds a notice. Failures never clear themselves: on a bench terminal the
 * operator is usually looking at the instrument rather than the screen, and a
 * failure that has already faded is a failure nobody acted on.
 */
export function notice(
  tone: NoticeTone,
  headline: string,
  detail?: string,
  action?: NoticeAction,
): Notice {
  sequence += 1;
  return {
    id: `n-${sequence}-${Date.now().toString(36)}`,
    tone,
    headline,
    detail,
    raisedAt: Date.now(),
    dismissAfterMs: DEFAULT_LIFETIMES[tone],
    action,
  };
}

export function toneIcon(tone: NoticeTone): string {
  switch (tone) {
    case 'success':
      return '✓';
    case 'warning':
      return '!';
    case 'failure':
      return '×';
    case 'info':
      return 'i';
  }
}

/**
 * True when two notices say the same thing closely enough that showing both
 * is noise. Saving six rows at once should not stack six identical banners.
 */
export function isDuplicateOf(candidate: Notice, existing: Notice): boolean {
  return (
    candidate.tone === existing.tone &&
    candidate.headline === existing.headline &&
    candidate.detail === existing.detail &&
    candidate.raisedAt - existing.raisedAt < 2000
  );
}
