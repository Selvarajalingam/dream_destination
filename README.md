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
| Business owner | B01 Onboarding start, B02 Details with autosave, B03 Verification evidence, B04 Listing preview, B05 Dashboard, B06 Updates, in English and Tamil |
| Administration | A01 Operations overview, A02 Review queue, A03 Verification workspace, A04 Crowd operations, A05 Content freshness, A06 Incident triage, A07 Local business review, A08 Impact analytics |

Out of scope for this build, and deferred deliberately: the booking provider
integration behind T13, web push delivery, the pgvector retrieval path for
grounding, and the 50-prompt AI evaluation set from PRD Part II §8.6.

The Tamil copy for the owner screens was written for this build and needs a
native speaker's review before a pilot. Server messages, such as validation
errors, are still English. Owner uploads are stored in `UPLOAD_DIR`, a local
directory outside `public/`; a pilot deployment would put an object store
behind the same interface in `src/platform/storage`.

Sign-in has one page per audience: `/login` for travellers, `/business/login`
for business owners and `/admin/login` for operations staff. Each accepts only
its own kind of account and points anyone else to the right page. Passwords are
stored as scrypt hashes, five wrong attempts lock an account for fifteen
minutes, and every sign-in starts a fresh session. Outside production each page
lists its demonstration accounts:

| Page | Email | Password |
|---|---|---|
| `/login` | traveller@demo.dreamdestination.invalid | Traveller@2026 |
| `/business/login` | owner.kitchen@demo.dreamdestination.invalid | Owner@2026 |
| `/business/login` | owner.tea@demo.dreamdestination.invalid | Owner@2026 |
| `/admin/login` | admin@demo.dreamdestination.invalid | Admin@2026 |
| `/admin/login` | verifier@demo.dreamdestination.invalid | Verifier@2026 |

There is no self-service registration or password reset yet; the pilot's
identity provider is still an open decision (PRD Part II §20).

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
| Unit | 312 | Dream Score, budget, crowd precedence and expiry, trip state, itinerary scheduling, conflicts, verification gating, brief parsing, tool allowlist, components, circuit breaker, dependency rule, operations urgency, freshness, incident rules and redaction, business review, event catalogue, fairness, owner listing rules, upload checks, owner dashboard, slot finding for an added stop, sign-in portals and password hashing |
| Integration | 161 | Real PostGIS queries, seed volumes, object-level authorization, itinerary generation, shortlist persistence, incident suspension, re-verification without bulk approval, business and sponsorship decisions, analytics capture, the owner flow from draft to approval and change review, adding a stop to a plan, item changes scoped to their trip, sign-in refusals and lockout |
| End-to-end | 145 | The full demonstration journey, accessibility across the traveller, operations and owner screens, provider degradation, file access rules, adding a business to a plan with undo, and the three sign-in pages |

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
  app/            routes: (traveler), (business), (admin), api/v1
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
