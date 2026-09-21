# Dream Destination P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Next.js PWA that carries a traveler through the PRD's required SIH demonstration journey — Dream AI → trip brief → destination shortlist → Dream Score → budget → itinerary + map → crowd/trust → offline pack → Trip Mode → local business → nearby help — backed by a production-shaped PostGIS/pgvector schema and seeded demo data.

**Architecture:** A single Next.js 15 App Router application in TypeScript, internally partitioned into the PRD's domain modules (`src/modules/*`) and platform adapters (`src/platform/*`). Domain modules are pure TypeScript with no Next.js or provider-SDK imports; application services depend on interfaces, and infrastructure supplies implementations, so the AI, map, and weather providers are replaceable. All trust-bearing computation — Dream Score, budget arithmetic, crowd banding, verification gating, travel feasibility — lives in deterministic, unit-tested domain code. The LLM only extracts intent, asks clarifications, and writes prose.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript 5, Tailwind CSS v4, PostgreSQL 16 + PostGIS 3.4 + pgvector, Redis 7, `postgres` (postgres.js), Zod, Leaflet + OpenStreetMap, `@anthropic-ai/sdk`, `web-push`, Vitest, Playwright, Docker Compose.

**Spec:** `Dream_Destination_Complete_PRD.md` (Parts I, II and III). Every task below cites the PRD sections it implements. When this plan and the PRD disagree, the PRD wins; per PRD §6 of the governance section, when two requirements conflict the safer and more transparent behavior takes precedence.

## Global Constraints

These apply to every task. They are copied from the PRD and are not restated per task.

- **Scope:** P0 demo journey only. Traveler screens T01–T22 plus admin A02/A03/A04. Business screens B01–B06, admin A01/A05–A08, booking provider integration (T13 beyond deep-link stub), and Dream Vault are out of scope for this plan.
- **Currency:** stored in **minor units** (paise) as `BIGINT`. Never store rupees as floats. Display formats to `₹` with `Intl.NumberFormat('en-IN')`.
- **Timestamps:** ISO 8601 in UTC in storage and API; rendered in user locale.
- **Determinism:** Dream Score, budget totals, travel-time feasibility, place verification status, crowd freshness and override precedence, rule applicability, booking confirmation state, and authorization are computed in application code — **never** by the LLM (PRD Part II §8.3).
- **Seeded data:** every seeded row carries `source_type = 'seeded_demo'` on its source record, and the UI labels it. Seeded records must never be presented as real pilot outcomes (PRD Part II §17).
- **Crowd:** expired crowd data returns `unknown`. Never render stale crowd, weather, price or rule data as current. Never use the phrase "live crowd"; use "Crowd status updated N minutes ago" (PRD Part I §12.2).
- **Never color alone:** every crowd and safety state carries an icon *and* a text label (PRD Part I §2 principle 9, §11).
- **Dream Verified:** the badge renders only for an `approved`, unexpired `hidden_gem_verifications` row. Known limitations render *before* the visit action (PRD Part I §5.4, T11).
- **Dream Score label:** display as "Trip match", never "Safety score" (PRD Part I §5.2).
- **Accessibility:** WCAG 2.2 AA. Body text ≥16px mobile, metadata ≥14px, touch targets ≥44×44 CSS px, visible keyboard focus, semantic landmarks, polite live regions for AI generation and budget changes, map pins have list-view equivalents, 200% zoom without content loss, `prefers-reduced-motion` respected (PRD Part I §4.2, §11).
- **Design tokens:** exact hex values from PRD Part I §4.1. `brand.deep #17324D`, `brand.primary #0F766E`, `brand.primary-hover #0B5F59`, `brand.saffron #F28C28`, `surface.base #FFFFFF`, `surface.warm #FFF8EF`, `surface.subtle #F5F7F8`, `text.primary #17202A`, `text.secondary #5F6B76`, `border.subtle #DDE4E8`, `status.good #14804A`, `status.warn #B77900`, `status.danger #C9362B`, `status.unknown #667085`.
- **Geometry:** base spacing 4px; mobile page padding 16px, tablet 24px, desktop max 1200px with 32px gutters; card radius 16px, bottom sheet 24px top, input radius 12px; section gap 32px mobile / 48px desktop.
- **Motion:** standard 180ms, large surface 240ms, drag settle 120ms, budget value animation ≤300ms.
- **Every screen** implements the six global states from PRD Part I §9: loading (skeletons matching layout, never fake percentages), empty (reason + one action), error (what failed / what still works / what to do, preserving entered data), offline, stale, permission-denied.
- **Dependency rule:** files under `src/modules/*/domain/` may import only from `src/modules/*/domain/`, `src/shared/`, and standard library. They must not import `next/*`, `postgres`, `@anthropic-ai/sdk`, `react`, or any provider SDK. Task 24 enforces this with a test.
- **Commits:** conventional-commit prefixes (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Commit at the end of every task.

---

## File Structure

```text
docker-compose.yml               # postgres+postgis+pgvector, redis
.env.example                     # documented env contract
next.config.ts
tsconfig.json
vitest.config.ts
playwright.config.ts
package.json

db/
  migrations/
    0001_extensions_and_enums.sql
    0002_identity_and_consent.sql
    0003_preference_memory.sql
    0004_sources_and_catalog.sql
    0005_trips_and_itinerary.sql
    0006_budget.sql
    0007_crowd.sql
    0008_verification.sql
    0009_local_businesses.sql
    0010_rules_stories_retrieval.sql
    0011_help_notifications_incidents_audit.sql
    0012_recommendation_scores.sql
    0013_sessions_and_offline_packs.sql
  migrate.ts                     # forward-only runner, schema_migrations table
  seed/
    index.ts                     # orchestrator
    sources.ts destinations.ts places.ts businesses.ts
    help.ts rules.ts stories.ts crowd.ts verifications.ts users.ts

public/
  sw.js                          # hand-written service worker
  manifest.webmanifest
  icons/

src/
  shared/                        # framework-free primitives usable anywhere
    money.ts time.ts geo.ts result.ts id.ts errors.ts
  modules/
    identity/     domain/ service.ts repository.ts
    preferences/  domain/ service.ts repository.ts
    catalog/      domain/ service.ts repository.ts
    trips/        domain/ service.ts repository.ts
    budgets/      domain/ service.ts repository.ts
    recommendations/ domain/ service.ts repository.ts
    crowd/        domain/ service.ts repository.ts
    verification/ domain/ service.ts repository.ts
    businesses/   domain/ service.ts repository.ts
    rules/        domain/ service.ts repository.ts
    help/         domain/ service.ts repository.ts
    offline/      domain/ service.ts repository.ts
    incidents/    domain/ service.ts repository.ts
    analytics/    service.ts repository.ts
  platform/
    db/ client.ts sql.ts
    cache/ index.ts memory.ts redis.ts
    ai/ gateway.ts anthropic.ts deterministic.ts prompts.ts tools.ts schemas.ts
    maps/ index.ts osrm.ts haversine.ts
    weather/ index.ts seeded.ts
    observability/ logger.ts request-id.ts
  server/
    session.ts csrf.ts authorize.ts rate-limit.ts problem.ts handler.ts
  components/
    ui/           # primitives: Button, Card, Sheet, Chip, Skeleton, ...
    patterns/     # PRD §5 components: DreamScore, CrowdStatus, BudgetMeter, ...
    states/       # LoadingState, EmptyState, ErrorState, OfflineBanner, StaleNote
  app/
    (traveler)/   # T01–T23
    (admin)/      # A02–A04
    api/v1/       # route handlers
    layout.tsx globals.css

tests/
  unit/           # vitest, mirrors src/modules/*/domain
  integration/    # vitest against a real test database
  e2e/            # playwright demo journey
```

---

### Task 1: Project scaffold, tokens, and the running shell

Produces a Next.js app that boots, renders the design system, and passes a smoke test.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.env.example`, `.gitignore`, `docker-compose.yml`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/shared/money.ts`, `src/shared/time.ts`, `src/shared/geo.ts`, `src/shared/result.ts`
- Test: `tests/unit/shared/money.test.ts`, `tests/unit/shared/geo.test.ts`

**Interfaces:**
- Produces: `formatInr(minor: number): string`, `rupeesToMinor(rupees: number): number`, `minorToRupees(minor: number): number`, `sumMinor(values: number[]): number`
- Produces: `haversineMeters(a: LatLng, b: LatLng): number` where `type LatLng = { lat: number; lng: number }`
- Produces: `type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }`, `ok(v)`, `err(e)`

- [ ] **Step 1: Write the failing money and geo tests**

```ts
// tests/unit/shared/money.test.ts
import { describe, expect, it } from 'vitest';
import { formatInr, rupeesToMinor, minorToRupees, sumMinor } from '@/shared/money';

describe('money', () => {
  it('converts rupees to integer minor units without float drift', () => {
    expect(rupeesToMinor(25000)).toBe(2500000);
    expect(rupeesToMinor(1234.56)).toBe(123456);
    expect(rupeesToMinor(0.1 + 0.2)).toBe(30);
  });

  it('formats minor units as Indian rupees', () => {
    expect(formatInr(2500000)).toBe('₹25,000');
    expect(formatInr(123456)).toBe('₹1,234.56');
  });

  it('sums minor units exactly', () => {
    expect(sumMinor([100, 250, 33])).toBe(383);
    expect(sumMinor([])).toBe(0);
  });

  it('round-trips through rupees', () => {
    expect(minorToRupees(2500000)).toBe(25000);
  });
});
```

```ts
// tests/unit/shared/geo.test.ts
import { describe, expect, it } from 'vitest';
import { haversineMeters } from '@/shared/geo';

describe('haversineMeters', () => {
  it('returns zero for identical points', () => {
    const p = { lat: 11.0168, lng: 76.9558 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it('measures Coimbatore to Ooty within 2% of the great-circle distance', () => {
    const coimbatore = { lat: 11.0168, lng: 76.9558 };
    const ooty = { lat: 11.4102, lng: 76.695 };
    const meters = haversineMeters(coimbatore, ooty);
    expect(meters).toBeGreaterThan(48_000);
    expect(meters).toBeLessThan(52_000);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test:unit -- shared`
Expected: FAIL — cannot resolve `@/shared/money`.

- [ ] **Step 3: Scaffold the project and implement the shared primitives**

Create `package.json` with scripts:

```json
{
  "name": "dream-destination",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test:unit": "vitest run --dir tests/unit",
    "test:integration": "vitest run --dir tests/integration",
    "test:e2e": "playwright test",
    "db:up": "docker compose up -d",
    "db:migrate": "tsx db/migrate.ts",
    "db:seed": "tsx db/seed/index.ts",
    "db:reset": "tsx db/migrate.ts --reset && tsx db/seed/index.ts",
    "setup": "npm run db:up && npm run db:migrate && npm run db:seed"
  }
}
```

Dependencies: `next@15`, `react@19`, `react-dom@19`, `postgres`, `zod`, `ioredis`, `leaflet`, `react-leaflet`, `@anthropic-ai/sdk`, `web-push`, `idb`, `clsx`.
Dev dependencies: `typescript`, `@types/node`, `@types/react`, `@types/leaflet`, `vitest`, `@vitejs/plugin-react`, `@playwright/test`, `tsx`, `tailwindcss@4`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`.

`tsconfig.json` sets `"paths": { "@/*": ["./src/*"] }`, `"strict": true`, `"moduleResolution": "bundler"`.

```ts
// src/shared/money.ts
/** All monetary values are integers in minor units (paise). PRD Part II §7.1. */
export function rupeesToMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

export function minorToRupees(minor: number): number {
  return minor / 100;
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

const WHOLE = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const FRACTION = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });

export function formatInr(minor: number): string {
  const formatter = minor % 100 === 0 ? WHOLE : FRACTION;
  return formatter.format(minorToRupees(minor)).replace(/ /g, '');
}

/** "₹12,000–₹18,000", or a single value when low and high match. */
export function formatInrRange(lowMinor: number, highMinor: number): string {
  return lowMinor === highMinor ? formatInr(lowMinor) : `${formatInr(lowMinor)}–${formatInr(highMinor)}`;
}
```

```ts
// src/shared/geo.ts
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

`src/app/globals.css` declares the PRD tokens as CSS custom properties and maps them into Tailwind v4's `@theme`:

```css
@import 'tailwindcss';

@theme {
  --color-brand-deep: #17324D;
  --color-brand-primary: #0F766E;
  --color-brand-primary-hover: #0B5F59;
  --color-brand-saffron: #F28C28;
  --color-surface-base: #FFFFFF;
  --color-surface-warm: #FFF8EF;
  --color-surface-subtle: #F5F7F8;
  --color-text-primary: #17202A;
  --color-text-secondary: #5F6B76;
  --color-border-subtle: #DDE4E8;
  --color-status-good: #14804A;
  --color-status-warn: #B77900;
  --color-status-danger: #C9362B;
  --color-status-unknown: #667085;
  --radius-card: 16px;
  --radius-sheet: 24px;
  --radius-input: 12px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

`docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_USER: dream
      POSTGRES_PASSWORD: dream
      POSTGRES_DB: dream_destination
    ports: ['5432:5432']
    volumes:
      - dream_pgdata:/var/lib/postgresql/data
      - ./db/docker-init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dream -d dream_destination']
      interval: 5s
      retries: 20
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
volumes:
  dream_pgdata:
```

Note: `postgis/postgis:16-3.4` does not ship pgvector. Add `db/docker-init/00-pgvector.sh` that installs it, or switch the image to a variant that bundles both; verify `CREATE EXTENSION vector` succeeds in Task 2 Step 2 before proceeding.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test:unit -- shared`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the app boots**

Run: `npm run dev` and load `http://localhost:3000`.
Expected: the shell renders with Manrope loaded and tokens applied.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js app, design tokens, and shared primitives"
```

---

### Task 2: Database schema, migration runner, and connection layer

Transcribes PRD Part II §6 verbatim into forward-only SQL migrations.

**Files:**
- Create: `db/migrations/0001_extensions_and_enums.sql` … `0013_sessions_and_offline_packs.sql`
- Create: `db/migrate.ts`
- Create: `src/platform/db/client.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces: `sql` — a configured `postgres.js` tagged-template client exported from `src/platform/db/client.ts`
- Produces: `withTransaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>`

- [ ] **Step 1: Write the failing schema test**

