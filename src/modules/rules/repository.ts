import { sql } from '@/platform/db/client';

/**
 * Sourced rules for Screen T20.
 *
 * A rule past its review date is returned with an isStale flag rather than
 * hidden: PRD Part I §5.7 requires stale information to display a warning
 * rather than disappearing silently.
 */

export type RuleRow = {
  id: string;
  category: string;
  title: string;
  plainLanguageSummary: string;
  officialTextExcerpt: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  verifiedAt: Date;
  reviewDueAt: Date;
  sourceName: string;
  sourceUrl: string | null;
  issuingAuthority: string | null;
  sourceType: string;
  /** True once the review date has passed. */
  isStale: boolean;
  /** Set when the rule attaches to a specific place rather than the area. */
  placeId: string | null;
};

const RULE_COLUMNS = sql`
  r.id, r.category, r.title,
  r.plain_language_summary AS "plainLanguageSummary",
  r.official_text_excerpt AS "officialTextExcerpt",
  r.effective_from AS "effectiveFrom",
  r.effective_to AS "effectiveTo",
  r.verified_at AS "verifiedAt",
  r.review_due_at AS "reviewDueAt",
  r.place_id AS "placeId",
  s.name AS "sourceName",
  s.source_url AS "sourceUrl",
  s.issuing_authority AS "issuingAuthority",
  s.source_type AS "sourceType",
  (r.review_due_at < now()) AS "isStale"
`;

export const rulesRepository = {
  /**
   * Rules that apply at a place: the ones attached to it, plus the ones that
   * apply to its whole destination.
   */
  async findForPlace(placeId: string): Promise<RuleRow[]> {
    return sql<RuleRow[]>`
      SELECT ${RULE_COLUMNS}
      FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      WHERE r.status = 'active'
        AND (
          r.place_id = ${placeId}
          OR r.destination_id = (SELECT destination_id FROM places WHERE id = ${placeId})
        )
      ORDER BY (r.place_id = ${placeId}) DESC, r.category, r.title
    `;
  },

  async findForDestination(destinationId: string): Promise<RuleRow[]> {
    return sql<RuleRow[]>`
      SELECT ${RULE_COLUMNS}
      FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      WHERE r.status = 'active' AND r.destination_id = ${destinationId}
      ORDER BY r.category, r.title
    `;
  },

  /** Every rule touched by a trip, for the offline pack. */
  async findForTrip(tripId: string): Promise<RuleRow[]> {
    return sql<RuleRow[]>`
      SELECT DISTINCT ${RULE_COLUMNS}
      FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      WHERE r.status = 'active'
        AND (
          r.place_id IN (
            SELECT ii.place_id FROM itinerary_items ii
            JOIN itinerary_days dd ON dd.id = ii.itinerary_day_id
            WHERE dd.trip_id = ${tripId} AND ii.place_id IS NOT NULL
          )
          OR r.destination_id = (SELECT destination_id FROM trips WHERE id = ${tripId})
        )
      ORDER BY r.category, r.title
    `;
  },

  /** Stale and expiring content for Screen A05. */
  async findStale(): Promise<RuleRow[]> {
    return sql<RuleRow[]>`
      SELECT ${RULE_COLUMNS}
      FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      WHERE r.status = 'active' AND r.review_due_at < now() + interval '30 days'
      ORDER BY r.review_due_at
    `;
  },
};
