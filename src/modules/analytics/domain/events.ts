import { z } from 'zod';

/**
 * Analytics event catalogue — PRD backlog E14-S01, Part I §13.
 *
 * E14-S01: "Implements the PRD analytics events. Excludes raw chat,
 * continuous precise location, medical details, and document content. Event
 * schema is versioned."
 *
 * The catalogue IS the privacy control. Every event is a strict schema whose
 * properties are only enums, bounded numbers, booleans or ids. There is no
 * free-text property anywhere, so a chat message, an address or a medical
 * note cannot be recorded even by mistake — the schema rejects it before it
 * reaches the database. A test enforces that no future event adds one.
 */

export const EVENT_SCHEMA_VERSION = '1';

const id = z.string().uuid();
const count = z.number().int().min(0).max(10_000);
const duration = z.number().int().min(0).max(3_600_000);
const category = z.enum(['restaurant', 'homestay', 'artisan', 'guide', 'cafe', 'farm', 'transport', 'shop']);

/** The events, grouped by the dashboard that reads them. */
export const EVENT_CATALOGUE = {
  // --- Product funnel (E14-S02) -------------------------------------------
  brief_started: z.object({ mode: z.enum(['llm', 'deterministic']) }).strict(),
  brief_completed: z
    .object({ mode: z.enum(['llm', 'deterministic']), clarifications: count })
    .strict(),
  shortlist_viewed: z.object({ optionCount: count }).strict(),
  dream_score_opened: z.object({ destinationId: id }).strict(),
  itinerary_generated: z.object({ tripId: id, days: count, itemCount: count }).strict(),
  budget_edited: z.object({ tripId: id, change: z.enum(['total', 'reserve', 'style', 'lock']) }).strict(),
  offline_pack_saved: z.object({ tripId: id, outcome: z.enum(['saved', 'partial']) }).strict(),
  trip_mode_started: z.object({ tripId: id }).strict(),
  trip_completed: z.object({ tripId: id }).strict(),

  // --- Crowd shifts (E14-S04) ---------------------------------------------
  crowd_alternative_offered: z.object({ tripId: id, placeId: id }).strict(),
  crowd_alternative_accepted: z.object({ tripId: id, placeId: id }).strict(),

  // --- Trust and discovery ------------------------------------------------
  hidden_gem_viewed: z.object({ placeId: id }).strict(),
  help_opened: z.object({ source: z.enum(['navigation', 'trip_mode', 'place']), msToOpen: duration.optional() }).strict(),

  // --- Local impact (E14-S03) ---------------------------------------------
  business_impression: z.object({ businessId: id, category, surface: z.enum(['home', 'destination', 'itinerary']) }).strict(),
  business_detail_viewed: z.object({ businessId: id, category }).strict(),
  business_directions: z.object({ businessId: id, category }).strict(),
  business_contact: z.object({ businessId: id, category }).strict(),
  business_itinerary_add: z.object({ businessId: id, category }).strict(),

  // --- Booking handoff (E13) ----------------------------------------------
  booking_handoff: z.object({ tripId: id, kind: z.enum(['stay', 'transport']) }).strict(),
} as const;

export type EventName = keyof typeof EVENT_CATALOGUE;

export const EVENT_NAMES = Object.keys(EVENT_CATALOGUE) as EventName[];

export type EventProperties<Name extends EventName> = z.infer<(typeof EVENT_CATALOGUE)[Name]>;

/** The funnel stages, in order, for the product dashboard. */
export const FUNNEL: readonly EventName[] = [
  'brief_started',
  'brief_completed',
  'shortlist_viewed',
  'itinerary_generated',
  'offline_pack_saved',
  'trip_mode_started',
];

/** The local-impact actions, in the order E14-S03 lists them. */
export const BUSINESS_ACTIONS: readonly EventName[] = [
  'business_impression',
  'business_detail_viewed',
  'business_directions',
  'business_contact',
  'business_itinerary_add',
];

export type ValidatedEvent = {
  name: EventName;
  properties: Record<string, unknown>;
  /** The entity the event concerns, lifted out so it can be indexed. */
  entityType: 'business' | 'place' | 'trip' | 'destination' | null;
  entityId: string | null;
};

/**
 * Validates an event against the catalogue. Unknown names and unexpected
 * properties are rejected, not stripped: a caller sending data the catalogue
 * does not allow is a bug to surface, not something to tidy up silently.
 */
export function validateEvent(
  name: string,
  properties: unknown,
): { ok: true; event: ValidatedEvent } | { ok: false; reason: string } {
  if (!(name in EVENT_CATALOGUE)) return { ok: false, reason: `Unknown event "${name}".` };

  const schema = EVENT_CATALOGUE[name as EventName];
  const parsed = schema.safeParse(properties ?? {});
  if (!parsed.success) {
    return { ok: false, reason: `Invalid properties for "${name}": ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }

  const data = parsed.data as Record<string, unknown>;
  const entity =
    typeof data.businessId === 'string'
      ? { entityType: 'business' as const, entityId: data.businessId }
      : typeof data.placeId === 'string'
        ? { entityType: 'place' as const, entityId: data.placeId }
        : typeof data.destinationId === 'string'
          ? { entityType: 'destination' as const, entityId: data.destinationId }
          : typeof data.tripId === 'string'
            ? { entityType: 'trip' as const, entityId: data.tripId }
            : { entityType: null, entityId: null };

  return { ok: true, event: { name: name as EventName, properties: data, ...entity } };
}
