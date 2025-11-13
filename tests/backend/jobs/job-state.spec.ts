import { InvalidTransitionError, RuleViolationError } from '@registry/common/errors';
import { customer } from '@registry/jobs/customer.entity';
import { jobItem } from '@registry/jobs/job-item.entity';
import { daysBetween, job } from '@registry/jobs/job.entity';
import {
  ItemCondition,
  JobPriority,
  JobService,
  JobState,
  canMoveJob,
  jobIsClosed,
  jobIsOpen,
  jobTransitionsFrom,
  requireJobMove,
  turnaroundFor,
} from '@registry/jobs/job.enums';

describe('the job state machine', () => {
  it('walks a job from the receiving bench to the van', () => {
    const order = [
      JobState.RECEIVED,
      JobState.UNDER_REVIEW,
      JobState.ACCEPTED,
      JobState.IN_PROGRESS,
      JobState.COMPLETED,
      JobState.DISPATCHED,
    ];

    for (let i = 0; i < order.length - 1; i += 1) {
      expect(canMoveJob(order[i], order[i + 1])).toBe(true);
    }
  });

  it('refuses to skip contract review', () => {
    expect(canMoveJob(JobState.RECEIVED, JobState.ACCEPTED)).toBe(false);
    expect(canMoveJob(JobState.RECEIVED, JobState.IN_PROGRESS)).toBe(false);
  });

  it('never lets a job go backwards', () => {
    expect(canMoveJob(JobState.IN_PROGRESS, JobState.ACCEPTED)).toBe(false);
    expect(canMoveJob(JobState.COMPLETED, JobState.IN_PROGRESS)).toBe(false);
    expect(canMoveJob(JobState.DISPATCHED, JobState.COMPLETED)).toBe(false);
  });

  it('lets a job be declined right up until the bench starts', () => {
    expect(canMoveJob(JobState.RECEIVED, JobState.DECLINED)).toBe(true);
    expect(canMoveJob(JobState.UNDER_REVIEW, JobState.DECLINED)).toBe(true);
    expect(canMoveJob(JobState.ACCEPTED, JobState.DECLINED)).toBe(true);
    expect(canMoveJob(JobState.IN_PROGRESS, JobState.DECLINED)).toBe(false);
  });

  it('names what a job could move to when it refuses', () => {
    expect(() => requireJobMove('J-2025-0007', JobState.RECEIVED, JobState.COMPLETED)).toThrow(
      /only to UNDER_REVIEW, DECLINED/,
    );
  });

  it('says so plainly when the job is already there', () => {
    expect(() => requireJobMove('J-2025-0007', JobState.ACCEPTED, JobState.ACCEPTED)).toThrow(
      /already ACCEPTED/,
    );
  });

  it('explains that a finished job has nowhere left to go', () => {
    expect(() => requireJobMove('J-2025-0007', JobState.DISPATCHED, JobState.COMPLETED)).toThrow(
      /nothing, it is finished/,
    );
  });

  it('knows which states still have the items in the building', () => {
    expect(jobIsOpen(JobState.RECEIVED)).toBe(true);
    expect(jobIsOpen(JobState.IN_PROGRESS)).toBe(true);
    expect(jobIsOpen(JobState.COMPLETED)).toBe(false);
    expect(jobIsClosed(JobState.DISPATCHED)).toBe(true);
    expect(jobIsClosed(JobState.DECLINED)).toBe(true);
    expect(jobIsClosed(JobState.COMPLETED)).toBe(false);
  });

  it('leaves the terminal states with no moves at all', () => {
    expect(jobTransitionsFrom(JobState.DISPATCHED)).toHaveLength(0);
    expect(jobTransitionsFrom(JobState.DECLINED)).toHaveLength(0);
  });
});

