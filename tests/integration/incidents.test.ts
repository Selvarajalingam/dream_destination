import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { catalogRepository } from '@/modules/catalog/repository';
import { incidentsRepository } from '@/modules/incidents/repository';
import { incidentsService } from '@/modules/incidents/service';
import { initialSeverity, redactReport } from '@/modules/incidents/domain/incidents';
import { tripsRepository } from '@/modules/trips/repository';
import { tripsService } from '@/modules/trips/service';
import { cleanupTestUsers, createTestUser } from './helpers';

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

const adminId = async (): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'admin@demo.dreamdestination.invalid'`;
  return row.id;
};

const fileReport = async (slug: string, category: Parameters<typeof initialSeverity>[0], text: string) => {
  const entity = await incidentsRepository.resolveEntity('place', slug);
  return incidentsRepository.create({
    reporterUserId: null,
    entityType: 'place',
    entityId: entity!.id,
    category,
    severity: initialSeverity(category),
    description: redactReport(text),
  });
};

describe('incident queue (A06)', () => {
  it('lists the seeded open reports, most severe first', async () => {
    const rows = await incidentsRepository.list();
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0].severity).toBe('critical');

    // Ordered by severity, whatever else other test files have filed.
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const ranks = rows.map((row) => rank[row.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('never exposes the reporter to triage reads', async () => {
    const [row] = await incidentsRepository.list();
    const detail = await incidentsRepository.findById(row.id);

    for (const record of [row, detail]) {
      expect(Object.keys(record!)).not.toContain('reporterUserId');
      expect(Object.keys(record!)).not.toContain('reporter_user_id');
    }
  });

  it('shows an owner response on the business report that has one', async () => {
    const rows = await incidentsRepository.list();
    const business = rows.find((row) => row.entityType === 'business');
    const detail = await incidentsRepository.findById(business!.id);
    expect(detail!.ownerResponse).toMatch(/close an hour early on Mondays/);
  });

  it('stores a new report redacted of contact details', async () => {
    const id = await fileReport(
      'ooty-lake',
      'information',
      'Boat hours on the board are wrong. Call me on 98765 43210 or mail a.b@example.com',
    );
    const detail = await incidentsRepository.findById(id);
    expect(detail!.description).not.toMatch(/98765|example\.com/);
    expect(detail!.description).toMatch(/\[phone removed\].*\[email removed\]/);
    expect(detail!.severity).toBe('low');
  });
});

describe('suspension', () => {
  it('refuses to suspend from a low-severity report', async () => {
    const admin = await adminId();
    const id = await fileReport('rose-garden-ooty', 'information', 'The ticket price shown is out of date now.');

    await expect(incidentsService.act(id, { action: 'suspend', reason: 'Testing the guard.' }, admin)).rejects.toMatchObject({
      status: 409,
    });
  });

  it('allows suspension once the severity is raised, and records both steps', async () => {
    const admin = await adminId();
    const id = await fileReport('lambs-rock', 'information', 'The railing at the viewpoint edge is broken.');

    await incidentsService.act(id, { action: 'set_severity', severity: 'high', reason: 'Broken railing at a drop.' }, admin);
    const after = await incidentsService.act(id, { action: 'suspend', reason: 'Railing broken above a drop.' }, admin);
    expect(after.entityStatus).toBe('suspended');

    const log = await incidentsRepository.actionLog(id, after.entityId);
    expect(log.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(['incident.severity_changed', 'incident.suspended_listing', 'place.suspended']),
    );

    await incidentsService.act(id, { action: 'reinstate', reason: 'Railing repaired and inspected.' }, admin);
  });

  it('removes a suspended place from public discovery immediately', async () => {
    const admin = await adminId();
    const [critical] = await incidentsRepository.list();
    expect(critical.entitySlug).toBe('chinnakallar-falls');

    await incidentsService.act(critical.id, { action: 'suspend', reason: 'Path collapsed after rain.' }, admin);

    expect(await catalogRepository.findPlaceBySlug('chinnakallar-falls')).toBeNull();

    const destination = await catalogRepository.findDestinationBySlug('valparai-anamalai');
    const places = await catalogRepository.listPlacesForDestination(destination!.id);
    expect(places.some((place) => place.slug === 'chinnakallar-falls')).toBe(false);
  });

  it('warns a traveller who already planned to go there', async () => {
    const traveller = await createTestUser();
    const destination = await catalogRepository.findDestinationBySlug('valparai-anamalai');
    const trip = await tripsRepository.create({
      ownerUserId: traveller.userId,
      destinationId: destination!.id,
      title: 'Plateau trip',
      startDate: new Date('2026-12-18'),
      endDate: new Date('2026-12-18'),
      originText: 'Coimbatore',
      origin: { lat: 11.0168, lng: 76.9558 },
      party: {},
      tripBrief: { durationDays: 1, interests: ['nature'] },
      totalBudgetInr: 25_000,
    });

    // A plan made before the suspension, which already includes the place.
    const [place] = await sql<{ id: string }[]>`SELECT id FROM places WHERE slug = 'chinnakallar-falls'`;
    await tripsRepository.replaceItinerary(trip.id, [
      {
        dayNumber: 1,
        date: new Date('2026-12-18'),
        title: 'Falls',
        items: [
          {
            placeId: place.id,
            itemType: 'place',
            title: 'Chinnakallar Falls',
            startsAt: new Date('2026-12-18T04:30:00Z'),
            durationMinutes: 90,
            sortOrder: 0,
            travelFromPrevious: { minutes: 0, meters: 0, mode: 'car' },
            priceEstimate: { expectedMinor: 2000, priceState: 'historical' },
          },
        ],
      },
    ]);

    const detail = await tripsService.getDetail(trip.id);
    const closure = detail!.conflicts.find((entry) => /closed to visitors/.test(entry.message));
    expect(closure).toBeDefined();
    expect(closure!.severity).toBe('blocking');
  });

  it('will not reinstate while another open report keeps the listing down', async () => {
    const admin = await adminId();
    const [critical] = await incidentsRepository.list();

    const second = await fileReport('chinnakallar-falls', 'danger', 'Rocks still falling onto the path this morning.');
    // The listing is already down, so the second report records its own grounds.
    await sql`UPDATE incident_reports SET suspended_entity = true WHERE id = ${second}`;

    await expect(
      incidentsService.act(critical.id, { action: 'reinstate', reason: 'Path repaired by the forest department.' }, admin),
    ).rejects.toMatchObject({ status: 409 });

    await incidentsService.act(second, { action: 'resolve', reason: 'Rockfall cleared and netting installed.' }, admin);
    const restored = await incidentsService.act(
      critical.id,
      { action: 'reinstate', reason: 'Path repaired and reopened by the forest department.' },
      admin,
    );
    expect(restored.entityStatus).toBe('active');
    expect(await catalogRepository.findPlaceBySlug('chinnakallar-falls')).not.toBeNull();
  });
});

describe('status transitions', () => {
  it('resolves, reopens, and refuses a jump straight to investigating from resolved', async () => {
    const admin = await adminId();
    const id = await fileReport('ooty-botanical-garden', 'crowding', 'Queue at the gate stretched to the road.');

    await incidentsService.act(id, { action: 'resolve', reason: 'Extra ticket counter opened.' }, admin);
    await expect(incidentsService.act(id, { action: 'investigate' }, admin)).rejects.toMatchObject({ status: 409 });

    const reopened = await incidentsService.act(id, { action: 'reopen', reason: 'Queue problem returned today.' }, admin);
    expect(reopened.status).toBe('open');
    expect(reopened.resolution).toBeNull();
  });
});
