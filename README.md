# Slipgauge calibration registry

The register of measuring equipment for a UKAS accredited calibration
laboratory: what the laboratory holds, when each item was last calibrated, what
it was measured against, when it falls due again, and what has to be chased
when something comes back out of tolerance.

It is a working system rather than a demonstration of one. The rules it
enforces are the ones an ISO/IEC 17025 assessment asks about, and they are
written down here because the laboratory is audited on them.

## The chain the whole thing hangs off

Nothing here is a lookup table. Each rule decides what the next one is allowed
to measure:

1. **The uncertainty budget** combines its components by root sum square, works
   the effective degrees of freedom out with Welch-Satterthwaite, and reads the
   coverage factor off a Student t table rather than fixing it at two.
2. **The expanded uncertainty** and the tolerance give the **test uncertainty
   ratio**.
3. **The ratio** fixes the **guard band** under whichever acceptance policy the
   certificate was issued under.
4. **The guard band** decides the **verdict**, which is not the same question as
   whether the reading was inside tolerance.
5. **The verdicts across the history** decide the **calibration interval**, and
   the drift measured on those same results decides whether an earned extension
   is actually allowed.
6. **The interval** fixes the **recall date**.
7. An **out of tolerance result** walks forward through every job the instrument
   touched and every certificate it signed off, narrowing the suspect window at
   each hop.

Change a budget and the verdict on an unchanged reading can change with it.
Withdraw a certificate and the interval that followed it is worked out again.
That is the point of the design, and it is why the interval engine replays the
whole history rather than nudging a number along.

## Laid out

```
registry-service/    the api, NestJS on TypeScript, PostgreSQL behind it
registry-console/    the operator console, Angular standalone components
tests/backend/       unit and integration tests for the service
tests/frontend/      jest suite for the console
tests/e2e/           playwright, driving a real browser against stubbed routes
ops/                 nginx and postgres configuration the images use
scripts/             check.sh runs what CI runs, dev-up.sh brings it all up
docs/                how it fits together
```

Every test in the repository lives under `tests/`, on purpose. A test tree that
mirrors the source tree tends to grow a test per class, and that is not the same
thing as covering the rules.

## Running it

You need Node 20.11.1 or newer. You do not need a database installed: the
integration tests unpack the PostgreSQL binaries that ship with
`embedded-postgres` and run the real migrations against them.

```
npm ci                # both sides
./scripts/dev-up.sh   # database, service and console, with a demo laboratory
```

That prints where everything is listening. Sign in as `h.whitcombe` with
`demo-password-not-for-real-use`.

Piecemeal:

```
make service      # the api on 8080
make console      # the console on 4200, api proxied
make test         # every test in the repository
make verify       # exactly what CI runs, in the order CI runs it
```

## Configuration

Everything is read from the environment and checked at boot. Two of them have
no default at all, because a service that starts with a shipped signing key is
a service somebody will deploy with a shipped signing key.

| variable | what it is |
| --- | --- |
| `REGISTRY_DB_URL` | `postgres://host:port/database`, credentials separate |
| `REGISTRY_DB_USER` / `REGISTRY_DB_PASSWORD` | kept out of the URL so a secret store can hold them |
| `REGISTRY_JWT_SECRET` | **no default**, at least 32 characters |
| `REGISTRY_ALLOWED_ORIGINS` | named origins only, never a wildcard |
| `REGISTRY_INTERVAL_*` | the four numbers the interval procedure fixes |
| `LAB_NAME`, `LAB_ACCREDITATION_REF` | printed on certificates |
| `REGISTRY_DEMO_ESTATE` | `true` loads a demo laboratory into an empty register |

## What is deliberately not here

- **No editing a certificate.** A mistake is corrected by withdrawing it and
  filing a replacement that points back at it. An assessment has to be able to
  see both.
- **No tolerance limits from the bench.** The limits come from the profile the
  instrument's class is held to. Accepting a typed limit would make the profile
  advisory.
- **No verdict from the bench either.** It is worked out here, from the reading
  and the budget, and recorded with both.
- **No open route by default.** The guard denies unless a route says otherwise,
  so a new endpoint added without a thought about access is closed rather than
  open.

## Licence

Private to the laboratory. Not for redistribution.
