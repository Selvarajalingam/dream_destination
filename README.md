# Dream Destination

A mobile-first Next.js progressive web app that takes a traveller from an
open-ended travel idea to a trusted, budget-aware, executable itinerary — and
keeps it working when the signal drops.

Built to `Dream_Destination_Complete_PRD.md`. Everything in this repository is
demonstration data for the Smart India Hackathon: no real bookings, payments or
personal records are involved.

## What is built

The PRD's required demonstration journey works end to end:

> Ask Dream AI → confirm the structured brief → compare destinations → inspect
> Dream Score → set the budget → generate and edit the itinerary → view map,
> crowd and trust information → save an offline trip pack → enter Trip Mode →
> discover or add a local business → access nearby help.

| Area | Screens |
|---|---|
| Traveller | T01 Home, T03 Dream AI, T04 Shortlist, T06 Destination, T08 Budget, T09 Itinerary and map, T10 Place, T11 Verification, T12 Local business, T14 Trips, T16–T17 Trip Mode, T18 Nearby help, T19 Story, T20 Rules, T21 Offline pack, T23 Profile |
| Administration | A01 Operations overview, A02 Review queue, A03 Verification workspace, A04 Crowd operations, A05 Content freshness, A06 Incident triage, A07 Local business review, A08 Impact analytics |

Out of scope for this build, and deferred deliberately: business owner screens
B01–B06, the booking provider integration behind T13, web push delivery, the
pgvector retrieval path for grounding, and the 50-prompt AI evaluation set from
PRD Part II §8.6.

The analytics events, their properties and what each one may never carry are
listed in [docs/analytics-data-dictionary.md](docs/analytics-data-dictionary.md).
A test keeps that document in step with the event catalogue. The A08 dashboard
opens on a simulated dataset that is labelled as such on every view.

## Running it

Requires Node 20+ and Docker.

```bash
cp .env.example .env
npm install
npm run setup     # starts Postgres and Redis, migrates, seeds
npm run dev
```

Then open <http://localhost:3000>.

`npm run setup` is the single command PRD Part II §19 asks for: it brings up
PostGIS and pgvector, applies the migrations, and seeds the Coimbatore and
Nilgiris demonstration catalog.

### No API keys are needed

The app runs fully without any third-party credentials:

| Dependency | Without a key | With one |
|---|---|---|
| Dream AI | Deterministic brief parser, labelled in the UI | `ANTHROPIC_API_KEY` uses Claude with structured output, falling back per call |
| Routing | Straight-line estimates, labelled as estimates | `OSRM_BASE_URL` uses real routing, falling back on failure |
| Cache | In-memory, single process | `REDIS_URL` uses Redis |
| Maps | OpenStreetMap tiles, no key required | — |

`GET /api/ready` reports which of these is in use.

## Verifying it

```bash
npm run verify    # typecheck, unit, integration, end-to-end
```

| Suite | Count | What it covers |
|---|---:|---|
| Unit | 249 | Dream Score, budget, crowd precedence and expiry, trip state, itinerary scheduling, conflicts, verification gating, brief parsing, tool allowlist, components, circuit breaker, dependency rule, operations urgency, freshness, incident rules and redaction, business review, event catalogue, fairness |
| Integration | 136 | Real PostGIS queries, seed volumes, object-level authorization, itinerary generation, shortlist persistence, incident suspension, re-verification without bulk approval, business and sponsorship decisions, analytics capture |
| End-to-end | 107 | The full demonstration journey, accessibility across sixteen pages, provider degradation, and the operations screens |

Integration and end-to-end tests need the database running. The integration
suite reseeds once before it starts, because several fixtures are relative to
the current time.

## How it is put together

A single Next.js application, partitioned internally along the PRD's module
boundaries so pieces can be extracted later without rework.

```text
src/
  modules/        domain rules and data access, one folder per PRD module
    */domain/     pure TypeScript: no framework, no driver, no I/O
  platform/       ai, maps, cache, db, resilience, observability adapters
  server/         sessions, CSRF, authorization, rate limits, problems
  components/     design system built on the PRD's tokens
  app/            routes: (traveler), (admin), api/v1
db/
  migrations/     forward-only SQL, transcribed from PRD Part II §6
  seed/           the Coimbatore and Nilgiris demonstration dataset
```

Three rules hold this together, and each is enforced by a test rather than
just documented:

1. **Trust-bearing logic is deterministic.** Dream Score, budget arithmetic,
   crowd banding, travel feasibility and verification gating are pure functions
   with no LLM involvement (PRD Part II §8.3). The model only extracts intent,
   asks one clarification and writes prose.
2. **Domain modules import nothing.** No Next.js, no database driver, no
   provider SDK, no `fetch`. `tests/unit/architecture` fails the build if that
   erodes.
3. **Providers sit behind interfaces.** AI, maps, weather and cache are
   adapters chosen at runtime, each with a working fallback, so no single
   outage takes the product down.

## Deliberate deviations from the PRD

Two, both recorded where they are made:

- **Status colours used as text.** PRD Part I §4.1 fixes the status palette and
  §11 requires WCAG 2.2 AA, but `status.warn` (#B77900) reaches only 3.67:1 as
  text on white where AA needs 4.5:1, and the others fall short on their own
  tinted surfaces. The PRD's governance rule — the safer behaviour takes
  precedence — settles it. The specified colours are kept for borders, icons
  and fills; darker variants at 5:1 or better are used for text. See
  `src/app/globals.css`.
- **Budget state.** A plan costing less than the declared budget is not
  reported as over budget merely because it uses part of a reserve the
  traveller set aside. The shortfall shows as a negative remaining balance
  instead. See `src/modules/budgets/domain/budget.ts`.

## Demonstrating it

`docs/demo-runbook.md` walks the journey step by step with the exact seeded
records to use, including the crowd override scenario, the offline
demonstration, and three failure modes worth showing on purpose.