```ts
// tests/integration/schema.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';

afterAll(async () => { await sql.end(); });

describe('schema', () => {
  it('has postgis, vector, pgcrypto and citext installed', async () => {
    const rows = await sql<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    const names = rows.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(['postgis', 'vector', 'pgcrypto', 'citext']));
  });

  it('allows only one approved verification per place', async () => {
    const indexes = await sql<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'one_active_hidden_verification_idx'`;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain("status = 'approved'");
  });

  it('rejects a crowd override that expires before it starts', async () => {
    await expect(sql`
      INSERT INTO crowd_overrides (place_id, band, reason, starts_at, expires_at, created_by)
      SELECT p.id, 'heavy', 'test', now() + interval '2 hours', now(), u.id
      FROM places p, users u LIMIT 1`).rejects.toThrow();
  });

  it('stores destination centers as geography points with a GIST index', async () => {
    const [row] = await sql<{ udt: string }[]>`
      SELECT udt_name AS udt FROM information_schema.columns
      WHERE table_name = 'destinations' AND column_name = 'center'`;
    expect(row.udt).toBe('geography');
    const idx = await sql`SELECT 1 FROM pg_indexes WHERE indexname = 'destinations_geo_idx'`;
    expect(idx).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Bring up the database and run the test to verify it fails**

Run: `npm run db:up && npm run test:integration -- schema`
Expected: FAIL — relation "pg_extension" query returns no `vector`, and the tables do not exist.

- [ ] **Step 3: Write the migrations and the runner**

`0001_extensions_and_enums.sql` through `0011_help_notifications_incidents_audit.sql` are transcribed **exactly** from PRD Part II §6.1–§6.11, in that order, with no changes to column names, types, constraints, or index names. `0012_recommendation_scores.sql` is PRD Part II §9.3.

`0013_sessions_and_offline_packs.sql` adds the two tables the PRD implies but does not spell out:

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  csrf_secret TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (is_guest OR user_id IS NOT NULL)
);

CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at DESC);

CREATE TABLE offline_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  manifest JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, version)
);

ALTER TABLE trips ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
```

`trips.version` exists because PRD Part II §7.1 requires version numbers for concurrent itinerary edits and §11.3 requires version-based conflict resolution.

```ts
// db/migrate.ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const DIR = path.join(process.cwd(), 'db', 'migrations');

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
  if (process.argv.includes('--reset')) {
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const applied = new Set(
    (await sql<{ filename: string }[]>`SELECT filename FROM schema_migrations`).map((r) => r.filename),
  );
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(path.join(DIR, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`applied ${file}`);
  }
  await sql.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
```

```ts
// src/platform/db/client.ts
import postgres, { type Sql } from 'postgres';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const sql = postgres(connectionString, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  idle_timeout: 20,
  transform: { undefined: null },
  onnotice: () => {},
});

export function withTransaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}
```

- [ ] **Step 4: Migrate and run the test to verify it passes**

Run: `npm run db:migrate && npm run test:integration -- schema`
Expected: PASS, 4 tests. The crowd-override test requires at least one `places` and one `users` row; if the seed has not run yet, insert a throwaway pair inside the test's `beforeAll` and roll them back.

- [ ] **Step 5: Commit**

```bash
git add db src/platform/db tests/integration
git commit -m "feat: add PostGIS/pgvector schema, migration runner, and db client"
```

---

### Task 3: Seed the Coimbatore–Nilgiris demo dataset

**Files:**
- Create: `db/seed/index.ts`, `db/seed/sources.ts`, `db/seed/users.ts`, `db/seed/destinations.ts`, `db/seed/places.ts`, `db/seed/businesses.ts`, `db/seed/help.ts`, `db/seed/rules.ts`, `db/seed/stories.ts`, `db/seed/crowd.ts`, `db/seed/verifications.ts`
- Test: `tests/integration/seed.test.ts`

**Interfaces:**
- Produces: `seed(): Promise<void>` — idempotent; re-running truncates the seeded rows and reinserts them.

The PRD (Part II §17) fixes the volumes: 25–50 attractions, 10–20 approved hidden gems, 30–50 local businesses, 10–20 help facilities, ≥15 sourced rules, historical crowd patterns, one simulated live observation stream, one manual override scenario, and sandbox-labelled hotel/transport options.

- [ ] **Step 1: Write the failing seed test**

```ts
// tests/integration/seed.test.ts
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';

afterAll(async () => { await sql.end(); });

