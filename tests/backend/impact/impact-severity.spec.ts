import { calibrationCertificate } from '@registry/calibration/calibration-certificate.entity';
import { Instrument } from '@registry/instrument/instrument.entity';
import { impactAssessment } from '@registry/impact/impact-assessment.entity';
import { impactItem } from '@registry/impact/impact-item.entity';
import {
  ImpactDisposition,
  ImpactKind,
  ImpactSeverity,
  ImpactStatus,
  isSettled,
  needsCustomerContact,
  severityFrom,
} from '@registry/impact/impact-severity';

function instrument(assetTag = 'SG-000042'): Instrument {
  const item = new Instrument();

  item.id = 42;
  item.assetTag = assetTag;
  item.unit = 'mm';
  return item;
}

function trigger() {
  return calibrationCertificate(
    'CAL-2025-0100',
    instrument(),
    '2025-02-11',
    '2025-02-11',
    'R Okonjo',
    'Slipgauge Metrology',
  );
}

function assessment(from = '2024-02-11', to = '2025-02-11') {
  return impactAssessment(trigger(), instrument(), from, to);
}

function usage(depth = 0, occurredOn = '2024-06-01') {
  return impactItem(ImpactKind.USAGE, depth + 1, 'SG-000042', 'a job', occurredOn, depth);
}

describe('how bad a failure is judged to be', () => {
  it('is nothing at all when the cascade caught nothing', () => {
    expect(severityFrom(0, 0, 0)).toBe(ImpactSeverity.NONE);
  });

  it('is low for a handful of jobs and no propagation', () => {
    expect(severityFrom(1, 0, 0)).toBe(ImpactSeverity.LOW);
    expect(severityFrom(8, 0, 0)).toBe(ImpactSeverity.LOW);
  });

  it('steps up to medium once more than eight jobs are caught', () => {
    expect(severityFrom(9, 0, 0)).toBe(ImpactSeverity.MEDIUM);
  });

  it('steps up to medium as soon as the error reached anything downstream', () => {
    expect(severityFrom(1, 1, 0)).toBe(ImpactSeverity.MEDIUM);
  });

  it('is high once the cascade went two hops or hit another standard', () => {
    expect(severityFrom(1, 2, 0)).toBe(ImpactSeverity.HIGH);
    expect(severityFrom(1, 0, 1)).toBe(ImpactSeverity.HIGH);
    expect(severityFrom(41, 0, 0)).toBe(ImpactSeverity.HIGH);
  });

  it('lets a hit standard outrank a small job count', () => {
    expect(severityFrom(2, 0, 1)).toBe(ImpactSeverity.HIGH);
  });

  it('says who has to ring the customer', () => {
    expect(needsCustomerContact(ImpactSeverity.NONE)).toBe(false);
    expect(needsCustomerContact(ImpactSeverity.LOW)).toBe(false);
    expect(needsCustomerContact(ImpactSeverity.MEDIUM)).toBe(true);
    expect(needsCustomerContact(ImpactSeverity.HIGH)).toBe(true);
  });
});

describe('an impact item', () => {
  it('starts pending and unsettled', () => {
    const item = usage();

    expect(item.disposition).toBe(ImpactDisposition.PENDING);
    expect(item.settled()).toBe(false);
    expect(isSettled(ImpactDisposition.PENDING)).toBe(false);
  });

  it('refuses any disposition other than pending without a note', () => {
    expect(() => usage().dispose(ImpactDisposition.NO_EFFECT, '  ')).toThrow('needs a note');
    expect(() => usage().dispose(ImpactDisposition.RECALLED, null)).toThrow('needs a note');
  });

  it('settles once somebody has said what they did about it', () => {
    const item = usage();

    item.dispose(ImpactDisposition.NO_EFFECT, 'error is a tenth of the job tolerance');

    expect(item.settled()).toBe(true);
    expect(item.note).toBe('error is a tenth of the job tolerance');
  });

  it('describes itself with the asset tag when it has one', () => {
    expect(usage().describe()).toBe('SG-000042: a job');
    expect(
      impactItem(ImpactKind.CERTIFICATE, 7, null, 'CAL-2025-0100', '2025-01-01', 1).describe(),
    ).toBe('CAL-2025-0100');
  });
});

describe('an impact assessment', () => {
  it('refuses a suspect window that runs backwards', () => {
    expect(() => assessment('2025-02-11', '2024-02-11')).toThrow('runs backwards');
  });

  it('starts open with nothing counted', () => {
    const raised = assessment();

    expect(raised.status).toBe(ImpactStatus.OPEN);
    expect(raised.severity).toBe(ImpactSeverity.NONE);
    expect(raised.isOpen()).toBe(true);
  });

  it('counts and grades itself once the walk has finished', () => {
    const raised = assessment();

    raised.add(usage(0));
    raised.add(impactItem(ImpactKind.CERTIFICATE, 9, 'SG-000007', 'CAL-1', '2024-08-01', 1));
    raised.settle(0);

    expect(raised.itemCount).toBe(2);
    expect(raised.maxDepth).toBe(1);
    expect(raised.severity).toBe(ImpactSeverity.MEDIUM);
    expect(raised.status).toBe(ImpactStatus.ASSESSED);
  });

  it('sorts items shallowest first and then by when they happened', () => {
    const raised = assessment();

    raised.add(impactItem(ImpactKind.CERTIFICATE, 2, null, 'deep', '2024-03-01', 2));
    raised.add(usage(0, '2024-09-01'));
    raised.add(usage(0, '2024-04-01'));

    expect(raised.orderedItems().map((item) => item.occurredOn)).toEqual([
      '2024-04-01',
      '2024-09-01',
      '2024-03-01',
    ]);
  });

  it('will not close while a single line is still pending', () => {
    const raised = assessment();

    raised.add(usage());
    raised.settle(0);

    expect(raised.pendingCount()).toBe(1);
    expect(() => raised.close('Q Manager', 'all jobs reworked', new Date())).toThrow(
      'every item has to be disposed of',
    );
  });

  it('closes once every line is disposed of and a conclusion is given', () => {
    const raised = assessment();
    const item = usage();

    raised.add(item);
    raised.settle(0);
    item.dispose(ImpactDisposition.REWORKED, 'part remeasured on the CMM');
    raised.close('Q Manager', 'all affected jobs reworked, no customer impact', new Date());

    expect(raised.status).toBe(ImpactStatus.CLOSED);
    expect(raised.isOpen()).toBe(false);
    expect(raised.pendingCount()).toBe(0);
  });

  it('refuses to close with no conclusion, and refuses to close twice', () => {
    const raised = assessment();

    raised.settle(0);

    expect(() => raised.close('Q Manager', '   ', new Date())).toThrow('needs a conclusion');

    raised.close('Q Manager', 'nothing was caught', new Date());

    expect(() => raised.close('Q Manager', 'again', new Date())).toThrow('already closed');
  });
});
