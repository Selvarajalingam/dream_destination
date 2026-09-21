import { sql } from '@/platform/db/client';
import type { LatLng } from '@/shared/geo';

/**
 * Catalog reads.
 *
 * Geography columns are selected as separate lat/lng numbers, and radius
 * filters use ST_DWithin so the GIST indexes from PRD Part II §6.4 apply.
 */

export type DestinationRow = {
  id: string;
  slug: string;
  name: string;
  stateCode: string;
  district: string | null;
  summary: string;
  lat: number;
  lng: number;
  themes: string[];
  minimumDays: number | null;
  maximumDays: number | null;
  baseCostLowInr: number | null;
  baseCostHighInr: number | null;
  status: string;
  /** Present only when the query supplied a point to measure from. */
  distanceMeters?: number;
};

export type PlaceRow = {
  id: string;
  destinationId: string | null;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  lat: number;
  lng: number;
  operatingHours: Record<string, [string, string] | null>;
  expectedVisitMinutes: number | null;
  priceLowInr: number | null;
  priceHighInr: number | null;
  accessibility: Record<string, unknown>;
  isHiddenGem: boolean;
  status: string;
  distanceMeters?: number;
};

export type SourceRow = {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  issuingAuthority: string | null;
  verifiedAt: Date | null;
  reviewDueAt: Date | null;
};

export type DestinationFilter = {
  themes?: string[];
  nearPoint?: LatLng;
  radiusMeters?: number;
  maxCostMinor?: number;
  durationDays?: number;
  limit?: number;
};

const DESTINATION_COLUMNS = sql`
  d.id, d.slug, d.name,
  d.state_code AS "stateCode",
  d.district, d.summary,
  ST_Y(d.center::geometry) AS lat,
  ST_X(d.center::geometry) AS lng,
  d.themes,
  d.minimum_days AS "minimumDays",
  d.maximum_days AS "maximumDays",
  d.base_cost_low_inr AS "baseCostLowInr",
  d.base_cost_high_inr AS "baseCostHighInr",
  d.status
`;

const PLACE_COLUMNS = sql`
  p.id,
  p.destination_id AS "destinationId",
  p.slug, p.name, p.category, p.description,
  ST_Y(p.location::geometry) AS lat,
  ST_X(p.location::geometry) AS lng,
  p.operating_hours AS "operatingHours",
  p.expected_visit_minutes AS "expectedVisitMinutes",
  p.price_low_inr AS "priceLowInr",
  p.price_high_inr AS "priceHighInr",
  p.accessibility,
  p.is_hidden_gem AS "isHiddenGem",
  p.status
`;

