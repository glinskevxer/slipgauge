import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The two things clause 7.8 makes a certificate say for itself.
 *
 * <p>The decision rule was used to work the verdicts out and then thrown away.
 * A certificate that states conformity without saying under which rule is a
 * certificate nobody can check, and the register held the rule for exactly as
 * long as it took to compute a guard band.
 *
 * <p>Accreditation is the second. Whether a measurement is inside the schedule
 * is a fact about the day it was made, over the range it covered, and it has to
 * be fixed on the certificate at that moment. Working it out again next year
 * against a schedule that has since changed would rewrite history.
 */
export class CertificateStatements1736000000021 implements MigrationInterface {
  name = 'CertificateStatements1736000000021';

  public async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      alter table calibration_certificate
        add column acceptance_policy varchar(24),
        add column accredited        boolean not null default false,
        add column scope_ref         varchar(64),
        add column decision_rule     varchar(600)
    `);

    await runner.query(`
      alter table calibration_certificate
        add constraint ck_certificate_policy
          check (acceptance_policy is null
                 or acceptance_policy in ('SHARED_RISK', 'STRINGENT', 'MANAGED_RISK'))
    `);

    // A certificate that claims the mark has to name the schedule line it was
    // claimed under, or the claim cannot be checked.
    await runner.query(`
      alter table calibration_certificate
        add constraint ck_certificate_accredited
          check (not accredited or scope_ref is not null)
    `);

    // Everything already filed was worked out under the default rule, which is
    // what the laboratory quotes and what the guard bands on those certificates
    // were actually computed with.
    await runner.query(`
      update calibration_certificate
         set acceptance_policy = 'MANAGED_RISK',
             decision_rule = 'Conformity stated under a managed risk decision rule. ' ||
               'The acceptance limit is pulled in by a guard band that narrows as the ' ||
               'test uncertainty ratio improves.'
       where acceptance_policy is null
    `);

    await runner.query(`
      create index ix_certificate_accredited on calibration_certificate (issued_on)
        where accredited
    `);
  }

  public async down(runner: QueryRunner): Promise<void> {
    await runner.query(`drop index ix_certificate_accredited`);
    await runner.query(`
      alter table calibration_certificate
        drop constraint ck_certificate_accredited,
        drop constraint ck_certificate_policy,
        drop column decision_rule,
        drop column scope_ref,
        drop column accredited,
        drop column acceptance_policy
    `);
  }
}
