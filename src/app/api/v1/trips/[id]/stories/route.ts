import { sql } from '@/platform/db/client';
import { assertOwnsTrip } from '@/server/authorize';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/trips/{id}/stories
 *
 * Short stories for the places on this trip. Optional in the offline pack:
 * useful to have, but not something a traveller is stranded without.
 */
export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  await assertOwnsTrip(session, params.id);

  const stories = await sql<
    Array<{ id: string; placeId: string; title: string; shortText: string; contentType: string }>
  >`
    SELECT DISTINCT s.id,
           s.place_id AS "placeId",
           s.title,
           s.short_text AS "shortText",
           s.content_type AS "contentType"
    FROM story_content s
    WHERE s.status = 'active'
      AND s.place_id IN (
        SELECT ii.place_id FROM itinerary_items ii
        JOIN itinerary_days d ON d.id = ii.itinerary_day_id
        WHERE d.trip_id = ${params.id} AND ii.place_id IS NOT NULL
      )
  `;

  return json({ stories });
});