describe('turnaround', () => {
  it('gives a same day job no days at all', () => {
    expect(turnaroundFor(JobPriority.SAME_DAY, 10)).toBe(0);
  });

  it('cuts a priority job to a third, rounded up', () => {
    expect(turnaroundFor(JobPriority.PRIORITY, 10)).toBe(4);
    expect(turnaroundFor(JobPriority.PRIORITY, 9)).toBe(3);
  });

  it('never quotes less than a day on a priority job', () => {
    expect(turnaroundFor(JobPriority.PRIORITY, 1)).toBe(1);
    expect(turnaroundFor(JobPriority.PRIORITY, 2)).toBe(1);
  });

  it('leaves a standard job on the customer default', () => {
    expect(turnaroundFor(JobPriority.STANDARD, 15)).toBe(15);
  });
});

describe('a job', () => {
  const acme = customer('ACME', 'Acme Pressings');

  function received(): ReturnType<typeof job> {
    return job('J-2025-0142', acme, '2025-11-03', 'h.whitcombe');
  }

  it('starts on the receiving bench promised for the day it arrived', () => {
    const booked = received();

    expect(booked.state).toBe(JobState.RECEIVED);
    expect(booked.promisedOn).toBe('2025-11-03');
    expect(booked.isOpen()).toBe(true);
  });

  it('stamps the completion date as it completes', () => {
    const booked = received();

    booked.moveTo(JobState.UNDER_REVIEW, '2025-11-03');
    booked.moveTo(JobState.ACCEPTED, '2025-11-04');
    booked.moveTo(JobState.IN_PROGRESS, '2025-11-05');
    booked.moveTo(JobState.COMPLETED, '2025-11-12');

    expect(booked.completedOn).toBe('2025-11-12');
    expect(booked.dispatchedOn).toBeNull();

    booked.moveTo(JobState.DISPATCHED, '2025-11-13');
    expect(booked.dispatchedOn).toBe('2025-11-13');
  });

  it('refuses a promise date earlier than the arrival', () => {
    expect(() => received().promise('2025-11-01')).toThrow(RuleViolationError);
  });

  it('refuses a move the table does not allow', () => {
    expect(() => received().moveTo(JobState.DISPATCHED, '2025-11-04')).toThrow(
      InvalidTransitionError,
    );
  });

  it('measures lateness against the promise while it is open', () => {
    const booked = received();
    booked.promise('2025-11-14');

    expect(booked.latenessOn('2025-11-10')).toBe(-4);
    expect(booked.isLateOn('2025-11-10')).toBe(false);
    expect(booked.latenessOn('2025-11-17')).toBe(3);
    expect(booked.isLateOn('2025-11-17')).toBe(true);
  });

  it('stops the lateness clock once the work is finished', () => {
    const booked = received();
    booked.promise('2025-11-14');
    booked.moveTo(JobState.UNDER_REVIEW, '2025-11-03');
    booked.moveTo(JobState.ACCEPTED, '2025-11-04');
    booked.moveTo(JobState.IN_PROGRESS, '2025-11-05');
    booked.moveTo(JobState.COMPLETED, '2025-11-16');

    expect(booked.latenessOn('2026-03-01')).toBe(2);
  });

  it('counts only the lines the bench can work on', () => {
    const booked = received();
    booked.items = [
      jobItem(1, JobService.CALIBRATION, 'external micrometer 0-25'),
      jobItem(2, JobService.REPAIR, 'vernier with a bent jaw'),
      jobItem(3, JobService.VERIFICATION, 'ring gauge 20mm'),
      jobItem(4, JobService.CALIBRATION, 'dial gauge').arrivedIn(ItemCondition.DAMAGED, null),
    ];

    expect(booked.workableItems().map((item) => item.lineNumber)).toEqual([1, 3]);
  });

  it('reads back the way the desk says it out loud', () => {
    const booked = received();
    booked.items = [jobItem(1, JobService.CALIBRATION, 'micrometer')];

    expect(booked.describe()).toBe('J-2025-0142, 1 item for Acme Pressings');

    booked.items.push(jobItem(2, JobService.CALIBRATION, 'caliper'));
    expect(booked.describe()).toBe('J-2025-0142, 2 items for Acme Pressings');
  });
});