describe('seed data', () => {
  it('meets the PRD demo-data volumes', async () => {
    const [{ count: places }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM places WHERE status = 'active'`;
    expect(Number(places)).toBeGreaterThanOrEqual(25);

    const [{ count: gems }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM hidden_gem_verifications WHERE status = 'approved'`;
    expect(Number(gems)).toBeGreaterThanOrEqual(10);

    const [{ count: businesses }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM local_businesses WHERE status = 'active'`;
    expect(Number(businesses)).toBeGreaterThanOrEqual(30);

    const [{ count: facilities }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM help_facilities WHERE status = 'active'`;
    expect(Number(facilities)).toBeGreaterThanOrEqual(10);

    const [{ count: rules }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM rule_content WHERE status = 'active'`;
    expect(Number(rules)).toBeGreaterThanOrEqual(15);
  });

  it('labels every seeded source as seeded_demo', async () => {
    const [{ count }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM source_records WHERE source_type <> 'seeded_demo'`;
    expect(Number(count)).toBe(0);
  });

  it('includes an active manual crowd override scenario', async () => {
    const rows = await sql`SELECT 1 FROM crowd_overrides WHERE expires_at > now()`;
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent', async () => {
    const { seed } = await import('../../db/seed/index');
    const before = await sql<{ count: string }[]>`SELECT count(*) FROM places`;
    await seed();
    const after = await sql<{ count: string }[]>`SELECT count(*) FROM places`;
    expect(after[0].count).toBe(before[0].count);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration -- seed`
Expected: FAIL — counts are 0.

- [ ] **Step 3: Write the seed modules**

`db/seed/sources.ts` creates one `source_records` row per authority used, all with `source_type = 'seeded_demo'` and an `issuing_authority` naming the real-world body the demo stands in for (for example "Tamil Nadu Forest Department (demonstration record)"), plus `verified_at` and `review_due_at` so the freshness UI has real dates to render.

`db/seed/destinations.ts` creates four destinations spanning the pilot geography so the shortlist has genuine trade-offs:

```ts
export const DESTINATIONS = [
  {
    slug: 'ooty-nilgiris',
    name: 'Ooty and the Nilgiris',
    stateCode: 'TN', district: 'The Nilgiris',
    center: { lat: 11.4102, lng: 76.695 },
    themes: ['nature', 'heritage', 'hill_station', 'tea'],
    minimumDays: 2, maximumDays: 5,
    baseCostLowInr: 9000, baseCostHighInr: 22000,
    summary: 'Tea estates, colonial-era hill town and high-altitude gardens, 3 hours from Coimbatore.',
  },
  {
    slug: 'coonoor-valley',
    name: 'Coonoor Valley',
    stateCode: 'TN', district: 'The Nilgiris',
    center: { lat: 11.3530, lng: 76.7959 },
    themes: ['nature', 'tea', 'quiet', 'local_food'],
    minimumDays: 2, maximumDays: 4,
    baseCostLowInr: 7500, baseCostHighInr: 17000,
    summary: 'Quieter Nilgiris base with working tea factories and shorter walking trails.',
  },
  {
    slug: 'valparai-anamalai',
    name: 'Valparai and Anamalai',
    stateCode: 'TN', district: 'Coimbatore',
    center: { lat: 10.3270, lng: 76.9540 },
    themes: ['nature', 'wildlife', 'quiet', 'trekking'],
    minimumDays: 2, maximumDays: 4,
    baseCostLowInr: 8000, baseCostHighInr: 19000,
    summary: 'Rainforest plateau with wildlife corridors, limited mobile coverage and strict forest rules.',
  },
  {
    slug: 'coimbatore-city',
    name: 'Coimbatore City and Surrounds',
    stateCode: 'TN', district: 'Coimbatore',
    center: { lat: 11.0168, lng: 76.9558 },
    themes: ['heritage', 'local_food', 'temples', 'accessible'],
    minimumDays: 1, maximumDays: 3,
    baseCostLowInr: 5000, baseCostHighInr: 14000,
    summary: 'Temple heritage, textile history and accessible day trips with strong medical access.',
  },
] as const;
```

`db/seed/places.ts` creates ≥32 places across those destinations, each with real coordinates, `operating_hours` as a seven-day JSON map, `expected_visit_minutes`, `price_low_inr`/`price_high_inr`, an `accessibility` JSON object (`{ wheelchairAccessible, stepFreeEntry, accessibleToilet, lowWalking }`), and `is_hidden_gem` on 14 of them. Every place gets `place_sources` rows tying each trust-bearing field scope (`hours`, `price`, `access`) to a source record.

`db/seed/verifications.ts` approves 12 of the 14 hidden gems with a populated `checklist` covering the nine PRD T11 content groups (access and road conditions, mobile/network availability, operating/daylight guidance, weather/season limits, emergency access, nearest medical facility, capacity/environmental limits, photography/permit/cultural rules, reviewer type), `known_limitations` text, `reviewed_at`, and `expires_at` six months out. It leaves one in `under_review` and one `expired` so screens A02/A03 and the expiry rule have real material.

`db/seed/crowd.ts` writes, for each of the 12 highest-traffic places, a 7×24 historical occupancy matrix into `crowd_forecasts` for the next 14 days, a rolling stream of `crowd_observations` for three places (the "simulated live observation stream", refreshed by `npm run db:seed`), and one active `crowd_overrides` row on Ooty Botanical Garden with reason "Local festival procession, heavy footfall expected".

`db/seed/index.ts` runs the modules in dependency order inside one transaction, deleting seeded rows first so the script is idempotent.

- [ ] **Step 4: Run the seed and the test to verify it passes**

Run: `npm run db:seed && npm run test:integration -- seed`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add db/seed tests/integration/seed.test.ts
git commit -m "feat: seed Coimbatore-Nilgiris demo catalog, crowd, verification and rules data"
```

---

### Task 4: Dream Score domain

The PRD's central explainability claim. Pure functions, no I/O.

**Files:**
- Create: `src/modules/recommendations/domain/dream-score.ts`
- Create: `src/modules/recommendations/domain/types.ts`
- Test: `tests/unit/recommendations/dream-score.test.ts`

**Interfaces:**
- Produces:

```ts
export const DREAM_SCORE_WEIGHTS = {
  interestMatch: 0.25,
  budgetMatch: 0.20,
  timeDistanceFit: 0.15,
  crowdComfort: 0.15,
  seasonWeatherFit: 0.10,
  accessibilityFit: 0.10,
  localExperienceFit: 0.05,
} as const;

export type DreamScoreDimension = keyof typeof DREAM_SCORE_WEIGHTS;

export type DreamScoreResult = {
  total: number;                                   // 0–100, two decimals
  components: Record<DreamScoreDimension, number>; // each 0–100
  weights: Record<DreamScoreDimension, number>;
  missingDimensions: DreamScoreDimension[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];        // plain language, strongest first
  tradeOff: string | null;  // the weakest dimension, phrased as a limitation
  algorithmVersion: string; // 'dream-score-1.0.0'
};

export function computeDreamScore(input: DreamScoreInput): DreamScoreResult;
```

- [ ] **Step 1: Write the failing Dream Score tests**

```ts
// tests/unit/recommendations/dream-score.test.ts
import { describe, expect, it } from 'vitest';
import { computeDreamScore, DREAM_SCORE_WEIGHTS } from '@/modules/recommendations/domain/dream-score';
import type { DreamScoreInput } from '@/modules/recommendations/domain/types';

const baseInput: DreamScoreInput = {
  brief: {
    interests: ['nature', 'heritage'],
    budgetTotalMinor: 2_500_000,
    durationDays: 4,
    crowdTolerance: 'low',
    pace: 'relaxed',
    party: { type: 'family', adults: 3, children: 1 },
    constraints: { lowWalking: true, medicalAccessRequired: true },
    travelMonth: 12,
    origin: { lat: 11.0168, lng: 76.9558 },
  },
  destination: {
    id: 'd1',
    themes: ['nature', 'heritage', 'tea'],
    estimatedCostLowMinor: 900_000,
    estimatedCostHighMinor: 2_200_000,
    travelMinutesFromOrigin: 180,
    minimumDays: 2,
    maximumDays: 5,
    expectedCrowdBand: 'moderate',
    seasonFitByMonth: { 12: 0.9 },
    accessibility: { stepFreeShare: 0.6, medicalAccessKm: 4 },
    localExperienceCount: 12,
  },
};

describe('computeDreamScore', () => {
  it('uses exactly the PRD weights and sums to 1', () => {
    expect(DREAM_SCORE_WEIGHTS).toEqual({
      interestMatch: 0.25, budgetMatch: 0.20, timeDistanceFit: 0.15,
      crowdComfort: 0.15, seasonWeatherFit: 0.10, accessibilityFit: 0.10,
      localExperienceFit: 0.05,
    });
    const sum = Object.values(DREAM_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('is deterministic for identical input', () => {
    expect(computeDreamScore(baseInput)).toEqual(computeDreamScore(baseInput));
  });

  it('keeps the total within 0 and 100 and equal to the weighted components', () => {
    const result = computeDreamScore(baseInput);
    const expected = (Object.keys(DREAM_SCORE_WEIGHTS) as Array<keyof typeof DREAM_SCORE_WEIGHTS>)
      .reduce((total, key) => total + result.components[key] * DREAM_SCORE_WEIGHTS[key], 0);
    expect(result.total).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it('scores interest match by overlap with destination themes', () => {
    const none = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, themes: ['nightlife', 'shopping'] },
    });
    expect(none.components.interestMatch).toBe(0);
    const full = computeDreamScore({
      ...baseInput,
      brief: { ...baseInput.brief, interests: ['nature'] },
      destination: { ...baseInput.destination, themes: ['nature'] },
    });
    expect(full.components.interestMatch).toBe(100);
  });

  it('scores budget match at 100 when the high estimate fits inside the budget', () => {
    const result = computeDreamScore(baseInput);
    expect(result.components.budgetMatch).toBe(100);
  });

  it('penalises a destination whose low estimate already exceeds the budget', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: {
        ...baseInput.destination,
        estimatedCostLowMinor: 4_000_000,
        estimatedCostHighMinor: 6_000_000,
      },
    });
    expect(result.components.budgetMatch).toBeLessThan(25);
  });

  it('rewards low crowd for a crowd-averse traveler', () => {
    const comfortable = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'comfortable' },
    });
    const heavy = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'heavy' },
    });
    expect(comfortable.components.crowdComfort).toBeGreaterThan(heavy.components.crowdComfort);
  });

  it('treats an unknown crowd band as missing data, not as a good score', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: { ...baseInput.destination, expectedCrowdBand: 'unknown' },
    });
    expect(result.missingDimensions).toContain('crowdComfort');
    expect(result.confidence).not.toBe('high');
  });

  it('lowers confidence as more dimensions go missing', () => {
    const result = computeDreamScore({
      ...baseInput,
      destination: {
        ...baseInput.destination,
        expectedCrowdBand: 'unknown',
        seasonFitByMonth: {},
        accessibility: null,
      },
    });
    expect(result.confidence).toBe('low');
    expect(result.missingDimensions.length).toBeGreaterThanOrEqual(3);
  });

  it('produces at least three plain-language reasons and one trade-off', () => {
    const result = computeDreamScore(baseInput);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    expect(result.reasons[0]).not.toMatch(/score|weight|dimension/i);
    expect(result.tradeOff).toBeTruthy();
  });

  it('never describes the score as safety', () => {
    const result = computeDreamScore(baseInput);
    const text = [...result.reasons, result.tradeOff ?? ''].join(' ');
    expect(text).not.toMatch(/\bsafe\b|\bsafety\b/i);
  });

  it('stamps the algorithm version', () => {
    expect(computeDreamScore(baseInput).algorithmVersion).toBe('dream-score-1.0.0');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- recommendations`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Dream Score**

Each dimension normalises to 0–100:

- `interestMatch` — share of the traveler's interests present in the destination themes, ×100. No interests declared → dimension missing.
- `budgetMatch` — 100 when `estimatedCostHighMinor <= budgetTotalMinor`; 60 when only the low estimate fits, scaled by how far the high overruns; falls toward 0 as `estimatedCostLowMinor` exceeds the budget. No budget declared → missing.
- `timeDistanceFit` — penalises travel time as a share of trip length: `100 - clamp((travelMinutes * 2) / (durationDays * 600) * 100, 0, 100)`, and zeroes out when `durationDays < minimumDays`.
- `crowdComfort` — a lookup from `(crowdTolerance, expectedCrowdBand)`; band `unknown` marks the dimension missing.
- `seasonWeatherFit` — `seasonFitByMonth[travelMonth] * 100`; absent entry marks it missing.
- `accessibilityFit` — combines `stepFreeShare` against `constraints.lowWalking` and `medicalAccessKm` against `constraints.medicalAccessRequired`; `accessibility === null` marks it missing.
- `localExperienceFit` — `clamp(localExperienceCount / 15, 0, 1) * 100`.

Missing dimensions score at the **neutral 50**, are listed in `missingDimensions`, and drag confidence: 0 missing → `high`, 1–2 → `medium`, 3+ → `low`. Reasons are generated from the highest-weighted components scoring ≥70, phrased as user-facing sentences ("Matches your interest in nature and heritage", "Fits inside your ₹25,000 budget", "About 3 hours from Coimbatore"). The trade-off is the lowest-scoring non-missing component phrased as a limitation. Sponsored placement never enters the score (PRD Part II §9.2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- recommendations`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/recommendations tests/unit/recommendations
git commit -m "feat: add deterministic Dream Score with explanation and confidence"
```

---

### Task 5: Crowd intelligence domain

**Files:**
- Create: `src/modules/crowd/domain/classify.ts`, `src/modules/crowd/domain/resolve.ts`, `src/modules/crowd/domain/types.ts`
- Test: `tests/unit/crowd/classify.test.ts`, `tests/unit/crowd/resolve.test.ts`

**Interfaces:**
- Produces: `classifyRatio(ratio: number): CrowdBand` where `type CrowdBand = 'comfortable' | 'moderate' | 'heavy' | 'unknown'`
- Produces: `computeRatio(input: RatioInput): number` implementing PRD Part II §10.2
- Produces: `resolveCrowdStatus(input: ResolveInput, now: Date): CrowdStatus` implementing the §10.1 precedence ladder, where

```ts
export type CrowdStatus = {
  band: CrowdBand;
  label: 'Comfortable' | 'Moderate' | 'Heavy crowd' | 'Unknown';
  source: 'override' | 'sensor' | 'aggregated_checkin' | 'forecast' | 'none';
  confidence: number;          // 0–1
  confidenceLabel: 'High confidence' | 'Medium confidence' | 'Low confidence';
  observedAt: Date | null;
  expiresAt: Date | null;
  isStale: boolean;
  explanation: string;         // powers the "Why?" action
};
```

- [ ] **Step 1: Write the failing crowd tests**

```ts
// tests/unit/crowd/classify.test.ts
import { describe, expect, it } from 'vitest';
import { classifyRatio, computeRatio } from '@/modules/crowd/domain/classify';

describe('classifyRatio', () => {
  it('applies the PRD thresholds exactly at the boundaries', () => {
    expect(classifyRatio(0.0)).toBe('comfortable');
    expect(classifyRatio(0.4999)).toBe('comfortable');
    expect(classifyRatio(0.5)).toBe('moderate');
    expect(classifyRatio(0.8)).toBe('moderate');
    expect(classifyRatio(0.8001)).toBe('heavy');
    expect(classifyRatio(1.5)).toBe('heavy');
  });
});

describe('computeRatio', () => {
  it('sums base, signal, event and weather factors', () => {
    expect(computeRatio({ base: 0.4, signal: 0.1, eventFactor: 0.1, weatherFactor: -0.05 }))
      .toBeCloseTo(0.55, 6);
  });

  it('clamps to the 0 to 1.5 range', () => {
    expect(computeRatio({ base: 1.2, signal: 0.6, eventFactor: 0.4, weatherFactor: 0 })).toBe(1.5);
    expect(computeRatio({ base: 0.1, signal: -0.5, eventFactor: -0.3, weatherFactor: 0 })).toBe(0);
  });
});
```

```ts
// tests/unit/crowd/resolve.test.ts
import { describe, expect, it } from 'vitest';
import { resolveCrowdStatus } from '@/modules/crowd/domain/resolve';

const now = new Date('2026-12-20T10:00:00Z');
const future = new Date('2026-12-20T14:00:00Z');
const past = new Date('2026-12-20T09:00:00Z');

describe('resolveCrowdStatus', () => {
  it('returns unknown when there is no signal at all', () => {
    const status = resolveCrowdStatus({ override: null, observations: [], forecast: null }, now);
    expect(status.band).toBe('unknown');
    expect(status.label).toBe('Unknown');
    expect(status.source).toBe('none');
  });

  it('prefers an active administrator override over every other source', () => {
    const status = resolveCrowdStatus({
      override: { band: 'heavy', reason: 'Festival procession', startsAt: past, expiresAt: future },
      observations: [{ band: 'comfortable', observedAt: now, expiresAt: future, confidence: 0.9, sourceKind: 'sensor', sampleSize: 200 }],
      forecast: { band: 'comfortable', confidence: 0.8, startsAt: past, endsAt: future, expiresAt: future },
    }, now);
    expect(status.band).toBe('heavy');
    expect(status.source).toBe('override');
    expect(status.explanation).toContain('Festival procession');
  });

  it('ignores an override that has expired', () => {
    const status = resolveCrowdStatus({
      override: { band: 'heavy', reason: 'Old event', startsAt: past, expiresAt: past },
      observations: [],
      forecast: { band: 'moderate', confidence: 0.7, startsAt: past, endsAt: future, expiresAt: future },
    }, now);
    expect(status.source).toBe('forecast');
    expect(status.band).toBe('moderate');
  });

  it('returns unknown when every observation and forecast has expired', () => {
    const status = resolveCrowdStatus({
      override: null,
      observations: [{ band: 'heavy', observedAt: past, expiresAt: past, confidence: 0.9, sourceKind: 'sensor', sampleSize: 100 }],
      forecast: { band: 'heavy', confidence: 0.6, startsAt: past, endsAt: past, expiresAt: past },
    }, now);
    expect(status.band).toBe('unknown');
    expect(status.source).toBe('none');
  });

  it('prefers a fresh sensor feed over aggregated check-ins', () => {
    const status = resolveCrowdStatus({
      override: null,
      observations: [
        { band: 'moderate', observedAt: now, expiresAt: future, confidence: 0.5, sourceKind: 'aggregated_checkin', sampleSize: 40 },
        { band: 'heavy', observedAt: now, expiresAt: future, confidence: 0.9, sourceKind: 'sensor', sampleSize: 500 },
      ],
      forecast: null,
    }, now);
    expect(status.source).toBe('sensor');
    expect(status.band).toBe('heavy');
  });

  it('suppresses aggregated check-ins below the privacy threshold', () => {
    const status = resolveCrowdStatus({
      override: null,
      observations: [{ band: 'heavy', observedAt: now, expiresAt: future, confidence: 0.8, sourceKind: 'aggregated_checkin', sampleSize: 3 }],
      forecast: null,
    }, now);
    expect(status.source).not.toBe('aggregated_checkin');
    expect(status.band).toBe('unknown');
  });

  it('marks a forecast-only status as lower confidence than a sensor status', () => {
    const forecastOnly = resolveCrowdStatus({
      override: null, observations: [],
      forecast: { band: 'moderate', confidence: 0.6, startsAt: past, endsAt: future, expiresAt: future },
    }, now);
    const sensor = resolveCrowdStatus({
      override: null,
      observations: [{ band: 'moderate', observedAt: now, expiresAt: future, confidence: 0.95, sourceKind: 'sensor', sampleSize: 400 }],
      forecast: null,
    }, now);
    expect(forecastOnly.confidence).toBeLessThan(sensor.confidence);
  });

  it('never labels any status as live', () => {
    const status = resolveCrowdStatus({
      override: null,
      observations: [{ band: 'moderate', observedAt: now, expiresAt: future, confidence: 0.9, sourceKind: 'sensor', sampleSize: 200 }],
      forecast: null,
    }, now);
    expect(status.explanation).not.toMatch(/\blive\b/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- crowd`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement classification and resolution**

`classifyRatio` uses the PRD bands exactly: `< 0.50` comfortable, `0.50 ≤ r ≤ 0.80` moderate, `> 0.80` heavy. `computeRatio` clamps `base + signal + eventFactor + weatherFactor` to `[0, 1.5]`.

`resolveCrowdStatus` walks the §10.1 ladder, discarding any input whose `expiresAt <= now`, and discarding `aggregated_checkin` observations with `sampleSize < AGGREGATION_THRESHOLD` (set to 10 and exported as a named constant, since PRD §20 leaves the final value to be decided). Confidence carries through from the winning source, reduced by a freshness decay over the age of the observation. `confidenceLabel` buckets at ≥0.75 high, ≥0.45 medium, below that low. `explanation` is user-facing text naming the source kind and the observation age — "Based on venue sensor counts, updated 12 minutes ago" — and for an override, the administrator's reason.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- crowd`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/crowd tests/unit/crowd
git commit -m "feat: add crowd classification and source-precedence resolution"
```

---

### Task 6: Budget domain

**Files:**
- Create: `src/modules/budgets/domain/budget.ts`, `src/modules/budgets/domain/types.ts`
- Test: `tests/unit/budgets/budget.test.ts`

**Interfaces:**
- Produces:

```ts
export type PriceState = 'live' | 'partner' | 'historical' | 'manual';

export type BudgetLine = {
  id: string;
  category: 'stay' | 'transport' | 'food' | 'activities' | 'shopping' | 'buffer';
  description: string;
  lowMinor: number | null;
  expectedMinor: number;
  highMinor: number | null;
  priceState: PriceState;
  refreshedAt: Date | null;
  locked: boolean;
};

export type BudgetSummary = {
  totalLimitMinor: number;
  reserveMinor: number;
  expectedTotalMinor: number;
  lowTotalMinor: number;
  highTotalMinor: number;
  remainingMinor: number;       // limit - reserve - expected
  state: 'within_budget' | 'high_estimate_over' | 'over_budget' | 'missing_price_data';
  byCategory: Array<{ category: BudgetLine['category']; expectedMinor: number; share: number }>;
  estimatedItemCount: number;   // lines not priced 'live'
  livePricedItemCount: number;
  missingPriceLines: string[];  // line ids with no expected value source
};

export function summarizeBudget(lines: BudgetLine[], totalLimitMinor: number, reserveMinor: number): BudgetSummary;
export function applyBudgetStyle(lines: BudgetLine[], style: 'save_more' | 'balanced' | 'more_comfort'): BudgetLine[];
```

- [ ] **Step 1: Write the failing budget tests**

```ts
// tests/unit/budgets/budget.test.ts
import { describe, expect, it } from 'vitest';
import { summarizeBudget, applyBudgetStyle } from '@/modules/budgets/domain/budget';
import type { BudgetLine } from '@/modules/budgets/domain/types';

const line = (over: Partial<BudgetLine> = {}): BudgetLine => ({
  id: 'l1', category: 'stay', description: 'Hotel', lowMinor: 400_000,
  expectedMinor: 500_000, highMinor: 600_000, priceState: 'historical',
  refreshedAt: new Date('2026-12-01T00:00:00Z'), locked: false, ...over,
});

describe('summarizeBudget', () => {
  it('sums expected, low and high totals in minor units', () => {
    const summary = summarizeBudget(
      [line(), line({ id: 'l2', category: 'food', expectedMinor: 300_000, lowMinor: 200_000, highMinor: 400_000 })],
      2_500_000, 200_000,
    );
    expect(summary.expectedTotalMinor).toBe(800_000);
    expect(summary.lowTotalMinor).toBe(600_000);
    expect(summary.highTotalMinor).toBe(1_000_000);
  });

  it('subtracts the reserve from remaining balance', () => {
    const summary = summarizeBudget([line()], 2_500_000, 200_000);
    expect(summary.remainingMinor).toBe(2_500_000 - 200_000 - 500_000);
  });

  it('reports within_budget when the high estimate fits', () => {
    expect(summarizeBudget([line()], 2_500_000, 0).state).toBe('within_budget');
  });

  it('warns when the high estimate exceeds the budget but expected does not', () => {
    const summary = summarizeBudget([line({ expectedMinor: 900_000, highMinor: 1_400_000 })], 1_000_000, 0);
    expect(summary.state).toBe('high_estimate_over');
  });

  it('reports over_budget when the expected total already exceeds the limit', () => {
    const summary = summarizeBudget([line({ expectedMinor: 1_500_000 })], 1_000_000, 0);
    expect(summary.state).toBe('over_budget');
  });

  it('reports missing_price_data when a line has no low or high bound', () => {
    const summary = summarizeBudget([line({ lowMinor: null, highMinor: null })], 2_500_000, 0);
    expect(summary.state).toBe('missing_price_data');
    expect(summary.missingPriceLines).toEqual(['l1']);
  });

  it('counts estimated versus live-priced items separately', () => {
    const summary = summarizeBudget(
      [line({ priceState: 'live' }), line({ id: 'l2', priceState: 'historical' }), line({ id: 'l3', priceState: 'manual' })],
      5_000_000, 0,
    );
    expect(summary.livePricedItemCount).toBe(1);
    expect(summary.estimatedItemCount).toBe(2);
  });

  it('computes category shares that sum to 1', () => {
    const summary = summarizeBudget(
      [line({ expectedMinor: 600_000 }), line({ id: 'l2', category: 'food', expectedMinor: 400_000 })],
      2_500_000, 0,
    );
    const total = summary.byCategory.reduce((sum, c) => sum + c.share, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('handles an empty itinerary without dividing by zero', () => {
    const summary = summarizeBudget([], 2_500_000, 0);
    expect(summary.expectedTotalMinor).toBe(0);
    expect(summary.byCategory).toEqual([]);
    expect(summary.state).toBe('within_budget');
  });
});

describe('applyBudgetStyle', () => {
  it('never changes a locked line', () => {
    const locked = line({ locked: true, expectedMinor: 500_000 });
    const [result] = applyBudgetStyle([locked], 'save_more');
    expect(result.expectedMinor).toBe(500_000);
  });

  it('reduces unlocked discretionary spend under save_more', () => {
    const [result] = applyBudgetStyle([line({ category: 'shopping' })], 'save_more');
    expect(result.expectedMinor).toBeLessThan(500_000);
  });

  it('is a no-op under balanced', () => {
    const lines = [line(), line({ id: 'l2', category: 'food' })];
    expect(applyBudgetStyle(lines, 'balanced')).toEqual(lines);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- budgets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the budget summary**

Totals use `sumMinor`. A line missing both `lowMinor` and `highMinor` contributes its `expectedMinor` to all three totals but lands in `missingPriceLines`, and `missing_price_data` takes precedence over `high_estimate_over` in the state ladder (`over_budget` > `missing_price_data` > `high_estimate_over` > `within_budget`) because the safer, more transparent state wins. `applyBudgetStyle` scales unlocked `food`, `shopping` and `activities` lines by 0.8 for `save_more` and 1.2 for `more_comfort`, leaving `stay`, `transport` and `buffer` untouched, and returns new objects rather than mutating.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- budgets`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/budgets tests/unit/budgets
git commit -m "feat: add budget summary, states and budget-style trade-offs"
```

---

### Task 7: Trip and itinerary domain

**Files:**
- Create: `src/modules/trips/domain/trip-state.ts`, `src/modules/trips/domain/itinerary.ts`, `src/modules/trips/domain/conflicts.ts`, `src/modules/trips/domain/types.ts`
- Test: `tests/unit/trips/trip-state.test.ts`, `tests/unit/trips/itinerary.test.ts`, `tests/unit/trips/conflicts.test.ts`

**Interfaces:**
- Produces: `canTransition(from: TripStatus, to: TripStatus): boolean` for `'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled'`
- Produces: `reorderItems(items: ItineraryItem[], fromIndex: number, toIndex: number): ItineraryItem[]` — preserves locked positions
- Produces: `recalculateSchedule(items: ItineraryItem[], dayStart: Date, travel: TravelLookup): ItineraryItem[]`
- Produces: `detectConflicts(day: ItineraryDay, context: ConflictContext): Conflict[]` where `Conflict['kind']` is one of `'opening_hours' | 'excessive_travel' | 'crowd_peak' | 'budget_overrun' | 'weather_closure' | 'accessibility_mismatch'` — the six from PRD T09

- [ ] **Step 1: Write the failing trip tests**

```ts
// tests/unit/trips/trip-state.test.ts
import { describe, expect, it } from 'vitest';
import { canTransition } from '@/modules/trips/domain/trip-state';

describe('canTransition', () => {
  it('allows the forward planning path', () => {
    expect(canTransition('draft', 'upcoming')).toBe(true);
    expect(canTransition('upcoming', 'active')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
  });

  it('forbids skipping straight from draft to active', () => {
    expect(canTransition('draft', 'active')).toBe(false);
  });

  it('forbids reviving a completed trip', () => {
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('completed', 'draft')).toBe(false);
  });

  it('allows cancelling from any pre-completion state', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('upcoming', 'cancelled')).toBe(true);
    expect(canTransition('active', 'cancelled')).toBe(true);
    expect(canTransition('completed', 'cancelled')).toBe(false);
  });

  it('treats a transition to the same state as a no-op, not an error', () => {
    expect(canTransition('draft', 'draft')).toBe(true);
  });
});
```

```ts
// tests/unit/trips/itinerary.test.ts
import { describe, expect, it } from 'vitest';
import { reorderItems, recalculateSchedule } from '@/modules/trips/domain/itinerary';
import type { ItineraryItem } from '@/modules/trips/domain/types';

const item = (id: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id, title: id, itemType: 'place', placeId: `p-${id}`, localBusinessId: null,
  startsAt: null, durationMinutes: 60, sortOrder: 0, lockedByUser: false,
  travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' },
  priceEstimate: { expectedMinor: 0, priceState: 'historical' },
  bookingState: null, notes: null, ...over,
});

describe('reorderItems', () => {
  it('moves an unlocked item and renumbers sort order contiguously', () => {
    const result = reorderItems([item('a'), item('b'), item('c')], 0, 2);
    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(result.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
  });

  it('refuses to move a locked item', () => {
    const items = [item('a', { lockedByUser: true }), item('b'), item('c')];
    expect(reorderItems(items, 0, 2).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a locked item at its original index when others move around it', () => {
    const items = [item('a'), item('b', { lockedByUser: true }), item('c')];
    const result = reorderItems(items, 2, 0);
    expect(result[1].id).toBe('b');
  });
});

describe('recalculateSchedule', () => {
  it('chains start times through duration plus travel time', () => {
    const dayStart = new Date('2026-12-20T03:30:00Z'); // 09:00 IST
    const result = recalculateSchedule(
      [item('a', { durationMinutes: 90 }), item('b', { durationMinutes: 60 })],
      dayStart,
      () => ({ minutes: 30, meters: 12_000, mode: 'car' }),
    );
    expect(result[0].startsAt?.toISOString()).toBe('2026-12-20T03:30:00.000Z');
    expect(result[1].startsAt?.toISOString()).toBe('2026-12-20T05:30:00.000Z');
    expect(result[1].travelFromPrevious.minutes).toBe(30);
  });

  it('does not move an item the user locked to a specific time', () => {
    const dayStart = new Date('2026-12-20T03:30:00Z');
    const pinned = new Date('2026-12-20T08:00:00Z');
    const result = recalculateSchedule(
      [item('a', { durationMinutes: 60 }), item('b', { lockedByUser: true, startsAt: pinned })],
      dayStart,
      () => ({ minutes: 20, meters: 8_000, mode: 'car' }),
    );
    expect(result[1].startsAt?.toISOString()).toBe(pinned.toISOString());
  });
});
```

```ts
// tests/unit/trips/conflicts.test.ts
import { describe, expect, it } from 'vitest';
import { detectConflicts } from '@/modules/trips/domain/conflicts';

describe('detectConflicts', () => {
  it('flags an item scheduled outside its opening hours', () => {
    const conflicts = detectConflicts(dayWithItemAt('2026-12-20T20:00:00Z'), contextWithHours('09:00', '17:00'));
    expect(conflicts.map((c) => c.kind)).toContain('opening_hours');
  });

  it('flags travel time exceeding half the day', () => {
    const conflicts = detectConflicts(dayWithTravelMinutes(400), baseContext());
    expect(conflicts.map((c) => c.kind)).toContain('excessive_travel');
  });

  it('flags a visit scheduled during a heavy crowd window', () => {
    const conflicts = detectConflicts(dayWithItemAt('2026-12-20T06:00:00Z'), contextWithHeavyCrowd());
    expect(conflicts.map((c) => c.kind)).toContain('crowd_peak');
  });

  it('flags an accessibility mismatch when the traveler needs step-free access', () => {
    const conflicts = detectConflicts(dayWithItemAt('2026-12-20T06:00:00Z'), contextWithStairsOnly());
    expect(conflicts.map((c) => c.kind)).toContain('accessibility_mismatch');
  });

  it('returns an empty array for a feasible day', () => {
    expect(detectConflicts(feasibleDay(), baseContext())).toEqual([]);
  });

  it('gives every conflict a user-facing message and a suggested action', () => {
    for (const conflict of detectConflicts(dayWithItemAt('2026-12-20T20:00:00Z'), contextWithHours('09:00', '17:00'))) {
      expect(conflict.message.length).toBeGreaterThan(10);
      expect(conflict.suggestedAction).toBeTruthy();
    }
  });
});
```

The helper builders (`dayWithItemAt`, `contextWithHours`, `dayWithTravelMinutes`, `contextWithHeavyCrowd`, `contextWithStairsOnly`, `feasibleDay`, `baseContext`) live at the top of the test file and construct the same `ItineraryDay` and `ConflictContext` shapes the implementation consumes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- trips`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement trip state, itinerary scheduling and conflict detection**

`canTransition` is a table lookup from a `Record<TripStatus, TripStatus[]>` with self-transitions allowed. `reorderItems` returns the input unchanged when the source index is locked, otherwise splices the item into place while re-inserting locked items at their original indices, then renumbers `sortOrder`. `recalculateSchedule` walks the list chaining `startsAt = previousEnd + travel.minutes`, skipping any item with `lockedByUser && startsAt !== null`. `detectConflicts` runs the six independent checks and returns `{ kind, severity, message, suggestedAction, itemId }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- trips`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/trips tests/unit/trips
git commit -m "feat: add trip state machine, itinerary scheduling and conflict detection"
```

---

### Task 8: Verification gating domain

**Files:**
- Create: `src/modules/verification/domain/gate.ts`, `src/modules/verification/domain/types.ts`
- Test: `tests/unit/verification/gate.test.ts`

**Interfaces:**
- Produces: `resolveVerificationDisplay(verification: Verification | null, now: Date): VerificationDisplay` with `{ showBadge: boolean; status: VerificationStatus | 'none'; verifiedAt: Date | null; expiresAt: Date | null; nextReviewAt: Date | null; knownLimitations: string[]; reviewerType: string | null; checklistGroups: ChecklistGroup[] }`
- Produces: `canDecide(actor: Actor, verification: Verification): boolean` — a business owner cannot approve their own verification (PRD Part II §19)

- [ ] **Step 1: Write the failing verification tests**

```ts
// tests/unit/verification/gate.test.ts
import { describe, expect, it } from 'vitest';
import { resolveVerificationDisplay, canDecide } from '@/modules/verification/domain/gate';

const now = new Date('2026-12-20T10:00:00Z');
const approved = {
  id: 'v1', placeId: 'p1', status: 'approved' as const,
  reviewedAt: new Date('2026-09-12T00:00:00Z'),
  expiresAt: new Date('2027-03-12T00:00:00Z'),
  knownLimitations: ['Mobile coverage becomes unreliable during the final 2 km.'],
  reviewerType: 'district_tourism_office', checklist: {}, ownerUserId: null,
};

describe('resolveVerificationDisplay', () => {
  it('shows the badge only for an approved, unexpired verification', () => {
    expect(resolveVerificationDisplay(approved, now).showBadge).toBe(true);
  });

  it('hides the badge when the verification has expired', () => {
    const expired = { ...approved, expiresAt: new Date('2026-10-01T00:00:00Z') };
    const display = resolveVerificationDisplay(expired, now);
    expect(display.showBadge).toBe(false);
    expect(display.status).toBe('expired');
  });

  it('hides the badge for every non-approved status', () => {
    for (const status of ['draft', 'evidence_pending', 'under_review', 'changes_requested', 'rejected', 'suspended', 'suppressed'] as const) {
      expect(resolveVerificationDisplay({ ...approved, status }, now).showBadge).toBe(false);
    }
  });

  it('hides the badge when there is no verification at all', () => {
    const display = resolveVerificationDisplay(null, now);
    expect(display.showBadge).toBe(false);
    expect(display.status).toBe('none');
  });

  it('always surfaces known limitations, even when the badge shows', () => {
    expect(resolveVerificationDisplay(approved, now).knownLimitations).toHaveLength(1);
  });
});

describe('canDecide', () => {
  it('allows a verifier to decide', () => {
    expect(canDecide({ userId: 'u1', roles: ['verifier'] }, approved)).toBe(true);
  });

  it('forbids a business owner from approving their own submission', () => {
    const own = { ...approved, ownerUserId: 'u2' };
    expect(canDecide({ userId: 'u2', roles: ['business_owner', 'verifier'] }, own)).toBe(false);
  });

  it('forbids a traveler from deciding', () => {
    expect(canDecide({ userId: 'u3', roles: ['traveler'] }, approved)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- verification`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the gate**

`resolveVerificationDisplay` returns `showBadge: true` only when `status === 'approved' && (expiresAt === null || expiresAt > now)`, and rewrites the reported status to `'expired'` when an approved row has passed its expiry. `knownLimitations` is returned regardless of badge state, because T11 requires limitations before the visit action. `canDecide` requires a `verifier`, `tourism_admin` or `platform_admin` role *and* `verification.ownerUserId !== actor.userId`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- verification`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/verification tests/unit/verification
git commit -m "feat: gate Dream Verified badge on approved unexpired verification"
```

---

### Task 9: Session, CSRF, authorization and the API handler wrapper

**Files:**
- Create: `src/server/session.ts`, `src/server/csrf.ts`, `src/server/authorize.ts`, `src/server/rate-limit.ts`, `src/server/problem.ts`, `src/server/handler.ts`
- Create: `src/platform/cache/index.ts`, `src/platform/cache/memory.ts`, `src/platform/cache/redis.ts`
- Test: `tests/unit/server/problem.test.ts`, `tests/integration/authorize.test.ts`

**Interfaces:**
- Produces: `getSession(): Promise<Session | null>`, `createGuestSession(): Promise<Session>`, `requireSession(): Promise<Session>`
- Produces: `problem(opts: { type: string; title: string; status: number; detail?: string; actions?: string[] }): Response` — RFC 7807 shape from PRD §7.5
- Produces: `route(config: { auth?: 'none' | 'session' | 'role'; roles?: UserRole[]; body?: ZodSchema; rateLimit?: { key: string; perMinute: number }; idempotent?: boolean }, fn: Handler): RouteHandler`
- Produces: `assertOwnsTrip(session: Session, tripId: string): Promise<void>` — throws a 404-shaped problem, never 403, so trip IDs are not enumerable

- [ ] **Step 1: Write the failing authorization test**

```ts
// tests/integration/authorize.test.ts
import { describe, expect, it } from 'vitest';
import { assertOwnsTrip } from '@/server/authorize';

describe('object-level authorization', () => {
  it('lets the owner read their own trip', async () => {
    const { session, tripId } = await seedUserWithTrip();
    await expect(assertOwnsTrip(session, tripId)).resolves.toBeUndefined();
  });

  it("refuses another user's trip and reports it as not found", async () => {
    const { tripId } = await seedUserWithTrip();
    const { session: other } = await seedUserWithTrip();
    await expect(assertOwnsTrip(other, tripId)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses an unknown trip id identically', async () => {
    const { session } = await seedUserWithTrip();
    await expect(assertOwnsTrip(session, '00000000-0000-0000-0000-000000000000'))
      .rejects.toMatchObject({ status: 404 });
  });
});
```

`seedUserWithTrip()` is defined in `tests/integration/helpers.ts`: it inserts a user, a session row and a trip, and returns both.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:integration -- authorize`
Expected: FAIL — `@/server/authorize` not found.

- [ ] **Step 3: Implement the server layer**

Sessions are a random 32-byte token, stored hashed (`sha256`) in `sessions.token_hash`, set as an `HttpOnly; Secure; SameSite=Lax` cookie named `dd_session`. Guest sessions carry `is_guest = true` and no `user_id`; the PRD allows a guest to generate one plan before authentication (T01), enforced by counting that session's trips.

CSRF uses a double-submit token derived from `sessions.csrf_secret`, required on every non-GET browser request. `route()` composes: resolve session → CSRF check → rate limit → Zod-validate body → run handler → serialize errors as RFC 7807 problems with a `requestId`. The cache adapter exports one interface with a Redis implementation and an in-memory fallback used when `REDIS_URL` is unset, so the app still runs without Redis.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:integration -- authorize`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server src/platform/cache tests/integration
git commit -m "feat: add sessions, CSRF, RBAC, object-level authorization and problem responses"
```

---

### Task 10: AI gateway with deterministic fallback

**Files:**
- Create: `src/platform/ai/schemas.ts`, `src/platform/ai/gateway.ts`, `src/platform/ai/anthropic.ts`, `src/platform/ai/deterministic.ts`, `src/platform/ai/prompts.ts`, `src/platform/ai/tools.ts`
- Test: `tests/unit/ai/deterministic.test.ts`, `tests/unit/ai/schemas.test.ts`

**Interfaces:**
- Produces: `TripBriefSchema` (Zod) matching PRD Part II §7.4 exactly
- Produces: `interface AiGateway { extractBrief(message, prior): Promise<BriefExtraction>; describeItinerary(plan): Promise<ItineraryProse>; proposeRevision(plan, goal): Promise<Revision> }`
- Produces: `getAiGateway(): AiGateway` — returns the Anthropic gateway when `ANTHROPIC_API_KEY` is set, otherwise the deterministic one
- Produces: `type BriefExtraction = { brief: Partial<TripBrief>; extractedFields: string[]; clarification: { field: string; question: string; options?: string[] } | null; confidence: number; mode: 'llm' | 'deterministic' }`

- [ ] **Step 1: Write the failing extraction tests**

```ts
// tests/unit/ai/deterministic.test.ts
import { describe, expect, it } from 'vitest';
import { DeterministicGateway } from '@/platform/ai/deterministic';

const gateway = new DeterministicGateway();

describe('DeterministicGateway.extractBrief', () => {
  it('extracts the PRD validation prompt end to end', async () => {
    const { brief, extractedFields } = await gateway.extractBrief(
      'Plan a 4 day family trip from Coimbatore in December within ₹25,000, we like nature and heritage and want to avoid crowds',
      null,
    );
    expect(brief.durationDays).toBe(4);
    expect(brief.origin?.label).toBe('Coimbatore');
    expect(brief.budget?.totalMinor).toBe(2_500_000);
    expect(brief.party?.type).toBe('family');
    expect(brief.interests).toEqual(expect.arrayContaining(['nature', 'heritage']));
    expect(brief.crowdTolerance).toBe('low');
    expect(extractedFields).toEqual(expect.arrayContaining(['durationDays', 'origin', 'budget', 'interests']));
  });

  it('parses rupee amounts written in several ways', async () => {
    for (const [text, expected] of [
      ['under ₹25,000', 2_500_000], ['budget 25000 rupees', 2_500_000],
      ['around Rs. 12,500', 1_250_000], ['15k budget', 1_500_000],
      ['1.5 lakh', 15_000_000],
    ] as const) {
      const { brief } = await gateway.extractBrief(`Trip ${text}`, null);
      expect(brief.budget?.totalMinor).toBe(expected);
    }
  });

  it('parses duration from days, nights and weekend', async () => {
    expect((await gateway.extractBrief('3 day trip', null)).brief.durationDays).toBe(3);
    expect((await gateway.extractBrief('2 nights in Ooty', null)).brief.durationDays).toBe(3);
    expect((await gateway.extractBrief('weekend getaway', null)).brief.durationDays).toBe(2);
  });

  it('asks one focused clarification for the most important missing field', async () => {
    const { clarification } = await gateway.extractBrief('I want to go somewhere nice', null);
    expect(clarification).not.toBeNull();
    expect(clarification!.question).toMatch(/\?$/);
  });

  it('asks nothing further once the brief is complete', async () => {
    const { clarification } = await gateway.extractBrief(
      '4 day family trip from Coimbatore in December under ₹25,000, nature and heritage, relaxed pace, avoid crowds',
      null,
    );
    expect(clarification).toBeNull();
  });

  it('merges a follow-up answer into the prior brief without losing fields', async () => {
    const first = await gateway.extractBrief('4 day trip from Coimbatore, nature', null);
    const second = await gateway.extractBrief('budget is ₹25,000', first.brief);
    expect(second.brief.durationDays).toBe(4);
    expect(second.brief.origin?.label).toBe('Coimbatore');
    expect(second.brief.budget?.totalMinor).toBe(2_500_000);
  });

  it('reports its mode so the UI can label the degraded path', async () => {
    expect((await gateway.extractBrief('weekend trip', null)).mode).toBe('deterministic');
  });
});
```

```ts
// tests/unit/ai/schemas.test.ts
import { describe, expect, it } from 'vitest';
import { TripBriefSchema } from '@/platform/ai/schemas';

describe('TripBriefSchema', () => {
  it('accepts the PRD example brief verbatim', () => {
    const example = {
      origin: { label: 'Coimbatore', coordinates: [76.9558, 11.0168] },
      dateFlexibility: '2026-12', durationDays: 4,
      party: { type: 'family', adults: 3, children: 1 },
      budget: { currency: 'INR', totalMinor: 2500000 },
      interests: ['nature', 'heritage', 'local_food'],
      crowdTolerance: 'low', pace: 'relaxed',
      constraints: { lowWalking: true, medicalAccessRequired: true },
    };
    expect(TripBriefSchema.safeParse(example).success).toBe(true);
  });

  it('rejects a negative duration', () => {
    expect(TripBriefSchema.safeParse({ durationDays: -1 }).success).toBe(false);
  });

  it('rejects a non-integer budget in minor units', () => {
    expect(TripBriefSchema.safeParse({ budget: { currency: 'INR', totalMinor: 2500.5 } }).success).toBe(false);
  });

  it('rejects coordinates outside valid ranges', () => {
    const bad = { origin: { label: 'X', coordinates: [200, 100] } };
    expect(TripBriefSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- ai`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the schemas, deterministic gateway and Anthropic gateway**

`TripBriefSchema` mirrors PRD §7.4: `origin: { label, coordinates: [lng, lat] }` with `lng` in [-180,180] and `lat` in [-90,90]; `budget.totalMinor` an integer; `crowdTolerance` in `low|medium|high`; `pace` in `relaxed|balanced|packed`; every field optional at extraction time and required only at generation time.

`DeterministicGateway` uses ordered regular expressions for amounts (`₹`/`Rs`/`rupees`/`k`/`lakh`), duration (`N day(s)`, `N night(s)` → N+1, `weekend` → 2), origin (matched against seeded destination and known city names), party (`family`, `couple`, `solo`, `friends`, plus `N adults`/`N children`), month names and `YYYY-MM`, interests (a keyword→theme map covering the seeded themes), crowd tolerance (`avoid crowds`/`quiet` → low), and pace. It merges over the prior brief rather than replacing it, then picks the single highest-priority missing field for its clarification (order: duration, origin, budget, interests) and returns at most two clarifications across a conversation, matching T03.

`AnthropicGateway` calls `claude-sonnet-5` with a tool-use structured output bound to `TripBriefSchema`, a system prompt that separates instructions from retrieved content, and the §8.4 allowlist — `search_destinations`, `get_destination_facts`, `get_place_crowd`, `get_route`, `get_weather`, `get_rules`, `get_nearby_help`, `search_local_businesses`, `estimate_budget`. Verification decisions, incident resolution and booking confirmation are **not** exposed as tools. Every tool result is re-validated server-side and every tool argument is Zod-checked before execution. Retrieved catalog text is wrapped in a delimiter block and labelled untrusted. On any failure — no key, timeout, schema violation, rate limit — the gateway falls back to `DeterministicGateway` and reports `mode: 'deterministic'` so the UI can say so (PRD §14.2: "LLM unavailable: show structured form and deterministic destination results").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- ai`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/platform/ai tests/unit/ai
git commit -m "feat: add AI gateway with tool allowlist and deterministic fallback parser"
```

---

### Task 11: Repositories and application services

Wires the domain modules to the database. One repository and one service per module.

**Files:**
- Create: `src/modules/catalog/repository.ts`, `src/modules/catalog/service.ts`
- Create: `src/modules/crowd/repository.ts`, `src/modules/crowd/service.ts`
- Create: `src/modules/recommendations/repository.ts`, `src/modules/recommendations/service.ts`
- Create: `src/modules/trips/repository.ts`, `src/modules/trips/service.ts`
- Create: `src/modules/budgets/repository.ts`, `src/modules/budgets/service.ts`
- Create: `src/modules/verification/repository.ts`, `src/modules/verification/service.ts`
- Create: `src/modules/businesses/repository.ts`, `src/modules/businesses/service.ts`
- Create: `src/modules/rules/repository.ts`, `src/modules/rules/service.ts`
- Create: `src/modules/help/repository.ts`, `src/modules/help/service.ts`
- Test: `tests/integration/catalog.test.ts`, `tests/integration/crowd.test.ts`, `tests/integration/trips.test.ts`

**Interfaces:**
- Produces: `catalogRepository.searchDestinations(filter: { themes?: string[]; nearPoint?: LatLng; radiusMeters?: number; maxCostMinor?: number }): Promise<DestinationRow[]>` — uses `ST_DWithin` on the geography index
- Produces: `helpRepository.findNearby(point: LatLng, types: string[], radiusMeters: number): Promise<HelpFacility[]>` — ordered by `ST_Distance`
- Produces: `crowdService.getStatus(placeId: string, at?: Date): Promise<CrowdStatus>` — composes the repository with `resolveCrowdStatus`
- Produces: `recommendationsService.shortlist(brief: TripBrief, userId: string | null): Promise<ShortlistEntry[]>` — filters deterministically, scores with `computeDreamScore`, persists to `recommendation_scores`, returns the top 3
- Produces: `tripsService.generateItinerary(tripId: string, session: Session): Promise<Trip>` — deterministic day packing honoring `expected_visit_minutes`, opening hours, travel time and budget

- [ ] **Step 1: Write the failing integration tests**

```ts
// tests/integration/catalog.test.ts
import { describe, expect, it } from 'vitest';
import { catalogRepository } from '@/modules/catalog/repository';

describe('catalogRepository', () => {
  it('finds destinations within a radius of Coimbatore', async () => {
    const results = await catalogRepository.searchDestinations({
      nearPoint: { lat: 11.0168, lng: 76.9558 }, radiusMeters: 120_000,
    });
    expect(results.map((d) => d.slug)).toContain('ooty-nilgiris');
  });

  it('excludes destinations outside the radius', async () => {
    const results = await catalogRepository.searchDestinations({
      nearPoint: { lat: 11.0168, lng: 76.9558 }, radiusMeters: 5_000,
    });
    expect(results.map((d) => d.slug)).not.toContain('ooty-nilgiris');
  });

  it('filters by theme', async () => {
    const results = await catalogRepository.searchDestinations({ themes: ['wildlife'] });
    expect(results.every((d) => d.themes.includes('wildlife'))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns only published destinations', async () => {
    const results = await catalogRepository.searchDestinations({});
    expect(results.every((d) => d.status === 'active')).toBe(true);
  });
});
```

```ts
// tests/integration/trips.test.ts
import { describe, expect, it } from 'vitest';
import { tripsService } from '@/modules/trips/service';

describe('tripsService.generateItinerary', () => {
  it('produces one day per brief duration', async () => {
    const trip = await generateFourDayNilgirisTrip();
    expect(trip.days).toHaveLength(4);
  });

  it('keeps the expected total inside the declared budget', async () => {
    const trip = await generateFourDayNilgirisTrip();
    expect(trip.budget.expectedTotalMinor).toBeLessThanOrEqual(trip.totalBudgetMinor);
  });

  it('records the source id for every trust-bearing item', async () => {
    const trip = await generateFourDayNilgirisTrip();
    const items = trip.days.flatMap((d) => d.items).filter((i) => i.placeId);
    expect(items.every((i) => i.sourceIds.length > 0)).toBe(true);
  });

  it('never schedules a place outside its opening hours', async () => {
    const trip = await generateFourDayNilgirisTrip();
    expect(trip.conflicts.filter((c) => c.kind === 'opening_hours')).toHaveLength(0);
  });

  it('is idempotent under the same idempotency key', async () => {
    const key = crypto.randomUUID();
    const first = await generateFourDayNilgirisTrip({ idempotencyKey: key });
    const second = await generateFourDayNilgirisTrip({ idempotencyKey: key });
    expect(second.version).toBe(first.version);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration -- catalog trips`
Expected: FAIL — repositories not found.

- [ ] **Step 3: Implement the repositories and services**

Repositories issue parameterised `postgres.js` queries, selecting geography columns as `ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng` and writing them as `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`. Radius filters use `ST_DWithin(location, $point, $meters)` so the GIST indexes apply.

`recommendationsService.shortlist` first applies hard deterministic filters (duration inside `minimum_days`/`maximum_days`, travel time reachable, low-estimate cost not more than 1.5× budget), then scores every survivor with `computeDreamScore`, persists each result to `recommendation_scores` with its components, weights, `algorithm_version` and `input_snapshot`, and returns the top three with their reasons and trade-offs.

`tripsService.generateItinerary` is fully deterministic: it selects places for the chosen destination ranked by theme match and Dream Score contribution, packs each day from a 09:00 local start while respecting `expected_visit_minutes`, opening hours and travel time from the maps adapter, inserts one seeded local business per day at the meal slot, then builds budget lines and runs `detectConflicts`. Idempotency keys are stored in Redis (or the memory cache) mapped to the resulting trip version.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules tests/integration
git commit -m "feat: add repositories and application services over the domain modules"
```

---

### Task 12: API route handlers

**Files:**
- Create: `src/app/api/v1/destinations/route.ts`, `src/app/api/v1/destinations/[id]/route.ts`
- Create: `src/app/api/v1/places/[id]/route.ts`, `.../crowd/route.ts`, `.../rules/route.ts`, `.../help/route.ts`
- Create: `src/app/api/v1/local-businesses/route.ts`, `src/app/api/v1/local-businesses/[id]/route.ts`
- Create: `src/app/api/v1/trip-briefs/parse/route.ts`
- Create: `src/app/api/v1/recommendations/destinations/route.ts`
- Create: `src/app/api/v1/trips/route.ts`, `src/app/api/v1/trips/[id]/route.ts`, `.../generate-itinerary/route.ts`, `.../itinerary/route.ts`, `.../revise/route.ts`, `.../offline-pack/route.ts`
- Create: `src/app/api/v1/admin/verifications/route.ts`, `.../[id]/decision/route.ts`, `src/app/api/v1/admin/crowd-overrides/route.ts`, `.../[id]/route.ts`
- Test: `tests/integration/api.test.ts`

Every endpoint listed in PRD Part II §7.3 gets a handler. All use the `route()` wrapper from Task 9.

- [ ] **Step 1: Write the failing API tests**

```ts
// tests/integration/api.test.ts
import { describe, expect, it } from 'vitest';

describe('API contract', () => {
  it('returns RFC 7807 problems with a requestId', async () => {
    const res = await fetch(`${BASE}/api/v1/trips/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body).toMatchObject({ type: expect.any(String), title: expect.any(String), status: 404 });
    expect(body.requestId).toBeTruthy();
  });

  it('rejects a state-changing request without a CSRF token', async () => {
    const res = await fetch(`${BASE}/api/v1/trips`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(403);
  });

  it('rejects an admin decision from a traveler session', async () => {
    const res = await asTraveler().post('/api/v1/admin/verifications/x/decision', { decision: 'approved' });
    expect(res.status).toBe(403);
  });

  it('requires a reason on a crowd override', async () => {
    const res = await asAdmin().post('/api/v1/admin/crowd-overrides', {
      placeId: somePlaceId, band: 'heavy', startsAt: iso(now), expiresAt: iso(inTwoHours),
    });
    expect(res.status).toBe(400);
  });

  it('writes an audit record for a crowd override', async () => {
    await asAdmin().post('/api/v1/admin/crowd-overrides', {
      placeId: somePlaceId, band: 'heavy', reason: 'Festival', startsAt: iso(now), expiresAt: iso(inTwoHours),
    });
    const rows = await sql`SELECT 1 FROM audit_logs WHERE action = 'crowd_override.created'`;
    expect(rows.length).toBeGreaterThan(0);
  });

  it('returns unknown crowd for a place whose data has expired', async () => {
    const res = await fetch(`${BASE}/api/v1/places/${placeWithExpiredCrowd}/crowd`);
    const body = await res.json();
    expect(body.band).toBe('unknown');
  });

  it('rate-limits repeated trip generation', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => asTraveler().post(`/api/v1/trips/${tripId}/generate-itinerary`, {})));
    expect(results.some((r) => r.status === 429)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration -- api`
Expected: FAIL — routes return 404.

- [ ] **Step 3: Implement the handlers**

Each handler is thin: validate, call the service, serialize. Admin decision and crowd-override handlers write `audit_logs` rows inside the same transaction as the change (PRD Part II §19). Trip generation, verification decisions and booking-reference creation accept an `Idempotency-Key` header. Itinerary PATCH requires an `If-Match` version and returns `409` with `actions: ['reload', 'overwrite']` on mismatch.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:integration -- api`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api tests/integration/api.test.ts
git commit -m "feat: add v1 API route handlers with validation, RBAC, audit and idempotency"
```

---

### Task 13: Design-system components (PRD Part I §5)

**Files:**
- Create: `src/components/ui/{Button,Card,Chip,Sheet,Skeleton,SegmentedControl,Field,Dialog}.tsx`
- Create: `src/components/patterns/{DestinationCard,DreamScoreBadge,DreamScoreDetail,CrowdStatusBadge,DreamVerifiedBadge,BudgetMeter,ItineraryItemCard,SourceFreshnessLabel,AiSuggestionCard,OfflineStatus}.tsx`
- Create: `src/components/states/{LoadingState,EmptyState,ErrorState,OfflineBanner,StaleNote,PermissionDeniedState}.tsx`
- Test: `tests/unit/components/crowd-status.test.tsx`, `tests/unit/components/dream-verified.test.tsx`, `tests/unit/components/budget-meter.test.tsx`

**Interfaces:**
- Produces: `<CrowdStatusBadge status={CrowdStatus} onWhy={() => void} />`
- Produces: `<DreamVerifiedBadge display={VerificationDisplay} />`
- Produces: `<BudgetMeter summary={BudgetSummary} />`
- Produces: `<SourceFreshnessLabel source={{ name, issuingAuthority, verifiedAt, reviewDueAt }} />`

- [ ] **Step 1: Write the failing component tests**

```tsx
// tests/unit/components/crowd-status.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CrowdStatusBadge } from '@/components/patterns/CrowdStatusBadge';

const status = {
  band: 'heavy' as const, label: 'Heavy crowd' as const, source: 'override' as const,
  confidence: 0.9, confidenceLabel: 'High confidence' as const,
  observedAt: new Date(), expiresAt: new Date(Date.now() + 3.6e6), isStale: false,
  explanation: 'Festival procession',
};

describe('CrowdStatusBadge', () => {
  it('renders a text label, not color alone', () => {
    render(<CrowdStatusBadge status={status} onWhy={() => {}} />);
    expect(screen.getByText('Heavy crowd')).toBeInTheDocument();
  });

  it('renders an icon with an accessible name', () => {
    render(<CrowdStatusBadge status={status} onWhy={() => {}} />);
    expect(screen.getByRole('img', { name: /heavy crowd/i })).toBeInTheDocument();
  });

  it('shows the last-updated time and confidence', () => {
    render(<CrowdStatusBadge status={status} onWhy={() => {}} />);
    expect(screen.getByText(/updated/i)).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
  });

  it('offers a Why action', () => {
    render(<CrowdStatusBadge status={status} onWhy={() => {}} />);
    expect(screen.getByRole('button', { name: /why/i })).toBeInTheDocument();
  });

  it('renders the unknown state without implying the place is quiet', () => {
    render(<CrowdStatusBadge status={{ ...status, band: 'unknown', label: 'Unknown', source: 'none' }} onWhy={() => {}} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.queryByText(/comfortable/i)).not.toBeInTheDocument();
  });

  it('never uses the word live', () => {
    const { container } = render(<CrowdStatusBadge status={status} onWhy={() => {}} />);
    expect(container.textContent).not.toMatch(/\blive\b/i);
  });
});
```

```tsx
// tests/unit/components/dream-verified.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DreamVerifiedBadge } from '@/components/patterns/DreamVerifiedBadge';

describe('DreamVerifiedBadge', () => {
  it('renders nothing when the verification is not approved', () => {
    const { container } = render(<DreamVerifiedBadge display={{ showBadge: false, status: 'under_review', knownLimitations: [] } as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the verification and next-review dates when approved', () => {
    render(<DreamVerifiedBadge display={{
      showBadge: true, status: 'approved',
      verifiedAt: new Date('2026-09-12'), expiresAt: new Date('2027-03-12'),
      nextReviewAt: new Date('2027-03-12'), knownLimitations: ['Limited mobile coverage'],
      reviewerType: 'district_tourism_office', checklistGroups: [],
    } as never} />);
    expect(screen.getByText(/dream verified/i)).toBeInTheDocument();
    expect(screen.getByText(/12 Sep 2026/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- components`
Expected: FAIL — components not found.

- [ ] **Step 3: Implement the components**

Each component follows its PRD §5 anatomy. `CrowdStatusBadge` renders an inline SVG with `role="img"` and an `<title>` matching the band, the text label, the time range, "updated N minutes ago", the confidence label, and a "Why?" button opening a sheet with `status.explanation`. `SourceFreshnessLabel` renders exactly the PRD's pattern — `District Tourism Office · Verified 12 Sep 2026` — and switches to a warning treatment past `reviewDueAt` rather than hiding. `BudgetMeter` renders total, planned, reserve, remaining, the confidence range, and the estimated-versus-live-priced counts, with a warning state when the high estimate exceeds the limit. `AiSuggestionCard` always renders accept, edit and dismiss.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- components`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components tests/unit/components
git commit -m "feat: add design-system components for crowd, verification, budget and sources"
```

---

### Task 14: Home (T01), Explore, and the traveler shell

**Files:**
- Create: `src/app/(traveler)/layout.tsx` — bottom navigation, skip link, live region
- Create: `src/app/(traveler)/page.tsx` — T01
- Create: `src/app/(traveler)/explore/page.tsx`
- Test: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/home.spec.ts
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 360, height: 800 } });

test('home shows the planning entry above the fold at 360x800', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: /where do you want to dream today/i });
  await expect(input).toBeInViewport();
});

test('home does not prompt for location, notifications or sign-in on first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});

test('a typed sentence opens Dream AI with the text preserved', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('4 day family trip from Coimbatore under 25000');
  await page.getByRole('button', { name: /start planning/i }).click();
  await expect(page).toHaveURL(/\/dream-ai/);
  await expect(page.getByText('4 day family trip from Coimbatore under 25000')).toBeVisible();
});

test('quick intent chips are reachable by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- home`
Expected: FAIL — the page does not exist yet.

- [ ] **Step 3: Implement the shell and home page**

The traveler layout renders a skip link, a `<main>` landmark, an `aria-live="polite"` region used by AI generation and budget updates, and bottom navigation (Home, Explore, Dream AI, Trips, Profile) with 44px targets. Home renders the hero prompt "Where do you want to dream today?", the combined search/AI input, the five quick intent chips (Weekend, Within ₹15,000, Low crowd, Nature, Heritage), and the five discovery sections from PRD T01, each as a server component reading from `catalogService`. Empty personalization falls back to seasonal pilot-region content. No permission prompt fires on load.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- home`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\) tests/e2e/home.spec.ts
git commit -m "feat: add traveler shell and home screen (T01)"
```

---

### Task 15: Dream AI conversation (T03)

**Files:**
- Create: `src/app/(traveler)/dream-ai/page.tsx`, `src/app/(traveler)/dream-ai/Conversation.tsx`, `src/app/(traveler)/dream-ai/TripSummaryPanel.tsx`
- Test: `tests/e2e/dream-ai.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/dream-ai.spec.ts
import { expect, test } from '@playwright/test';

test('extracted values are highlighted after the first message', async ({ page }) => {
  await page.goto('/dream-ai?q=4+day+family+trip+from+Coimbatore+in+December+under+25000');
  await expect(page.getByTestId('brief-durationDays')).toContainText('4');
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
  await expect(page.getByTestId('brief-budget')).toContainText('₹25,000');
});

test('a summary value can be corrected without retyping the request', async ({ page }) => {
  await page.goto('/dream-ai?q=4+day+trip+from+Coimbatore+under+25000');
  await page.getByTestId('brief-durationDays').click();
  await page.getByRole('spinbutton', { name: /days/i }).fill('3');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByTestId('brief-durationDays')).toContainText('3');
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
});

test('asks at most two clarifications before showing options', async ({ page }) => {
  await page.goto('/dream-ai?q=somewhere+nice');
  await page.getByRole('textbox', { name: /message/i }).fill('3 days');
  await page.getByRole('button', { name: /send/i }).click();
  await page.getByRole('textbox', { name: /message/i }).fill('from Coimbatore');
  await page.getByRole('button', { name: /send/i }).click();
  await expect(page.getByRole('button', { name: /see destinations/i })).toBeVisible();
});

test('generation progress announces its stages', async ({ page }) => {
  await page.goto('/dream-ai?q=4+day+family+trip+from+Coimbatore+under+25000');
  await page.getByRole('button', { name: /see destinations/i }).click();
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText(/understanding your request|finding places|checking constraints|creating your plan/i);
});

test('the trip summary survives an AI failure', async ({ page }) => {
  await page.route('**/api/v1/trip-briefs/parse', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.goto('/dream-ai?q=4+day+trip+from+Coimbatore+under+25000');
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
  await expect(page.getByRole('link', { name: /search destinations/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- dream-ai`
Expected: FAIL.

- [ ] **Step 3: Implement the conversation**

The page reads `?q=` to seed the first user message so text carries over from Home. `Conversation` posts to `/api/v1/trip-briefs/parse`, renders the assistant's single focused clarification, and stops after two rounds. `TripSummaryPanel` is a bottom sheet on mobile and a side panel on desktop, showing the ten brief fields with `data-testid="brief-<field>"`, each tap-to-edit. The four generation stages write into the layout's live region. When the parse endpoint fails, the panel keeps its state and a "Search destinations" link offers the deterministic path.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- dream-ai`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\)/dream-ai tests/e2e/dream-ai.spec.ts
git commit -m "feat: add Dream AI conversation with editable trip brief (T03)"
```

---

### Task 16: Shortlist (T04), Compare (T05), Destination Detail (T06), Dream Score Detail (T07)

**Files:**
- Create: `src/app/(traveler)/shortlist/page.tsx`, `src/app/(traveler)/compare/page.tsx`
- Create: `src/app/(traveler)/destinations/[slug]/page.tsx`, `src/app/(traveler)/destinations/[slug]/score/page.tsx`
- Test: `tests/e2e/shortlist.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/shortlist.spec.ts
import { expect, test } from '@playwright/test';

test('each option shows one advantage and one trade-off', async ({ page }) => {
  await gotoShortlist(page);
  const cards = page.getByTestId('shortlist-option');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    await expect(card.getByTestId('advantage')).toBeVisible();
    await expect(card.getByTestId('trade-off')).toBeVisible();
  }
});

test('estimated figures are labelled as estimates', async ({ page }) => {
  await gotoShortlist(page);
  await expect(page.getByTestId('shortlist-option').first().getByText(/estimated/i)).toBeVisible();
});

test('the score is labelled Trip match, never Safety score', async ({ page }) => {
  await gotoShortlist(page);
  await expect(page.getByText(/trip match/i).first()).toBeVisible();
  await expect(page.getByText(/safety score/i)).toHaveCount(0);
});

test('Dream Score detail explains dimensions, weights and missing data', async ({ page }) => {
  await gotoShortlist(page);
  await page.getByRole('link', { name: /why this matches/i }).first().click();
  await expect(page.getByText(/interest match/i)).toBeVisible();
  await expect(page.getByText(/25%/)).toBeVisible();
  await expect(page.getByTestId('missing-information')).toBeVisible();
});

test('changing what matters recalculates the score', async ({ page }) => {
  await page.goto('/destinations/ooty-nilgiris/score');
  const before = await page.getByTestId('total-score').textContent();
  await page.getByRole('slider', { name: /crowd comfort/i }).fill('100');
  await page.getByRole('button', { name: /apply/i }).click();
  await expect(page.getByTestId('total-score')).not.toHaveText(before!);
});

test('selecting a destination carries the brief into itinerary generation', async ({ page }) => {
  await gotoShortlist(page);
  await page.getByRole('button', { name: /build my trip/i }).first().click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+/);
  await expect(page.getByTestId('trip-duration')).toContainText('4');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- shortlist`
Expected: FAIL.

- [ ] **Step 3: Implement the four screens**

Shortlist renders exactly three `DestinationCard`s with the nine PRD T04 content fields, sort controls (best match / lower cost / shorter travel / quieter), and a compare selector limited to three. Compare uses a single selected column with horizontal switching on mobile and fixed row labels, covering the ten T05 rows in identical units. Destination Detail follows the ten-section order from T06 with the sticky "Build my trip" action that does not overlay content. Dream Score Detail renders the seven dimensions with their PRD weights, plain-language reasons, preferences used, missing information, and "Change what matters" sliders that re-run `computeDreamScore` and explain the weight change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- shortlist`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\)/shortlist src/app/\(traveler\)/compare src/app/\(traveler\)/destinations tests/e2e/shortlist.spec.ts
git commit -m "feat: add shortlist, compare, destination detail and Dream Score detail (T04-T07)"
```

---

### Task 17: Budget Planner (T08)

**Files:**
- Create: `src/app/(traveler)/trips/[id]/budget/page.tsx`, `BudgetEditor.tsx`, `CategoryAllocation.tsx`
- Test: `tests/e2e/budget.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/budget.spec.ts
import { expect, test } from '@playwright/test';

test('totals update immediately after an itinerary change', async ({ page }) => {
  await gotoTripBudget(page);
  const before = await page.getByTestId('expected-total').textContent();
  await page.getByRole('button', { name: /remove/i }).first().click();
  await expect(page.getByTestId('expected-total')).not.toHaveText(before!);
});

test('price sources are labelled distinctly', async ({ page }) => {
  await gotoTripBudget(page);
  await page.getByRole('button', { name: /stay/i }).click();
  await expect(page.getByTestId('price-state').first()).toHaveText(/live|partner|historical|manual/i);
});

test('a locked category is not changed by a budget style switch', async ({ page }) => {
  await gotoTripBudget(page);
  await page.getByRole('switch', { name: /lock stay/i }).click();
  const stay = await page.getByTestId('category-stay-amount').textContent();
  await page.getByRole('radio', { name: /save more/i }).click();
  await expect(page.getByTestId('category-stay-amount')).toHaveText(stay!);
});

test('warns when the high estimate exceeds the budget', async ({ page }) => {
  await gotoTripBudget(page);
  await page.getByRole('spinbutton', { name: /total budget/i }).fill('8000');
  await expect(page.getByRole('alert')).toContainText(/high estimate/i);
});

test('budget changes are announced politely', async ({ page }) => {
  await gotoTripBudget(page);
  await page.getByRole('spinbutton', { name: /total budget/i }).fill('30000');
  await expect(page.locator('[aria-live="polite"]')).toContainText(/₹/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- budget`
Expected: FAIL.

- [ ] **Step 3: Implement the budget planner**

The page renders the five T08 sections, drives all arithmetic through `summarizeBudget`, exposes the four states (within budget, high estimate over budget, missing price data, price refresh required), and writes every total change into the live region. Value animation is capped at 300ms and disabled under `prefers-reduced-motion`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- budget`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\)/trips tests/e2e/budget.spec.ts
git commit -m "feat: add budget planner with price-source labelling and trade-offs (T08)"
```

---

### Task 18: Itinerary and map (T09), place detail (T10)

**Files:**
- Create: `src/app/(traveler)/trips/[id]/page.tsx`, `Timeline.tsx`, `TripMap.tsx`, `ConflictBanner.tsx`
- Create: `src/app/(traveler)/places/[slug]/page.tsx`
- Create: `src/platform/maps/index.ts`, `src/platform/maps/haversine.ts`, `src/platform/maps/osrm.ts`
- Test: `tests/e2e/itinerary.spec.ts`

**Interfaces:**
- Produces: `interface MapsProvider { route(from: LatLng, to: LatLng, mode: TravelMode): Promise<{ minutes: number; meters: number }>; }` — `HaversineMapsProvider` (offline-safe, distance ÷ mode speed) is the default; `OsrmMapsProvider` is used when `OSRM_BASE_URL` is set, falling back to haversine on failure

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/itinerary.spec.ts
import { expect, test } from '@playwright/test';

test('reordering recalculates travel time and budget', async ({ page }) => {
  await gotoTrip(page);
  const budgetBefore = await page.getByTestId('expected-total').textContent();
  await dragItem(page, 0, 2);
  await expect(page.getByTestId('itinerary-item').nth(2)).toHaveAttribute('data-item-id', /.+/);
  await expect(page.getByTestId('travel-time').nth(1)).toBeVisible();
  await expect(page.getByTestId('expected-total')).not.toHaveText(budgetBefore!);
});

test('optimization never moves a locked item', async ({ page }) => {
  await gotoTrip(page);
  await page.getByRole('switch', { name: /lock/i }).first().click();
  const lockedId = await page.getByTestId('itinerary-item').first().getAttribute('data-item-id');
  await page.getByRole('button', { name: /optimize/i }).click();
  await expect(page.getByTestId('itinerary-item').first()).toHaveAttribute('data-item-id', lockedId!);
});

test('undo is available after an AI change', async ({ page }) => {
  await gotoTrip(page);
  await page.getByRole('button', { name: /optimize/i }).click();
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();
  await page.getByRole('button', { name: /undo/i }).click();
});

test('map pins have a list-view equivalent', async ({ page }) => {
  await gotoTrip(page);
  await page.getByRole('tab', { name: /map/i }).click();
  await expect(page.getByRole('list', { name: /places on this map/i })).toBeVisible();
});

test('a scheduling conflict is shown inline with an action', async ({ page }) => {
  await gotoTripWithConflict(page);
  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button')).toBeVisible();
});

test('the sticky budget summary never covers content', async ({ page }) => {
  await gotoTrip(page);
  await page.keyboard.press('End');
  await expect(page.getByTestId('itinerary-item').last()).toBeInViewport();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- itinerary`
Expected: FAIL.

- [ ] **Step 3: Implement the itinerary surface**

Mobile uses a Timeline/Map segmented control; desktop a 45/55 split. `TripMap` is a client-only Leaflet map with OSM tiles, rendering one marker per item plus a polyline, and a parallel `<ul>` of the same places for keyboard and screen-reader users. Drag-and-drop uses the HTML5 drag API with a keyboard alternative (move up / move down buttons), calls `reorderItems`, then `recalculateSchedule` and `summarizeBudget`, and PATCHes with the trip version. "Optimize unlocked items" only reorders items where `lockedByUser === false` and pushes the previous state onto an undo stack. Conflicts render as `role="alert"` banners with the suggested action as a button.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- itinerary`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\)/trips src/app/\(traveler\)/places src/platform/maps tests/e2e/itinerary.spec.ts
git commit -m "feat: add itinerary timeline, map, conflicts and place detail (T09-T10)"
```

---

### Task 19: Trust surfaces — verification detail (T11), business detail (T12), rules (T20), nearby help (T18), story (T19)

**Files:**
- Create: `src/app/(traveler)/places/[slug]/verification/page.tsx`
- Create: `src/app/(traveler)/businesses/[slug]/page.tsx`
- Create: `src/app/(traveler)/places/[slug]/rules/page.tsx`
- Create: `src/app/(traveler)/places/[slug]/story/page.tsx`
- Create: `src/app/(traveler)/help/page.tsx`
- Test: `tests/e2e/trust.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/trust.spec.ts
import { expect, test } from '@playwright/test';

test('known limitations appear before the visit action', async ({ page }) => {
  await page.goto('/places/sandynalla-viewpoint/verification');
  const limitations = page.getByTestId('known-limitations');
  const action = page.getByRole('button', { name: /add to trip/i });
  const limBox = await limitations.boundingBox();
  const actionBox = await action.boundingBox();
  expect(limBox!.y).toBeLessThan(actionBox!.y);
});

test('the verification sheet shows date, expiry, attributes, reviewer and a report action', async ({ page }) => {
  await page.goto('/places/sandynalla-viewpoint/verification');
  await expect(page.getByTestId('verified-on')).toBeVisible();
  await expect(page.getByTestId('next-review')).toBeVisible();
  await expect(page.getByTestId('reviewer-type')).toBeVisible();
  await expect(page.getByRole('button', { name: /report a concern/i })).toBeVisible();
});

test('a sponsored listing is unmistakably labelled', async ({ page }) => {
  await page.goto('/businesses/nilgiri-tea-collective');
  await expect(page.getByTestId('sponsored-label')).toHaveText(/sponsored/i);
  await expect(page.getByTestId('organic-reason')).toBeVisible();
});

test('business hours are not claimed as open now', async ({ page }) => {
  await page.goto('/businesses/nilgiri-tea-collective');
  await expect(page.getByText(/open now/i)).toHaveCount(0);
  await expect(page.getByTestId('hours-last-updated')).toBeVisible();
});

test('a rule card carries authority, effective date and source link', async ({ page }) => {
  await page.goto('/places/mukurthi-trail/rules');
  const card = page.getByTestId('rule-card').first();
  await expect(card.getByTestId('issuing-authority')).toBeVisible();
  await expect(card.getByTestId('last-verified')).toBeVisible();
  await expect(card.getByRole('link', { name: /source/i })).toBeVisible();
});

test('a stale rule shows a warning instead of disappearing', async ({ page }) => {
  await page.goto('/places/mukurthi-trail/rules');
  await expect(page.getByTestId('stale-warning').first()).toBeVisible();
});

test('nearby help is reachable in two taps and works offline', async ({ page, context }) => {
  await page.goto('/trips/demo');
  await page.getByRole('link', { name: /help/i }).click();
  await expect(page.getByRole('link', { name: /call 112/i })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: /call 112/i })).toBeVisible();
  await expect(page.getByText(/live availability is unknown/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- trust`
Expected: FAIL.

- [ ] **Step 3: Implement the trust screens**

T11 renders the nine checklist groups from the seeded verification, with `known_limitations` placed above the action. T12 renders the T12 content list, separating the organic reason from any sponsored label, and never claims "open now" — only stored hours with a last-updated date. T20 renders rule cards with the seven required fields and a stale treatment past `review_due_at`. T18 puts the three top actions first (emergency number, saved contact, share location), then facility categories from `helpRepository.findNearby`, and is pre-cached by the service worker so it survives offline with an explicit "Live availability is unknown" note.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- trust`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(traveler\) tests/e2e/trust.spec.ts
git commit -m "feat: add verification, business, rules, story and nearby help screens"
```

---

### Task 20: PWA, offline trip pack (T21), Trip Mode (T15–T17)

**Files:**
- Create: `public/sw.js`, `public/manifest.webmanifest`
- Create: `src/modules/offline/domain/manifest.ts`, `src/modules/offline/service.ts`
- Create: `src/app/(traveler)/trips/[id]/offline/page.tsx`
- Create: `src/app/(traveler)/trips/[id]/overview/page.tsx`
- Create: `src/app/(traveler)/trips/[id]/mode/page.tsx`, `.../mode/alerts/page.tsx`
- Test: `tests/unit/offline/manifest.test.ts`, `tests/e2e/offline.spec.ts`

**Interfaces:**
- Produces: `buildOfflineManifest(trip: Trip, now: Date): OfflineManifest` matching PRD §11.2 exactly — `{ tripId, generatedAt, expiresAt, resources: Array<{ url, required }> }`

- [ ] **Step 1: Write the failing offline tests**

```ts
// tests/unit/offline/manifest.test.ts
import { describe, expect, it } from 'vitest';
import { buildOfflineManifest } from '@/modules/offline/domain/manifest';

describe('buildOfflineManifest', () => {
  it('matches the PRD manifest shape', () => {
    const manifest = buildOfflineManifest(tripFixture, new Date('2026-09-21T09:00:00Z'));
    expect(manifest.generatedAt).toBe('2026-09-21T09:00:00.000Z');
    expect(manifest.expiresAt).toBe('2026-09-22T09:00:00.000Z');
  });

  it('always includes the summary, help and rules resources as required', () => {
    const manifest = buildOfflineManifest(tripFixture, new Date());
    const required = manifest.resources.filter((r) => r.required).map((r) => r.url);
    expect(required).toEqual(expect.arrayContaining([
      `/api/v1/trips/${tripFixture.id}/offline-summary`,
      `/api/v1/trips/${tripFixture.id}/help`,
      `/api/v1/trips/${tripFixture.id}/rules`,
    ]));
  });

  it('includes the default pack contents from T21', () => {
    const urls = buildOfflineManifest(tripFixture, new Date()).resources.map((r) => r.url).join(' ');
    for (const part of ['offline-summary', 'help', 'rules', 'stories', 'businesses']) {
      expect(urls).toContain(part);
    }
  });
});
```

```ts
// tests/e2e/offline.spec.ts
import { expect, test } from '@playwright/test';

test('a saved trip opens offline with a timestamp', async ({ page, context }) => {
  await page.goto('/trips/demo/offline');
  await page.getByRole('button', { name: /save for offline/i }).click();
  await expect(page.getByText(/saved for offline/i)).toBeVisible();
  await context.setOffline(true);
  await page.goto('/trips/demo/mode');
  await expect(page.getByTestId('next-activity')).toBeVisible();
  await expect(page.getByText(/viewing saved information from/i)).toBeVisible();
});

test('cached crowd and weather are never labelled as current', async ({ page, context }) => {
  await page.goto('/trips/demo/offline');
  await page.getByRole('button', { name: /save for offline/i }).click();
  await context.setOffline(true);
  await page.goto('/trips/demo/mode');
  await expect(page.getByText(/crowd and weather unavailable/i)).toBeVisible();
});

test('Trip Mode puts the next action above any recommendation', async ({ page }) => {
  await page.goto('/trips/demo/mode');
  const next = await page.getByTestId('next-activity').boundingBox();
  const promo = await page.getByTestId('local-recommendation').boundingBox();
  if (promo) expect(next!.y).toBeLessThan(promo.y);
});

test('alerts are ordered by the PRD priority', async ({ page }) => {
  await page.goto('/trips/demo/mode/alerts');
  const kinds = await page.getByTestId('alert').evaluateAll((els) => els.map((e) => e.getAttribute('data-priority')));
  expect(kinds).toEqual([...kinds].sort((a, b) => Number(a) - Number(b)));
});

test('Nearby Help stays reachable throughout Trip Mode', async ({ page }) => {
  await page.goto('/trips/demo/mode');
  await expect(page.getByRole('link', { name: /help/i })).toBeVisible();
  await page.goto('/trips/demo/mode/alerts');
  await expect(page.getByRole('link', { name: /help/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- offline && npm run test:e2e -- offline`
Expected: FAIL.

- [ ] **Step 3: Implement the PWA and Trip Mode**

`public/sw.js` implements the five PRD §11.1 strategies by route: cache-first for the versioned app shell, stale-while-revalidate for public content, an explicit user-managed cache named `trip-pack-<tripId>-v<version>` for saved packs, network-first with a 2.5s timeout and a stale-labelled cached fallback for crowd/weather/rules/prices, and network-only for auth and mutations. Every cached API response is stored with the `X-Cached-At` header so the UI can render "Viewing saved information from 8:30 AM".

The offline pack screen implements all six T21 states (not saved, downloading, saved, update available, partially failed, storage limit reached), showing per-resource progress. Trip Mode replaces the bottom navigation with Next / Map / Alerts / Help, renders the next activity with a departure countdown above everything else, and suppresses decorative motion. Alerts sort by the six T17 priorities via a `data-priority` attribute.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- offline && npm run test:e2e -- offline`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add public src/modules/offline src/app/\(traveler\)/trips tests
git commit -m "feat: add service worker, offline trip packs and Trip Mode (T15-T17, T21)"
```

---

### Task 21: Admin — review queue (A02), verification workspace (A03), crowd operations (A04)

**Files:**
- Create: `src/app/(admin)/layout.tsx`
- Create: `src/app/(admin)/admin/verifications/page.tsx`
- Create: `src/app/(admin)/admin/verifications/[id]/page.tsx`
- Create: `src/app/(admin)/admin/crowd/page.tsx`
- Test: `tests/e2e/admin.spec.ts`

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/admin.spec.ts
import { expect, test } from '@playwright/test';

test('the review queue shows the PRD columns', async ({ page }) => {
  await signInAsVerifier(page);
  await page.goto('/admin/verifications');
  for (const column of ['Place', 'Submitter', 'District', 'Risk', 'Evidence', 'Reviewer', 'Age', 'Status']) {
    await expect(page.getByRole('columnheader', { name: new RegExp(column, 'i') })).toBeVisible();
  }
});

test('a decision requires a reason', async ({ page }) => {
  await signInAsVerifier(page);
  await page.goto('/admin/verifications');
  await page.getByRole('link', { name: /review/i }).first().click();
  await page.getByRole('button', { name: /approve/i }).click();
  await expect(page.getByRole('alert')).toContainText(/reason is required/i);
});

test('an approval writes an audit record and shows the badge to travelers', async ({ page }) => {
  await signInAsVerifier(page);
  await approveFirstPending(page, 'Field check completed on 18 Dec 2026');
  await page.goto('/places/newly-approved-gem');
  await expect(page.getByText(/dream verified/i)).toBeVisible();
});

test('a crowd override requires reason, start, expiry and area', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/crowd');
  await page.getByRole('button', { name: /override/i }).first().click();
  await page.getByRole('button', { name: /save override/i }).click();
  await expect(page.getByRole('alert')).toContainText(/reason/i);
});

test('an active override immediately changes the traveler-facing status', async ({ page }) => {
  await signInAsAdmin(page);
  await createOverride(page, { place: 'Ooty Botanical Garden', band: 'heavy', reason: 'Procession' });
  await page.goto('/places/ooty-botanical-garden');
  await expect(page.getByText('Heavy crowd')).toBeVisible();
  await expect(page.getByText(/procession/i)).toBeVisible();
});

test('a traveler cannot open the admin area', async ({ page }) => {
  await signInAsTraveler(page);
  await page.goto('/admin/verifications');
  await expect(page.getByText(/not available/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- admin`
Expected: FAIL.

- [ ] **Step 3: Implement the admin screens**

The admin layout checks the session's roles server-side and renders a not-available page rather than leaking the existence of records. A02 is a sortable table with the eight PRD columns. A03 is a split view with place details, map, evidence, the nine-group checklist, source links, prior decisions, and the four decision actions, each requiring a reason before submitting. A04 lists places with current status, source health, observation history, forecast, confidence, and an override form requiring band, reason, start, expiry and affected area. Every decision and override writes an `audit_logs` row.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- admin`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\) tests/e2e/admin.spec.ts
git commit -m "feat: add admin review queue, verification workspace and crowd operations (A02-A04)"
```

---

### Task 22: The demo journey end-to-end test

The single test that proves the PRD's required demonstration journey.

**Files:**
- Create: `tests/e2e/demo-journey.spec.ts`

- [ ] **Step 1: Write the failing journey test**

```ts
// tests/e2e/demo-journey.spec.ts
import { expect, test } from '@playwright/test';

test('a traveler completes the full SIH demonstration journey', async ({ page, context }) => {
  // Ask Dream AI
  await page.goto('/');
  await page.getByRole('textbox').fill('4 day family trip from Coimbatore in December within ₹25,000, nature and heritage, avoid crowds');
  await page.getByRole('button', { name: /start planning/i }).click();

  // Confirm the structured brief
  await expect(page.getByTestId('brief-durationDays')).toContainText('4');
  await expect(page.getByTestId('brief-budget')).toContainText('₹25,000');
  await page.getByRole('button', { name: /see destinations/i }).click();

  // Compare destinations and inspect Dream Score
  await expect(page.getByTestId('shortlist-option')).toHaveCount(3);
  await page.getByRole('link', { name: /why this matches/i }).first().click();
  await expect(page.getByText(/trip match/i)).toBeVisible();
  await page.goBack();

  // Set the budget, generate the itinerary
  await page.getByRole('button', { name: /build my trip/i }).first().click();
  await expect(page.getByTestId('itinerary-item').first()).toBeVisible();
  await expect(page.getByTestId('expected-total')).toBeVisible();

  // Edit the itinerary
  await page.getByRole('switch', { name: /lock/i }).first().click();
  await page.getByRole('button', { name: /optimize/i }).click();
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();

  // View map, crowd and trust information
  await page.getByRole('tab', { name: /map/i }).click();
  await expect(page.getByRole('list', { name: /places on this map/i })).toBeVisible();
  await page.getByRole('tab', { name: /timeline/i }).click();
  await expect(page.getByTestId('crowd-status').first()).toBeVisible();

  // Add a local business
  await page.getByRole('button', { name: /support local/i }).click();
  await page.getByRole('button', { name: /add to itinerary/i }).first().click();
  await expect(page.getByTestId('itinerary-item').filter({ hasText: /tea|artisan|kitchen/i })).toHaveCount(1);

  // Save an offline trip pack
  await page.getByRole('link', { name: /save for offline/i }).click();
  await page.getByRole('button', { name: /save for offline/i }).click();
  await expect(page.getByText(/saved for offline/i)).toBeVisible();

  // Enter Trip Mode
  await page.getByRole('button', { name: /start trip mode/i }).click();
  await expect(page.getByTestId('next-activity')).toBeVisible();

  // Access nearby help, including offline
  await context.setOffline(true);
  await page.getByRole('link', { name: /help/i }).click();
  await expect(page.getByRole('link', { name: /112/ })).toBeVisible();
  await expect(page.getByText(/live availability is unknown/i)).toBeVisible();
});

test('the journey reaches the first shortlist in under three minutes of wall time', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await page.getByRole('textbox').fill('4 day family trip from Coimbatore within ₹25,000');
  await page.getByRole('button', { name: /start planning/i }).click();
  await page.getByRole('button', { name: /see destinations/i }).click();
  await expect(page.getByTestId('shortlist-option').first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(180_000);
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:e2e -- demo-journey`
Expected: FAIL initially, then PASS once every preceding task is complete. Fix the gaps it exposes rather than weakening the test.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/demo-journey.spec.ts
git commit -m "test: add end-to-end SIH demonstration journey"
```

---

### Task 23: Degradation and resilience

Proves PRD §14.2's degradation examples.

**Files:**
- Modify: `src/platform/ai/gateway.ts`, `src/platform/maps/index.ts`, `src/platform/weather/index.ts`
- Create: `src/platform/resilience/circuit-breaker.ts`, `src/platform/resilience/with-timeout.ts`
- Create: `src/app/api/health/route.ts`, `src/app/api/ready/route.ts`
- Test: `tests/unit/resilience/circuit-breaker.test.ts`, `tests/e2e/degradation.spec.ts`

- [ ] **Step 1: Write the failing degradation tests**

```ts
// tests/unit/resilience/circuit-breaker.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '@/platform/resilience/circuit-breaker';

describe('CircuitBreaker', () => {
  it('opens after the failure threshold and stops calling through', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const breaker = new CircuitBreaker({ failureThreshold: 3, resetMs: 10_000 });
    for (let i = 0; i < 3; i++) await breaker.run(fn).catch(() => {});
    await breaker.run(fn).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(3);
    expect(breaker.state).toBe('open');
  });

  it('half-opens after the reset window and closes on success', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ok');
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetMs: 1_000 });
    await breaker.run(fn).catch(() => {});
    expect(breaker.state).toBe('open');
    vi.advanceTimersByTime(1_001);
    await expect(breaker.run(fn)).resolves.toBe('ok');
    expect(breaker.state).toBe('closed');
    vi.useRealTimers();
  });
});
```

```ts
// tests/e2e/degradation.spec.ts
import { expect, test } from '@playwright/test';

test('an LLM outage falls back to the structured form and deterministic results', async ({ page }) => {
  await page.route('**/v1/messages', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.goto('/dream-ai?q=4+day+trip+from+Coimbatore+under+25000');
  await expect(page.getByTestId('brief-origin')).toContainText('Coimbatore');
  await expect(page.getByText(/without the assistant/i)).toBeVisible();
  await page.getByRole('button', { name: /see destinations/i }).click();
  await expect(page.getByTestId('shortlist-option')).toHaveCount(3);
});

test('a crowd source outage shows Unknown with labelled historical context', async ({ page }) => {
  await page.goto('/places/ooty-botanical-garden?simulate=crowd-outage');
  await expect(page.getByText('Unknown')).toBeVisible();
  await expect(page.getByText(/historical/i)).toBeVisible();
  await expect(page.getByText(/comfortable/i)).toHaveCount(0);
});

test('a routing outage still shows coordinates and an external map link', async ({ page }) => {
  await page.goto('/trips/demo?simulate=routing-outage');
  await expect(page.getByRole('link', { name: /open in maps/i }).first()).toBeVisible();
});

test('the health and readiness endpoints report dependency state', async ({ request }) => {
  expect((await request.get('/api/health')).status()).toBe(200);
  const ready = await request.get('/api/ready');
  expect(await ready.json()).toMatchObject({ database: 'ok' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- resilience && npm run test:e2e -- degradation`
Expected: FAIL.

- [ ] **Step 3: Implement the resilience layer**

Every provider call is wrapped in `withTimeout` and a `CircuitBreaker`. The maps adapter falls back from OSRM to haversine, the weather adapter to seeded historical values labelled as such, and the AI gateway to `DeterministicGateway` with a visible "Planning without the assistant right now" note. `?simulate=` query parameters are honoured **only** when `NODE_ENV !== 'production'`, so the demo can show failure modes without shipping a production backdoor.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit -- resilience && npm run test:e2e -- degradation`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/platform tests
git commit -m "feat: add timeouts, circuit breakers and provider degradation paths"
```

---

### Task 24: Architecture guards, accessibility sweep, and the demo runbook

**Files:**
- Create: `tests/unit/architecture/dependency-rule.test.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `README.md`, `docs/demo-runbook.md`
- Modify: `package.json` — add `verify` script

- [ ] **Step 1: Write the failing guard tests**

```ts
// tests/unit/architecture/dependency-rule.test.ts
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = [/from ['"]next\//, /from ['"]postgres['"]/, /from ['"]@anthropic-ai\//, /from ['"]react['"]/, /from ['"]ioredis['"]/];

describe('dependency rule (PRD Part II §3.3)', () => {
  it('keeps domain modules free of framework and provider imports', () => {
    const files = globSync('src/modules/*/domain/**/*.ts');
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) violations.push(`${file} matches ${pattern}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
```

```ts
// tests/e2e/accessibility.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = ['/', '/dream-ai', '/shortlist', '/destinations/ooty-nilgiris', '/trips/demo', '/trips/demo/budget', '/trips/demo/mode', '/help', '/places/mukurthi-trail/rules'];

for (const path of PAGES) {
  test(`${path} has no critical or serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
    const blocking = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(blocking.map((v) => `${v.id} on ${path}`)).toEqual([]);
  });

  test(`${path} survives 200% text zoom without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(path);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('every interactive target is at least 44 by 44 CSS pixels', async ({ page }) => {
  await page.goto('/');
  const small = await page.getByRole('button').evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
  expect(small).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit -- architecture && npm run test:e2e -- accessibility`
Expected: FAIL where violations exist. Fix the source, never the assertion.

- [ ] **Step 3: Fix violations and write the documentation**

`README.md` documents the one-command setup the architecture acceptance criteria require:

```bash
cp .env.example .env
npm install
npm run setup   # docker compose up, migrate, seed
npm run dev
```

`docs/demo-runbook.md` walks the SIH demonstration journey step by step with the exact seeded records to use, the admin override scenario, the offline demonstration (DevTools → Network → Offline), and the three degradation demonstrations from Task 23. It states plainly that all data is seeded demonstration data.

Add to `package.json`:

```json
"verify": "npm run typecheck && npm run lint && npm run test:unit && npm run test:integration && npm run test:e2e"
```

- [ ] **Step 4: Run the full verification**

Run: `npm run verify`
Expected: PASS across all four stages.

- [ ] **Step 5: Commit**

```bash
git add tests README.md docs package.json
git commit -m "test: add dependency-rule and accessibility guards, and demo runbook"
```

---

## Acceptance

The plan is complete when `npm run verify` passes and every applicable line of PRD Part II §19 holds:

- [ ] A single command starts the local web app and its database and Redis dependencies (`npm run setup && npm run dev`).
- [ ] Migrations create PostGIS and pgvector structures successfully (Task 2).
- [ ] Public destination search supports radius and theme filtering (Task 11).
- [ ] Trip generation returns schema-valid output and records source IDs (Task 11).
- [ ] Dream Score and budget totals are deterministic and testable without an LLM (Tasks 4, 6).
- [ ] Expired crowd data returns Unknown (Task 5).
- [ ] Only an approved, unexpired verification displays Dream Verified (Task 8).
- [ ] Users cannot read or modify another user's trip (Task 9).
- [ ] Business owners cannot approve their own verification (Task 8).
- [ ] Admin decisions and crowd overrides create audit records (Task 12).
- [ ] Offline trip packs display timestamps and never label cached crowd or weather as live (Task 20).
- [ ] The system degrades gracefully when AI, map, weather or push providers fail (Task 23).
- [ ] Seeded demonstration data remains identifiable in storage and UI (Task 3).

Out of scope for this plan, deferred to a later one: business owner screens B01–B06, admin screens A01 and A05–A08, the booking provider integration behind T13, web push delivery, the pgvector retrieval path for Dream AI grounding, and the 50-prompt AI evaluation set from PRD Part II §8.6.
