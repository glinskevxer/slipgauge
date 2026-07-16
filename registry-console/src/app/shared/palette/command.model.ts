import { Role } from '@core/auth/session.model';

/**
 * The command palette.
 *
 * <p>Bench terminals have a keyboard and a trackball that nobody enjoys using.
 * Everything reachable through the navigation is reachable from here, plus the
 * few things that have no menu entry, and an asset tag typed straight in jumps
 * to that instrument.
 */

export type CommandKind = 'navigate' | 'action' | 'jump';

export interface Command {
  readonly id: string;
  readonly title: string;
  readonly hint?: string;
  readonly kind: CommandKind;
  readonly keywords?: readonly string[];
  /** Roles that may see it. Absent means everyone signed in. */
  readonly roles?: readonly Role[];
  readonly shortcut?: string;
  readonly route?: ReadonlyArray<string | number>;
}

export interface Match {
  readonly command: Command;
  readonly score: number;
  /** Indices of the title's characters that matched, for highlighting. */
  readonly hits: readonly number[];
}

/** Looks like an asset tag typed straight into the box. */
const ASSET_TAG = /^[A-Za-z]{2,4}-?\d{3,8}$/;

export function looksLikeAssetTag(term: string): boolean {
  return ASSET_TAG.test(term.trim());
}

export function normaliseAssetTag(term: string): string {
  const cleaned = term.trim().toUpperCase();
  if (cleaned.includes('-')) {
    return cleaned;
  }
  const split = cleaned.match(/^([A-Z]+)(\d+)$/);
  return split ? `${split[1]}-${split[2]}` : cleaned;
}

/**
 * Subsequence matching, weighted so a run of characters and a match at the
 * start of a word both count for more. Deliberately simple: the command list
 * is a couple of dozen entries, and anything cleverer surprises people.
 */
export function score(command: Command, term: string): Match | null {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return { command, score: 0, hits: [] };
  }

  const haystack = command.title.toLowerCase();
  const hits: number[] = [];
  let total = 0;
  let cursor = 0;
  let run = 0;

  for (const character of needle) {
    const found = haystack.indexOf(character, cursor);
    if (found === -1) {
      return keywordMatch(command, needle);
    }
    hits.push(found);
    run = found === cursor && cursor > 0 ? run + 1 : 0;
    total += 10 + run * 5;
    if (found === 0 || haystack[found - 1] === ' ') {
      total += 8;
    }
    cursor = found + 1;
  }

  // A short title matching the same characters is a better answer than a long one.
  total += Math.max(0, 24 - command.title.length);
  return { command, score: total, hits };
}

function keywordMatch(command: Command, needle: string): Match | null {
  const keywords = command.keywords ?? [];
  const hit = keywords.some((keyword) => keyword.toLowerCase().includes(needle));
  return hit ? { command, score: 5, hits: [] } : null;
}

export function search(
  commands: readonly Command[],
  term: string,
  roles: readonly Role[],
): readonly Match[] {
  return commands
    .filter((command) => allowed(command, roles))
    .map((command) => score(command, term))
    .filter((match): match is Match => match !== null)
    .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title));
}

export function allowed(command: Command, roles: readonly Role[]): boolean {
  if (!command.roles || command.roles.length === 0) {
    return true;
  }
  return command.roles.some((role) => roles.includes(role));
}

