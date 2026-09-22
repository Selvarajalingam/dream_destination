import { sql } from '@/platform/db/client';
import type { LatLng } from '@/shared/geo';

/**
 * Local business discovery.
 *
 * Sponsored status is returned as its own field and is never folded into
 * ranking quality: PRD Part II §9.2 excludes sponsored placement from the
 * Dream Score, and PRD Part I T12 requires that the organic reason and the
 * sponsored label cannot be confused.
 */

export type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  operatingHours: Record<string, [string, string] | null>;
  priceBand: number | null;
  accessibility: Record<string, unknown>;
  paymentMethods: string[] | null;
  sponsored: boolean;
  /** When the owner last confirmed these details. Rendered beside the hours. */
  lastOwnerUpdateAt: Date | null;
  ownerVerified: boolean;
  /** Street, locality and PIN joined for display; null when none recorded. */
  addressText: string | null;
  services: string[];
  temporaryClosure: { from: string; until: string; note: string | null } | null;
  availabilityNote: string | null;
  /** Photo file ids, served by the authorised files route. */
  photoIds: string[];
  distanceMeters?: number;
};

const BUSINESS_COLUMNS = sql`
  b.id, b.slug, b.name, b.category, b.description,
  ST_Y(b.location::geometry) AS lat,
  ST_X(b.location::geometry) AS lng,
  b.contact->>'phone' AS phone,
  b.operating_hours AS "operatingHours",
  b.price_band AS "priceBand",
  b.accessibility,
  b.payment_methods AS "paymentMethods",
  b.sponsored,
  b.last_owner_update_at AS "lastOwnerUpdateAt",
  EXISTS (
    SELECT 1 FROM business_verifications bv
    WHERE bv.business_id = b.id
      AND bv.status = 'approved'
      AND (bv.expires_at IS NULL OR bv.expires_at > now())
  ) AS "ownerVerified",
  NULLIF(concat_ws(', ', NULLIF(b.address->>'line', ''), NULLIF(b.address->>'locality', ''), NULLIF(b.address->>'pin', '')), '') AS "addressText",
  b.services,
  b.temporary_closure AS "temporaryClosure",
  b.availability_note AS "availabilityNote",
  ARRAY(
    SELECT f.id FROM business_files f
    WHERE f.business_id = b.id AND f.purpose = 'photo'
    ORDER BY f.created_at
  ) AS "photoIds"
`;

/**
 * A listing closed today by its owner (B06) is left out of suggestions. Its
 * own page still opens, and says it is closed.
 */
const NOT_CLOSED_TODAY = sql`
  NOT (
    b.temporary_closure IS NOT NULL
    AND (b.temporary_closure->>'from')::date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND (b.temporary_closure->>'until')::date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  )
`;

export type BusinessFilter = {
  categories?: string[];
  maxPriceBand?: number;
  limit?: number;
};

export const businessRepository = {
  async findNearby(
    point: LatLng,
    radiusMeters = 10_000,
    filter: BusinessFilter = {},
  ): Promise<BusinessRow[]> {
    const { categories, maxPriceBand, limit = 20 } = filter;

    return sql<BusinessRow[]>`
      SELECT ${BUSINESS_COLUMNS},
        ST_Distance(b.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceMeters"
      FROM local_businesses b
      WHERE b.status = 'active'
        AND ${NOT_CLOSED_TODAY}
        AND ST_DWithin(b.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
        ${categories === undefined || categories.length === 0 ? sql`` : sql`AND b.category = ANY(${sql.array(categories)})`}
        ${maxPriceBand === undefined ? sql`` : sql`AND (b.price_band IS NULL OR b.price_band <= ${maxPriceBand})`}
      ORDER BY "distanceMeters"
      LIMIT ${limit}
    `;
  },

  async findBySlug(slug: string): Promise<BusinessRow | null> {
    const [row] = await sql<BusinessRow[]>`
      SELECT ${BUSINESS_COLUMNS} FROM local_businesses b
      WHERE b.slug = ${slug} AND b.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  async findById(id: string): Promise<BusinessRow | null> {
    const [row] = await sql<BusinessRow[]>`
      SELECT ${BUSINESS_COLUMNS} FROM local_businesses b
      WHERE b.id = ${id} AND b.status = 'active'
      LIMIT 1
    `;
    return row ?? null;
  },

  /** "Support local" on a destination page. */
  async findForDestination(destinationId: string, limit = 12): Promise<BusinessRow[]> {
    return sql<BusinessRow[]>`
      SELECT ${BUSINESS_COLUMNS},
        ST_Distance(b.location, d.center) AS "distanceMeters"
      FROM local_businesses b
      JOIN destinations d ON d.id = ${destinationId}
      WHERE b.status = 'active'
        AND ${NOT_CLOSED_TODAY}
        AND ST_DWithin(b.location, d.center, 40000)
      ORDER BY "distanceMeters"
      LIMIT ${limit}
    `;
  },

  /** Businesses near a trip's stops, for the in-itinerary suggestion. */
  async findNearTrip(tripId: string, radiusMeters = 5_000, limit = 12): Promise<BusinessRow[]> {
    return sql<BusinessRow[]>`
      SELECT DISTINCT ON (b.id) ${BUSINESS_COLUMNS},
        0::float AS "distanceMeters"
      FROM local_businesses b
      WHERE b.status = 'active'
        AND ${NOT_CLOSED_TODAY}
        AND EXISTS (
          SELECT 1 FROM itinerary_items ii
          JOIN itinerary_days dd ON dd.id = ii.itinerary_day_id
          JOIN places p ON p.id = ii.place_id
          WHERE dd.trip_id = ${tripId} AND ST_DWithin(b.location, p.location, ${radiusMeters})
        )
      LIMIT ${limit}
    `;
  },

  /**
   * Locations of listings already in a plan, whatever their status now, so a
   * later closure or suspension does not break travel times for the day.
   */
  async findPointsByIds(ids: string[]): Promise<Array<{ id: string; lat: number; lng: number }>> {
    if (ids.length === 0) return [];
    return sql<Array<{ id: string; lat: number; lng: number }>>`
      SELECT id, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM local_businesses WHERE id IN ${sql(ids)}
    `;
  },

  /** Counted for the impact analytics screen. */
  async countActive(): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM local_businesses WHERE status = 'active'
    `;
    return Number(row.count);
  },
};
