# How the pieces fit

## The chain of rules

```
uncertainty budget ─► expanded uncertainty ─► test uncertainty ratio
                                                     │
                                                     ▼
     tolerance profile ─► permitted band ─────► guard band
                                                     │
                                                     ▼
                          reading ──────────────► verdict
                                                     │
                          ┌──────────────────────────┤
                          ▼                          ▼
                 interval engine              impact cascade
                          │                          │
                          ▼                          ▼
                     due date                 quarantine and
                                              withdrawn certificates
```

Every arrow is a rule that reads what the rule before it produced. Change the
uncertainty budget on a certificate and the verdict on an unchanged reading can
change with it, which is why the whole decision is recorded next to the number
rather than only the answer.

## Where each rule lives

| rule | where |
| --- | --- |
| permitted band from the maker specification | `calibration/tolerance-profile.entity.ts` |
| combining an uncertainty budget | `calibration/uncertainty/uncertainty-budget.ts` |
| guard band and verdict | `calibration/conformity/conformity-assessor.ts` |
| chain validation | `traceability/traceability.validator.ts` |
| interval from history | `interval/interval.engine.ts` |
| due dates and the recall board | `recall/recall.service.ts` |
| the cascade | `impact/impact.analyser.ts` |

Every one of them is reachable from a controller and none of them reaches back.
A rule that needed the request to work out its answer would be a rule that
could not be replayed, and replaying is what the register does.

## Why the interval engine replays

An incremental engine cannot undo a step it took on evidence that has since been
retracted. A certificate can be withdrawn years after it was issued, when a
standard it leaned on is found to have been out of tolerance, and the interval
that was in force after it has to change with it. Replaying the whole history is
cheap at this scale, and it is the only version that is correct.

## Why the cascade narrows as it descends

The instrument that failed is suspect from its last known good calibration. An
instrument it calibrated is only suspect from the day the bad standard touched
it, not from the day the standard itself went out. The window therefore narrows
at each hop, which is what stops the cascade catching the entire estate.

## The database

TypeORM migrations, forward only, one file per change, listed explicitly rather
than globbed. A glob resolves differently from source and from a built bundle,
and a migration that silently does not run is the worst failure the list could
have.

Nothing is edited after it has been released. The schema carries its own check
constraints rather than relying on the service: an interval where the floor
sits above the ceiling is refused by PostgreSQL as well as by the service,
because the register outlives any one version of it.

Primary keys are `serial` rather than `bigserial`. A laboratory calibrating one
instrument a second for seventy years would still not reach the ceiling, and a
bigint primary key arrives in JavaScript as a string, which is a class of bug
worth not having at all.

## Testing

- Domain rules are unit tested with no framework at all. The uncertainty
  budget, the conformity assessor and the interval engine are plain objects.
- Everything that touches the database is tested against a real PostgreSQL,
  unpacked by the test itself rather than supplied by a container runtime.
- The console is tested with Jest, and driven end to end by Playwright against a
  stubbed service, because those tests are about the console's own behaviour.
- The stack coming up for real is proved separately, in the images workflow.

## What arrived after the first release

The register started as the laboratory's own equipment and the certificates
against it. Everything below was added because an assessment asked for it, and
each one is written up here in the order it went in.

### Customer work (clause 7.1)

A **job** is a batch of items that arrived together and go back together. Its
lines are not register rows: an item becomes an instrument when the job is
accepted at contract review and not before, because an item declined at review
would otherwise sit in the register for ever with no owner and no history.

Contract review answers four questions in order, and the order matters. The
capability answer is judged against the requirements, the method against the
capability, and the decision rule only means anything once the method is fixed.
The checker decides what the laboratory can do; the reviewer decides only
whether the customer has agreed to the parts it cannot.

Completion is not a desk decision. A job may be marked finished when every
measurement line has an unwithdrawn certificate filed since the job arrived,
and the refusal names the lines that are missing.

### Who may sign (clause 6.2)

A role says somebody is a technician. It does not say they are authorised to
calibrate a torque wrench to four hundred newton metres, and those are separate
questions with separate answers for the same person.

An **authorisation** is granted for a discipline, optionally narrowed to one
class and one span, for a period, at one of three levels. Filing a sheet asks
the register whether the person who did the work was authorised on the day they
did it; approving one asks whether the approver may approve. Both refuse with
the reason, and the near miss is quoted rather than "nothing is held", because
being told an authorisation lapsed last month is useful and being told nothing
exists sends somebody to grant a duplicate.

### The rooms (clause 6.3)

An excursion is a **run of readings**, not a reading. One sample half a degree
over on a Tuesday afternoon is a door being held open; the same half degree for
six hours is a failed air conditioner and every certificate issued in that room
while it lasted is in question.

Severity is judged on duration and on magnitude, and the worse of the two wins:
duration catches the slow failures that never go far, magnitude catches the
sharp ones that are over in minutes, and a rule using only one would miss
whichever kind the laboratory had not had yet.

Anything above minor raises a nonconformance on its own and can pull the
certificates issued in that room while it lasted. Withdrawing them replays each
instrument's interval, so the recall dates move without anybody touching them.

### Nonconformances (clause 8.7)

Four answers close one: what was done to contain it, what caused it, what was
done about the cause, and whether that worked. Each stage writes its text and
its date together through a method that refuses one without the other, because
a stage with a date and no text is a tick in a box.

The severity decides how much closing costs. A low severity record closes once
something was done; a high severity one has to prove the action worked. That is
the composition the whole subsystem is built around: the severity is not a
label, it changes what the other stages are allowed to do.

### The schedule of accreditation (clause 7.8)

A boolean on the instrument class was wrong in both directions. A schedule is
granted per measurement, over a stated range, to a stated best measurement
capability, for a period: "MIC-EXT is accredited" is true to a hundred
millimetres and false at two hundred, and it stops being true on the day the
schedule lapses.

A certificate fixes its decision rule and its accreditation claim at the moment
it is filed, and never works either out again. Working them out on read would
quietly rewrite what an old certificate claimed the next time the schedule was
reissued.

### Interlaboratory comparison (clause 7.7)

Both the En number and the z score are computed, and the worse of the two
stands. A result that passes on z and fails on En is a laboratory whose value
is near enough but whose uncertainty claim is too small, which is exactly the
failure a scheme exists to find, and reporting the kinder of the two hides it.

An unsatisfactory En raises a high severity nonconformance and names the person
who made the measurement.

### The management review pack (clause 8.9)

Every input the clause lists, read out of the register rather than typed into a
spreadsheet. The pack raises its own talking points from the numbers, because a
pack whose talking points are typed carries whatever the person preparing it
already wanted to discuss, and the two or three they did not want to are the
ones the meeting exists for.
