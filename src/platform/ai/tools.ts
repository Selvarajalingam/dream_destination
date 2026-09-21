import { z } from 'zod';

/**
 * Tool contract — PRD Part II §8.4.
 *
 * "The model can call only allowlisted tools with validated arguments." The
 * list below is exactly the one the PRD specifies. Verification decisions,
 * incident resolution and booking confirmation are deliberately absent: the
 * model must never be able to reach a mutation that changes trust state.
 */

export const ALLOWED_TOOL_NAMES = [
  'search_destinations',
  'get_destination_facts',
  'get_place_crowd',
  'get_route',
  'get_weather',
  'get_rules',
  'get_nearby_help',
  'search_local_businesses',
  'estimate_budget',
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number];

/** Mutations that must never be exposed as tools, asserted by tests. */
export const FORBIDDEN_TOOL_NAMES = [
  'decide_verification',
  'resolve_incident',
  'confirm_booking',
  'suspend_listing',
  'override_crowd',
  'delete_trip',
] as const;

const LatLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

/**
 * Argument schemas. Every tool call is validated against these before it runs,
 * and the result is validated again on the way back (PRD §8.5).
 */
export const TOOL_ARGUMENT_SCHEMAS = {
  search_destinations: z.object({
    themes: z.array(z.string().max(40)).max(12).optional(),
    maxTravelMinutes: z.number().int().min(0).max(2880).optional(),
    maxCostMinor: z.number().int().min(0).optional(),
    durationDays: z.number().int().min(1).max(60).optional(),
  }),
  get_destination_facts: z.object({
    destinationId: z.string().uuid(),
  }),
  get_place_crowd: z.object({
    placeId: z.string().uuid(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
  get_route: z.object({
    origin: LatLng,
    destination: LatLng,
    mode: z.enum(['car', 'bus', 'train', 'walk', 'bike']).default('car'),
  }),
  get_weather: z.object({
    location: LatLng,
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  get_rules: z.object({
    placeId: z.string().uuid(),
  }),
  get_nearby_help: z.object({
    location: LatLng,
    types: z.array(z.string().max(40)).max(10).optional(),
    radiusMeters: z.number().int().min(100).max(100_000).default(15_000),
  }),
  search_local_businesses: z.object({
    location: LatLng,
    categories: z.array(z.string().max(40)).max(10).optional(),
    radiusMeters: z.number().int().min(100).max(50_000).default(10_000),
  }),
  estimate_budget: z.object({
    tripId: z.string().uuid(),
  }),
} as const satisfies Record<AllowedToolName, z.ZodTypeAny>;

export function isAllowedTool(name: string): name is AllowedToolName {
  return (ALLOWED_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Validates a tool call before execution. A call to anything outside the
 * allowlist is refused outright rather than passed through.
 */
export function validateToolCall(
  name: string,
  args: unknown,
): { ok: true; name: AllowedToolName; args: unknown } | { ok: false; reason: string } {
  if (!isAllowedTool(name)) {
    return { ok: false, reason: `Tool "${name}" is not allowlisted.` };
  }

  const parsed = TOOL_ARGUMENT_SCHEMAS[name].safeParse(args);
  if (!parsed.success) {
    return { ok: false, reason: `Invalid arguments for "${name}": ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }

  return { ok: true, name, args: parsed.data };
}
