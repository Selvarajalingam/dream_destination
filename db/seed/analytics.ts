import type { BusinessIds } from './businesses';
import type { PlaceIds } from './places';
import { BUSINESSES } from './businesses';
import { PLACES } from './places';
import type { SeedSql } from './types';

/**
 * Simulated analytics for the A08 impact dashboard.
 *
 * Every row is written with is_demo = true. PRD E14-S04 requires simulated
 * events to stay separate from pilot behaviour, and E14-S02 requires demo
 * data to carry a visible label; the dashboard reads the flag for both.
 *
 * The generator is deterministic (a fixed-seed PRNG), so the numbers are the
 * same on every seed and tests can assert on them.
 */

/** Simulated sessions over the demonstration window. */
const SESSIONS = 320;
const WINDOW_DAYS = 14;

/** Share of sessions reaching each funnel stage, falling off realistically. */
const FUNNEL_RATES: Array<[string, number]> = [
  ['brief_started', 1],
  ['brief_completed', 0.78],
  ['shortlist_viewed', 0.7],
  ['itinerary_generated', 0.48],
  ['offline_pack_saved', 0.23],
  ['trip_mode_started', 0.13],
];

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // Mulberry32: small, fast and good enough for plausible demo data.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedAnalytics(tx: SeedSql, placeIds: PlaceIds, businessIds: BusinessIds): Promise<void> {
  const random = prng(20260921);
  const rows: Array<{ name: string; properties: Record<string, unknown>; entityType: string | null; entityId: string | null; hoursAgo: number }> = [];

  const hoursAgo = (): number => Math.floor(random() * WINDOW_DAYS * 24);

  const tripIdFor = (session: number): string =>
    // A stable fake trip id per simulated session, in uuid shape so the
    // catalogue accepts it. It refers to no real trip, which is fine: these
    // rows are explicitly simulated.
    `00000000-0000-4000-8000-${String(session).padStart(12, '0')}`;

  for (let session = 0; session < SESSIONS; session += 1) {
    const when = hoursAgo();
    const mode = random() < 0.35 ? 'llm' : 'deterministic';

    let previousRate = 1;
    for (const [name, rate] of FUNNEL_RATES) {
      // Reaching this stage is conditional on reaching the one before it, so
      // the chance of continuing is this stage's rate over the previous one.
      if (random() > rate / previousRate) break;
      previousRate = rate;

      const tripId = tripIdFor(session);
      const properties: Record<string, unknown> =
        name === 'brief_started'
          ? { mode }
          : name === 'brief_completed'
            ? { mode, clarifications: Math.floor(random() * 3) }
            : name === 'shortlist_viewed'
              ? { optionCount: 3 }
              : name === 'itinerary_generated'
                ? { tripId, days: 2 + Math.floor(random() * 3), itemCount: 8 + Math.floor(random() * 8) }
                : name === 'offline_pack_saved'
                  ? { tripId, outcome: random() < 0.9 ? 'saved' : 'partial' }
                  : { tripId };

      rows.push({ name, properties, entityType: 'tripId' in properties ? 'trip' : null, entityId: (properties.tripId as string) ?? null, hoursAgo: when });
    }

    // A quieter time offered to some planners, accepted by a share of them.
    if (random() < 0.2) {
      const place = placeIds['ooty-botanical-garden'];
      if (place !== undefined) {
        const tripId = tripIdFor(session);
        rows.push({ name: 'crowd_alternative_offered', properties: { tripId, placeId: place }, entityType: 'place', entityId: place, hoursAgo: when });
        if (random() < 0.45) {
          rows.push({ name: 'crowd_alternative_accepted', properties: { tripId, placeId: place }, entityType: 'place', entityId: place, hoursAgo: when });
        }
      }
    }
  }

  // Hidden-gem interest, weighted so a few gems are clearly more popular.
  const gems = PLACES.filter((place) => place.isHiddenGem === true);
  for (let view = 0; view < 190; view += 1) {
    const index = Math.floor(Math.pow(random(), 1.8) * gems.length);
    const placeId = placeIds[gems[index].slug];
    if (placeId !== undefined) {
      rows.push({ name: 'hidden_gem_viewed', properties: { placeId }, entityType: 'place', entityId: placeId, hoursAgo: hoursAgo() });
    }
  }

  // Local business exposure and actions. Weighted toward the start of the
  // list, so the fairness reading is realistic rather than perfectly even.
  const businesses = BUSINESSES.filter((business) => businessIds[business.slug] !== undefined);
  const pick = (skew: number) => businesses[Math.floor(Math.pow(random(), skew) * businesses.length)];

  const businessEvents: Array<[string, number, number]> = [
    ['business_impression', 900, 1.3],
    ['business_detail_viewed', 300, 1.6],
    ['business_directions', 110, 1.9],
    ['business_contact', 70, 1.9],
    ['business_itinerary_add', 45, 2.1],
  ];

  for (const [name, total, skew] of businessEvents) {
    for (let index = 0; index < total; index += 1) {
      const business = pick(skew);
      const businessId = businessIds[business.slug];
      const properties: Record<string, unknown> =
        name === 'business_impression'
          ? { businessId, category: business.category, surface: random() < 0.6 ? 'destination' : 'itinerary' }
          : { businessId, category: business.category };
      rows.push({ name, properties, entityType: 'business', entityId: businessId, hoursAgo: hoursAgo() });
    }
  }

  for (const row of rows) {
    await tx`
      INSERT INTO analytics_events (
        session_id, user_id, event_name, properties, schema_version, is_demo, entity_type, entity_id, occurred_at
      ) VALUES (
        NULL, NULL, ${row.name}, ${tx.json(row.properties as never)}, '1', true,
        ${row.entityType}, ${row.entityId}, now() - make_interval(hours => ${row.hoursAgo})
      )
    `;
  }
}
