import { DataSource } from 'typeorm';

import { CompetenceLevel } from '@registry/competence/competence-level';
import { Competence, competence } from '@registry/competence/competence.entity';
import { ALL_DISCIPLINES, Discipline } from '@registry/instrument/instrument.enums';

/**
 * Authorisations for the people the suites file certificates as.
 *
 * <p>Filing a sheet now asks the authorisation register whether the person who
 * did the work was allowed to, which is the point of the register. A suite
 * about traceability or intervals is not about that rule, so it grants the
 * blanket authorisation here rather than describing one per discipline.
 *
 * <p>Granted through the real entity. A suite that inserted rows would not go
 * through the span and period checks, and the first thing a broken check would
 * do is make every one of these suites pass on data the service would refuse.
 */
export class CompetenceFixtures {
  constructor(private readonly dataSource: DataSource) {}

  /** Authorised to perform, across every discipline, with no end date. */
  async authorise(person: string, from = '2000-01-01'): Promise<void> {
    await this.grantAll(person, CompetenceLevel.AUTHORISED, from);
  }

  /** Authorised to approve somebody else's work, which implies performing it. */
  async authoriseApprover(person: string, from = '2000-01-01'): Promise<void> {
    await this.grantAll(person, CompetenceLevel.APPROVER, from);
  }

  /** One discipline only, for a suite whose subject is the refusal. */
  async grant(
    person: string,
    discipline: Discipline,
    level: CompetenceLevel,
    from = '2000-01-01',
    to: string | null = null,
  ): Promise<Competence> {
    const record = competence(person, discipline, level, 'suite.fixtures', from).running(from, to);

    return this.dataSource.getRepository(Competence).save(record);
  }

  private async grantAll(person: string, level: CompetenceLevel, from: string): Promise<void> {
    for (const discipline of ALL_DISCIPLINES) {
      await this.grant(person, discipline, level, from);
    }
  }
}