describe('a job line', () => {
  it('numbers from one', () => {
    expect(() => jobItem(0, JobService.CALIBRATION, 'micrometer')).toThrow(RuleViolationError);
  });

  it('is only calibratable when it is serviceable and that is what was asked for', () => {
    expect(jobItem(1, JobService.CALIBRATION, 'micrometer').isCalibratable()).toBe(true);
    expect(jobItem(1, JobService.VERIFICATION, 'ring gauge').isCalibratable()).toBe(true);
    expect(jobItem(1, JobService.REPAIR, 'vernier').isCalibratable()).toBe(false);
    expect(
      jobItem(1, JobService.CALIBRATION, 'micrometer')
        .arrivedIn(ItemCondition.CONTAMINATED, null)
        .isCalibratable(),
    ).toBe(false);
  });

  it('needs a class, a make, a model and a serial before it can be registered', () => {
    const line = jobItem(1, JobService.CALIBRATION, 'micrometer');
    expect(line.isIdentified()).toBe(false);

    line.identifiedAs('Mitutoyo', '103-137', '81104321');
    expect(line.isIdentified()).toBe(false);

    line.instrumentClass = { id: 4, code: 'MIC-EXT' } as never;
    expect(line.isIdentified()).toBe(true);
  });

  it('reads out with whatever identification it has', () => {
    const bare = jobItem(1, JobService.CALIBRATION, 'external micrometer 0-25');
    expect(bare.describe()).toBe('external micrometer 0-25');

    bare.identifiedAs('Mitutoyo', '103-137', '81104321');
    expect(bare.describe()).toBe('external micrometer 0-25, Mitutoyo 103-137, s/n 81104321');
  });

  it('refuses to be pointed at a second register row', () => {
    const line = jobItem(1, JobService.CALIBRATION, 'micrometer');
    line.registeredAs({ id: 12, assetTag: 'SG-0012' } as never);

    expect(() => line.registeredAs({ id: 13, assetTag: 'SG-0013' } as never)).toThrow(
      /already registered as SG-0012/,
    );
    expect(line.registeredAs({ id: 12, assetTag: 'SG-0012' } as never).instrumentId).toBeUndefined();
  });
});

describe('a customer', () => {
  it('takes a tidied code and name', () => {
    const record = customer(' acme ', '  Acme Pressings  ');

    expect(record.code).toBe('ACME');
    expect(record.name).toBe('Acme Pressings');
    expect(record.active).toBe(true);
  });

  it('refuses a turnaround nobody could work to', () => {
    const record = customer('ACME', 'Acme Pressings');

    expect(() => record.quoting(0)).toThrow(RuleViolationError);
    expect(() => record.quoting(200)).toThrow(RuleViolationError);
    expect(record.quoting(15).turnaroundDays).toBe(15);
  });

  it('is closed rather than deleted, and can come back', () => {
    const record = customer('ACME', 'Acme Pressings');

    record.close();
    expect(record.active).toBe(false);
    record.reopen();
    expect(record.active).toBe(true);
  });

  it('is reachable on either a phone number or an address', () => {
    const record = customer('ACME', 'Acme Pressings');
    expect(record.isReachable()).toBe(false);

    record.contactedBy('J Fenwick', null, '01279 000000');
    expect(record.isReachable()).toBe(true);

    record.contactedBy('J Fenwick', 'quality@acme.example', null);
    expect(record.isReachable()).toBe(true);
  });

  it('reads with the code beside the name', () => {
    expect(customer('ACME', 'Acme Pressings').describe()).toBe('Acme Pressings (ACME)');
  });
});

describe('counting days', () => {
  it('counts inclusive of neither end', () => {
    expect(daysBetween('2025-11-03', '2025-11-10')).toBe(7);
    expect(daysBetween('2025-11-10', '2025-11-03')).toBe(-7);
    expect(daysBetween('2025-11-03', '2025-11-03')).toBe(0);
  });

  it('carries across a month and a leap day', () => {
    expect(daysBetween('2025-12-28', '2026-01-04')).toBe(7);
    expect(daysBetween('2024-02-27', '2024-03-01')).toBe(3);
  });
});
