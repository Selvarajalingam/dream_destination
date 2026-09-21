import { z } from 'zod';

/**
 * Structured trip brief — PRD Part II §7.4.
 *
 * Every field is optional because extraction is incremental: the traveler
 * gives what they give, the UI shows what was understood, and generation
 * refuses separately if something required is still missing. PRD Part II §8.1
 * validates this schema immediately after extraction, before any retrieval.
 */

const LONGITUDE = z.number().min(-180).max(180);
const LATITUDE = z.number().min(-90).max(90);

export const OriginSchema = z.object({
  label: z.string().min(1).max(120),
  /** [longitude, latitude], matching PRD §7.4 and PostGIS ordering. */
  coordinates: z.tuple([LONGITUDE, LATITUDE]).optional(),
});

export const PartySchema = z.object({
  type: z.enum(['solo', 'couple', 'family', 'friends', 'group']),
  adults: z.number().int().min(0).max(40).optional(),
  children: z.number().int().min(0).max(40).optional(),
});

export const BudgetSchema = z.object({
  currency: z.literal('INR'),
  /** Minor units (paise). Integer only — PRD Part II §7.1. */
  totalMinor: z.number().int().min(0).max(1_000_000_000),
});

export const ConstraintsSchema = z.object({
  lowWalking: z.boolean().optional(),
  medicalAccessRequired: z.boolean().optional(),
  stepFreeRequired: z.boolean().optional(),
});

export const TripBriefSchema = z.object({
  origin: OriginSchema.optional(),
  /** "2026-12", "2026-12-18" or a season word the UI can resolve. */
  dateFlexibility: z.string().max(40).optional(),
  durationDays: z.number().int().min(1).max(60).optional(),
  party: PartySchema.optional(),
  budget: BudgetSchema.optional(),
  interests: z.array(z.string().min(1).max(40)).max(12).optional(),
  crowdTolerance: z.enum(['low', 'medium', 'high']).optional(),
  pace: z.enum(['relaxed', 'balanced', 'packed']).optional(),
  constraints: ConstraintsSchema.optional(),
});

export type TripBrief = z.infer<typeof TripBriefSchema>;

/** The fields generation needs before it will produce a plan. */
export const REQUIRED_FOR_GENERATION = ['durationDays', 'origin', 'budget', 'interests'] as const;

export type RequiredBriefField = (typeof REQUIRED_FOR_GENERATION)[number];

export function missingRequiredFields(brief: TripBrief): RequiredBriefField[] {
  return REQUIRED_FOR_GENERATION.filter((field) => {
    const value = brief[field];
    if (value === undefined || value === null) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

/** Structured prose the gateway returns for an itinerary. */
export const ItineraryProseSchema = z.object({
  summary: z.string().min(1).max(600),
  dayDescriptions: z.array(z.string().max(600)),
});

export type ItineraryProse = z.infer<typeof ItineraryProseSchema>;

export const RevisionSchema = z.object({
  /** Plain-language explanation shown on the AI suggestion card. */
  explanation: z.string().min(1).max(400),
  /** Estimated impact, e.g. "saves an estimated 25 minutes of waiting". */
  estimatedImpact: z.string().max(200),
  /** Item ids to move, in their proposed new order. Locked ids are rejected. */
  proposedOrder: z.array(z.string()).max(40),
});

export type Revision = z.infer<typeof RevisionSchema>;
