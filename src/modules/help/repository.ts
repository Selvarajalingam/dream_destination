import { sql } from '@/platform/db/client';
import type { LatLng } from '@/shared/geo';

/**
 * Nearby Help (Screen T18).
 *
 * Facilities are returned with their stored hours and a verified date. Nothing
 * here asserts that a facility is open right now: T18 states that when
 * offline, live availability is unknown, and the same caution applies online
 * because the directory is periodic rather than real-time.
 */

/** PRD Part I T18: the national emergency number is always the first action. */
export const NATIONAL_EMERGENCY_NUMBER = '112';

export type HelpFacilityRow = {
  id: string;
  name: string;
  facilityType: string;
  lat: number;
  lng: number;
  phone: string | null;
  operatingHours: Record<string, unknown>;
  verifiedAt: Date | null;
  reviewDueAt: Date | null;
  issuingAuthority: string | null;
  sourceName: string | null;
  distanceMeters: number;
  isStale: boolean;
};

/** Facility categories in the order T18 lists them. */
export const FACILITY_ORDER = [
  'hospital',
  'pharmacy',
  'police',
  'tourist_assistance',
  'forest_office',
  'fuel',
  'ev_charging',
] as const;

export const helpRepository = {
  async findNearby(
    point: LatLng,
    radiusMeters = 25_000,
    types: readonly string[] = FACILITY_ORDER,
    limit = 40,
  ): Promise<HelpFacilityRow[]> {
    return sql<HelpFacilityRow[]>`
      SELECT h.id, h.name,
             h.facility_type AS "facilityType",
             ST_Y(h.location::geometry) AS lat,
             ST_X(h.location::geometry) AS lng,
             h.contact->>'phone' AS phone,
             h.operating_hours AS "operatingHours",
             h.verified_at AS "verifiedAt",
             h.review_due_at AS "reviewDueAt",
             s.issuing_authority AS "issuingAuthority",
             s.name AS "sourceName",
             ST_Distance(h.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceMeters",
             (h.review_due_at < now()) AS "isStale"
      FROM help_facilities h
      LEFT JOIN source_records s ON s.id = h.source_id
      WHERE h.status = 'active'
        AND h.facility_type = ANY(${sql.array([...types])})
        AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
      ORDER BY "distanceMeters"
      LIMIT ${limit}
    `;
  },

  /** The nearest facility of each type, which is what T18 leads with. */
  async findNearestByType(point: LatLng, radiusMeters = 50_000): Promise<HelpFacilityRow[]> {
    return sql<HelpFacilityRow[]>`
      SELECT DISTINCT ON (h.facility_type)
             h.id, h.name,
             h.facility_type AS "facilityType",
             ST_Y(h.location::geometry) AS lat,
             ST_X(h.location::geometry) AS lng,
             h.contact->>'phone' AS phone,
             h.operating_hours AS "operatingHours",
             h.verified_at AS "verifiedAt",
             h.review_due_at AS "reviewDueAt",
             s.issuing_authority AS "issuingAuthority",
             s.name AS "sourceName",
             ST_Distance(h.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceMeters",
             (h.review_due_at < now()) AS "isStale"
      FROM help_facilities h
      LEFT JOIN source_records s ON s.id = h.source_id
      WHERE h.status = 'active'
        AND ST_DWithin(h.location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${radiusMeters})
      ORDER BY h.facility_type, "distanceMeters"
    `;
  },

  /** Facilities near anywhere the trip goes, cached into the offline pack. */
  async findForTrip(tripId: string, radiusMeters = 25_000): Promise<HelpFacilityRow[]> {
    return sql<HelpFacilityRow[]>`
      SELECT DISTINCT ON (h.id)
             h.id, h.name,
             h.facility_type AS "facilityType",
             ST_Y(h.location::geometry) AS lat,
             ST_X(h.location::geometry) AS lng,
             h.contact->>'phone' AS phone,
             h.operating_hours AS "operatingHours",
             h.verified_at AS "verifiedAt",
             h.review_due_at AS "reviewDueAt",
             s.issuing_authority AS "issuingAuthority",
             s.name AS "sourceName",
             0::float AS "distanceMeters",
             (h.review_due_at < now()) AS "isStale"
      FROM help_facilities h
      LEFT JOIN source_records s ON s.id = h.source_id
      WHERE h.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM itinerary_items ii
          JOIN itinerary_days dd ON dd.id = ii.itinerary_day_id
          JOIN places p ON p.id = ii.place_id
          WHERE dd.trip_id = ${tripId}
            AND ST_DWithin(h.location, p.location, ${radiusMeters})
        )
    `;
  },
};
