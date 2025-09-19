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