export const COMMANDS: readonly Command[] = [
  {
    id: 'overview',
    title: 'Overview',
    hint: 'What is coming and what is on fire',
    kind: 'navigate',
    route: ['/overview'],
    keywords: ['dashboard', 'home', 'start'],
    shortcut: 'g o',
  },
  {
    id: 'register',
    title: 'Instrument register',
    hint: 'Every instrument the laboratory holds',
    kind: 'navigate',
    route: ['/register'],
    keywords: ['instruments', 'assets', 'list'],
    shortcut: 'g r',
  },
  {
    id: 'book-in',
    title: 'Book an instrument in',
    kind: 'action',
    route: ['/register', 'new'],
    roles: ['TECHNICIAN', 'METROLOGIST', 'ADMIN'],
    keywords: ['new', 'goods inwards', 'receive'],
  },
  {
    id: 'new-sheet',
    title: 'Enter a calibration sheet',
    kind: 'action',
    route: ['/certificates', 'new'],
    roles: ['TECHNICIAN', 'METROLOGIST'],
    keywords: ['certificate', 'result', 'file'],
    shortcut: 'g c',
  },
  {
    id: 'recalls',
    title: 'Recall board',
    hint: 'What is due and what is late',
    kind: 'navigate',
    route: ['/recalls'],
    keywords: ['due', 'overdue', 'schedule'],
    shortcut: 'g d',
  },
  {
    id: 'capacity',
    title: 'Capacity',
    hint: 'Whether the benches can take it',
    kind: 'navigate',
    route: ['/recalls', 'capacity'],
    keywords: ['workload', 'weeks', 'levelling'],
  },
  {
    id: 'jobs',
    title: 'Job desk',
    hint: 'Customer work still in the building',
    kind: 'navigate',
    route: ['/jobs'],
    keywords: ['customer', 'booking', 'turnaround', 'late'],
    shortcut: 'g j',
  },
  {
    id: 'loans',
    title: 'Loan book',
    hint: 'What is out of the laboratory',
    kind: 'navigate',
    route: ['/loans'],
    keywords: ['borrowed', 'out', 'site', 'return', 'van'],
  },
  {
    id: 'rooms',
    title: 'Room log',
    hint: 'When a room was outside its band',
    kind: 'navigate',
    route: ['/rooms'],
    keywords: ['environment', 'temperature', 'humidity', 'excursion', 'logger'],
  },
  {
    id: 'nonconformities',
    title: 'Nonconformances',
    hint: 'What went wrong and what was done',
    kind: 'navigate',
    route: ['/nonconformities'],
    keywords: ['capa', 'corrective action', 'root cause', 'finding'],
    shortcut: 'g n',
  },
  {
    id: 'competence',
    title: 'Who is authorised',
    hint: 'Authorisations by person and discipline',
    kind: 'navigate',
    route: ['/competence'],
    roles: ['QUALITY_MANAGER', 'AUDITOR', 'ADMIN'],
    keywords: ['competence', 'training', 'signatory', 'approver'],
  },
  {
    id: 'management-review',
    title: 'Management review pack',
    hint: 'Every input clause 8.9.2 asks for',
    kind: 'navigate',
    route: ['/management-review'],
    roles: ['QUALITY_MANAGER', 'ADMIN'],
    keywords: ['annual', 'meeting', 'inputs', 'pack'],
  },
  {
    id: 'import',
    title: 'Import instruments',
    hint: 'Bring a spreadsheet in',
    kind: 'action',
    route: ['/admin', 'import'],
    roles: ['ADMIN'],
    keywords: ['bulk', 'csv', 'spreadsheet', 'upload'],
  },
  {
    id: 'impact',
    title: 'Impact assessments',
    kind: 'navigate',
    route: ['/impact'],
    keywords: ['out of tolerance', 'cascade', 'oot'],
    shortcut: 'g i',
  },
  {
    id: 'refusals',
    title: 'Refusals',
    hint: 'What the registry turned away',
    kind: 'navigate',
    route: ['/refusals'],
    roles: ['AUDITOR', 'QUALITY_MANAGER', 'ADMIN'],
    keywords: ['audit', 'denied', 'security'],
  },
  {
    id: 'classes',
    title: 'Calibration classes',
    kind: 'navigate',
    route: ['/admin', 'classes'],
    roles: ['ADMIN'],
    keywords: ['admin', 'intervals', 'regime'],
  },
  {
    id: 'locations',
    title: 'Site tree',
    kind: 'navigate',
    route: ['/admin', 'locations'],
    roles: ['ADMIN'],
    keywords: ['admin', 'rooms', 'places'],
  },
];
