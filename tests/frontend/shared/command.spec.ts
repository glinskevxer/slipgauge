import { Role } from '@core/auth/session.model';
import {
  COMMANDS,
  Command,
  allowed,
  looksLikeAssetTag,
  normaliseAssetTag,
  score,
  search,
} from '@shared/palette/command.model';

const EVERYONE: readonly Role[] = ['TECHNICIAN'];
const ADMIN: readonly Role[] = ['ADMIN'];

function command(id: string, title: string, extra: Partial<Command> = {}): Command {
  return { id, title, kind: 'navigate', ...extra };
}

describe('recognising an asset tag', () => {
  it('accepts the shape the laboratory issues', () => {
    expect(looksLikeAssetTag('SG-000101')).toBe(true);
    expect(looksLikeAssetTag('sg-000101')).toBe(true);
    expect(looksLikeAssetTag('SG000101')).toBe(true);
  });

  it('refuses a search phrase', () => {
    expect(looksLikeAssetTag('micrometer')).toBe(false);
    expect(looksLikeAssetTag('recall board')).toBe(false);
    expect(looksLikeAssetTag('123')).toBe(false);
  });

  it('puts the hyphen back when somebody leaves it out', () => {
    expect(normaliseAssetTag('sg000101')).toBe('SG-000101');
    expect(normaliseAssetTag('SG-000101')).toBe('SG-000101');
    expect(normaliseAssetTag(' sg-000101 ')).toBe('SG-000101');
  });
});

describe('scoring a command', () => {
  it('matches every command when nothing is typed', () => {
    expect(score(command('a', 'Recall board'), '')?.score).toBe(0);
  });

  it('matches characters in order, not just presence', () => {
    expect(score(command('a', 'Recall board'), 'rec')).not.toBeNull();
    expect(score(command('a', 'Recall board'), 'crb')).toBeNull();
  });

  it('rewards a run of characters over scattered ones', () => {
    const run = score(command('a', 'Recall board'), 'reca')!.score;
    const scattered = score(command('b', 'Recall board'), 'rlbd')!.score;

    expect(run).toBeGreaterThan(scattered);
  });

  it('rewards a match at the start of a word', () => {
    const atStart = score(command('a', 'Recall board'), 'b')!.score;
    const inside = score(command('b', 'Recall board'), 'l')!.score;

    expect(atStart).toBeGreaterThan(inside);
  });

  it('prefers a short title over a long one for the same letters', () => {
    const short = score(command('a', 'Capacity'), 'cap')!.score;
    const long = score(command('b', 'Calibration classes and profiles'), 'cap')!.score;

    expect(short).toBeGreaterThan(long);
  });

  it('records which characters matched so they can be highlighted', () => {
    expect(score(command('a', 'Recall board'), 'rb')?.hits).toEqual([0, 7]);
  });

  it('falls back to the keywords when the title does not match', () => {
    const withKeyword = command('a', 'Impact assessments', { keywords: ['out of tolerance'] });

    expect(score(withKeyword, 'tolerance')?.score).toBe(5);
    expect(score(command('b', 'Impact assessments'), 'tolerance')).toBeNull();
  });
});

describe('searching the command list', () => {
  it('hides what a role may not see', () => {
    expect(allowed(command('a', 'Anything'), EVERYONE)).toBe(true);
    expect(allowed(command('b', 'Admin', { roles: ['ADMIN'] }), EVERYONE)).toBe(false);
    expect(allowed(command('b', 'Admin', { roles: ['ADMIN'] }), ADMIN)).toBe(true);
  });

  it('keeps the administration entries out of a technician list', () => {
    const titles = search(COMMANDS, '', EVERYONE).map((match) => match.command.title);

    expect(titles).not.toContain('Site tree');
    expect(titles).toContain('Instrument register');
  });

  it('shows them to an administrator', () => {
    expect(search(COMMANDS, 'site', ADMIN).map((match) => match.command.id)).toContain(
      'locations',
    );
  });

  it('puts the best match first', () => {
    expect(search(COMMANDS, 'recall', EVERYONE)[0].command.id).toBe('recalls');
    expect(search(COMMANDS, 'capacity', EVERYONE)[0].command.id).toBe('capacity');
  });

  it('finds a command through a word nobody put in the title', () => {
    expect(search(COMMANDS, 'overdue', EVERYONE)[0].command.id).toBe('recalls');
  });

  it('returns nothing rather than everything for a term that matches nothing', () => {
    expect(search(COMMANDS, 'zzzzqqq', EVERYONE)).toEqual([]);
  });

  it('breaks a tie on the title so the order never wobbles', () => {
    const first = search(COMMANDS, '', EVERYONE).map((match) => match.command.title);
    const again = search(COMMANDS, '', EVERYONE).map((match) => match.command.title);

    expect(first).toEqual(again);
  });
});