export const catalogRepository = {
  async searchDestinations(filter: DestinationFilter = {}): Promise<DestinationRow[]> {
    const { themes, nearPoint, radiusMeters, maxCostMinor, durationDays, limit = 20 } = filter;

    // Cost is stored in whole rupees on the catalog; the brief carries minor
    // units, so convert at the boundary rather than in the query predicate.
    const maxCostInr = maxCostMinor === undefined ? null : Math.round(maxCostMinor / 100);

    return sql<DestinationRow[]>`
      SELECT ${DESTINATION_COLUMNS}
        ${
          nearPoint === undefined
            ? sql``
            : sql`, ST_Distance(d.center, ST_SetSRID(ST_MakePoint(${nearPoint.lng}, ${nearPoint.lat}), 4326)::geography) AS "distanceMeters"`
        }
      FROM destinations d
      WHERE d.status = 'active'
        ${themes === undefined || themes.length === 0 ? sql`` : sql`AND d.themes && ${sql.array(themes)}`}
        ${
          nearPoint === undefined || radiusMeters === undefined
            ? sql``
            : sql`AND ST_DWithin(d.center, ST_SetSRID(ST_MakePoint(${nearPoint.lng}, ${nearPoint.lat}), 4326)::geography, ${radiusMeters})`
        }
        ${maxCostInr === null ? sql`` : sql`AND (d.base_cost_low_inr IS NULL OR d.base_cost_low_inr <= ${maxCostInr})`}
        ${
          durationDays === undefined
            ? sql``
            : sql`AND (d.minimum_days IS NULL OR d.minimum_days <= ${durationDays})`
        }
      ORDER BY ${nearPoint === undefined ? sql`d.name` : sql`"distanceMeters"`}
      LIMIT ${limit}
    `;
  },

  async findDestinationBySlug(slug: string): Promise<DestinationRow | null> {
    const [row] = await sql<DestinationRow[]>`
      SELECT ${DESTINATION_COLUMNS} FROM destinations d
      WHERE d.slug = ${slug} AND d.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  async findDestinationById(id: string): Promise<DestinationRow | null> {
    const [row] = await sql<DestinationRow[]>`
      SELECT ${DESTINATION_COLUMNS} FROM destinations d
      WHERE d.id = ${id} AND d.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  async listAllDestinations(): Promise<DestinationRow[]> {
    return sql<DestinationRow[]>`
      SELECT ${DESTINATION_COLUMNS} FROM destinations d
      WHERE d.status = 'active'
      ORDER BY d.name
    `;
  },

  async listPlacesForDestination(destinationId: string): Promise<PlaceRow[]> {
    return sql<PlaceRow[]>`
      SELECT ${PLACE_COLUMNS} FROM places p
      WHERE p.destination_id = ${destinationId} AND p.status = 'active'
      ORDER BY p.is_hidden_gem, p.name
    `;
  },

  async findPlaceBySlug(slug: string): Promise<PlaceRow | null> {
    const [row] = await sql<PlaceRow[]>`
      SELECT ${PLACE_COLUMNS} FROM places p
      WHERE p.slug = ${slug} AND p.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  async findPlaceById(id: string): Promise<PlaceRow | null> {
    const [row] = await sql<PlaceRow[]>`
      SELECT ${PLACE_COLUMNS} FROM places p
      WHERE p.id = ${id} AND p.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  async findPlacesByIds(ids: string[]): Promise<PlaceRow[]> {
    if (ids.length === 0) return [];
    return sql<PlaceRow[]>`
      SELECT ${PLACE_COLUMNS} FROM places p WHERE p.id = ANY(${sql.array(ids)}::uuid[])
    `;
  },

  /** Places within a radius, used by "what is near this stop". */
  async findPlacesNear(point: LatLng, radiusMeters: number, limit = 20): Promise<PlaceRow[]> {
    return sql<PlaceRow[]>`
      SELECT ${PLACE_COLUMNS},
        ST_Distance(p.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceMeters"
      FROM places p
      WHERE p.status = 'active'
        AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
      ORDER BY "distanceMeters"
      LIMIT ${limit}
    `;
  },

  /** Source records backing a place's trust-bearing fields. */
  async findSourcesForPlace(placeId: string): Promise<Array<SourceRow & { fieldScope: string }>> {
    return sql<Array<SourceRow & { fieldScope: string }>>`
      SELECT s.id, s.name,
             s.source_type AS "sourceType",
             s.source_url AS "sourceUrl",
             s.issuing_authority AS "issuingAuthority",
             s.verified_at AS "verifiedAt",
             s.review_due_at AS "reviewDueAt",
             ps.field_scope AS "fieldScope"
      FROM place_sources ps
      JOIN source_records s ON s.id = ps.source_id
      WHERE ps.place_id = ${placeId}
    `;
  },

  async listStoriesForPlace(placeId: string): Promise<
    Array<{
      id: string;
      contentType: string;
      title: string;
      shortText: string;
      longText: string | null;
    }>
  > {
    return sql`
      SELECT id,
             content_type AS "contentType",
             title,
             short_text AS "shortText",
             long_text AS "longText"
      FROM story_content
      WHERE place_id = ${placeId} AND status = 'active'
      ORDER BY content_type
    ` as never;
  },

  /** Counts used by the Dream Score's local-experience dimension. */
  async countLocalExperiences(destinationId: string): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT (
        (SELECT count(*) FROM places p
          JOIN hidden_gem_verifications v ON v.place_id = p.id
         WHERE p.destination_id = ${destinationId}
           AND v.status = 'approved'
           AND (v.expires_at IS NULL OR v.expires_at > now()))
        +
        (SELECT count(*) FROM local_businesses b
          JOIN destinations d ON d.id = ${destinationId}
         WHERE b.status = 'active'
           AND ST_DWithin(b.location, d.center, 40000))
      ) AS count
    `;
    return Number(row.count);
  },

  /** Accessibility summary used by the Dream Score's accessibility dimension. */
  async accessibilitySummary(
    destinationId: string,
  ): Promise<{ stepFreeShare: number; medicalAccessKm: number } | null> {
    const [row] = await sql<{ total: string; stepFree: string; medicalKm: number | null }[]>`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE (p.accessibility->>'stepFreeEntry')::boolean IS TRUE) AS "stepFree",
        (
          SELECT MIN(ST_Distance(h.location, d.center)) / 1000.0
          FROM help_facilities h, destinations d
          WHERE d.id = ${destinationId}
            AND h.facility_type = 'hospital'
            AND h.status = 'active'
        ) AS "medicalKm"
      FROM places p
      WHERE p.destination_id = ${destinationId} AND p.status = 'active'
    `;

    const total = Number(row?.total ?? 0);
    if (total === 0) return null;

    return {
      stepFreeShare: Number(row.stepFree) / total,
      // No hospital in the dataset is treated as far away, not as unknown,
      // because the catalog covers the pilot region completely.
      medicalAccessKm: row.medicalKm ?? 60,
    };
  },
};
