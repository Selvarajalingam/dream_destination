import { sql } from '@/platform/db/client';
import { EVENT_SCHEMA_VERSION, type EventName, type ValidatedEvent } from './domain/events';

/**
 * Analytics storage and dashboard reads.
 *
 * Events are keyed to a session, never to a user: PRD Part II §12.3 says
 * product analytics should be aggregated where possible, and a session id is
 * enough to count a funnel without tying behaviour to a named person.
 *
 * Every read takes an explicit `demo` flag. PRD E14-S04 requires simulated
 * demo events to stay separate from pilot behaviour, so no query mixes them.
 */

export const analyticsRepository = {
  async insert(event: ValidatedEvent, sessionId: string | null, isDemo: boolean): Promise<void> {
    await sql`
      INSERT INTO analytics_events (
        session_id, user_id, event_name, properties, schema_version, is_demo, entity_type, entity_id
      ) VALUES (
        ${sessionId}, NULL, ${event.name}, ${sql.json(event.properties as never)},
        ${EVENT_SCHEMA_VERSION}, ${isDemo}, ${event.entityType}, ${event.entityId}
      )
    `;
  },

  /** Distinct sessions reaching each named event. */
  async sessionsPerEvent(names: readonly EventName[], demo: boolean): Promise<Map<EventName, number>> {
    const rows = await sql<Array<{ event_name: EventName; sessions: string }>>`
      SELECT event_name, count(DISTINCT COALESCE(session_id::text, id::text)) AS sessions
      FROM analytics_events
      WHERE is_demo = ${demo} AND event_name IN ${sql([...names])}
      GROUP BY event_name
    `;
    return new Map(rows.map((row) => [row.event_name, Number(row.sessions)]));
  },

  async countsPerEvent(names: readonly EventName[], demo: boolean): Promise<Map<EventName, number>> {
    const rows = await sql<Array<{ event_name: EventName; total: string }>>`
      SELECT event_name, count(*) AS total
      FROM analytics_events
      WHERE is_demo = ${demo} AND event_name IN ${sql([...names])}
      GROUP BY event_name
    `;
    return new Map(rows.map((row) => [row.event_name, Number(row.total)]));
  },

  /** Actions per business, across every business action event. */
  async businessActionCounts(demo: boolean): Promise<
    Array<{ businessId: string; name: string | null; category: string | null; actions: number }>
  > {
    return sql`
      SELECT e.entity_id AS "businessId", b.name, b.category, count(*)::int AS actions
      FROM analytics_events e
      LEFT JOIN local_businesses b ON b.id = e.entity_id
      WHERE e.is_demo = ${demo}
        AND e.entity_type = 'business'
        AND e.event_name IN ('business_directions', 'business_contact', 'business_itinerary_add')
      GROUP BY e.entity_id, b.name, b.category
      ORDER BY actions DESC
    ` as never;
  },

  /** Business actions and exposure by category. */
  async businessByCategory(demo: boolean): Promise<
    Array<{ category: string; impressions: number; actions: number }>
  > {
    return sql`
      SELECT properties->>'category' AS category,
             count(*) FILTER (WHERE event_name = 'business_impression')::int AS impressions,
             count(*) FILTER (WHERE event_name IN ('business_directions', 'business_contact', 'business_itinerary_add'))::int AS actions
      FROM analytics_events
      WHERE is_demo = ${demo} AND entity_type = 'business'
      GROUP BY properties->>'category'
      ORDER BY impressions DESC
    ` as never;
  },

  async topHiddenGems(demo: boolean, limit = 5): Promise<Array<{ placeId: string; name: string | null; views: number }>> {
    return sql`
      SELECT e.entity_id AS "placeId", p.name, count(*)::int AS views
      FROM analytics_events e
      LEFT JOIN places p ON p.id = e.entity_id
      WHERE e.is_demo = ${demo} AND e.event_name = 'hidden_gem_viewed'
      GROUP BY e.entity_id, p.name
      ORDER BY views DESC
      LIMIT ${limit}
    ` as never;
  },

  async latestEventAt(demo: boolean): Promise<Date | null> {
    const [row] = await sql<{ latest: Date | null }[]>`
      SELECT max(occurred_at) AS latest FROM analytics_events WHERE is_demo = ${demo}
    `;
    return row.latest;
  },

  async totalEvents(demo: boolean): Promise<number> {
    const [row] = await sql<{ count: string }[]>`SELECT count(*) FROM analytics_events WHERE is_demo = ${demo}`;
    return Number(row.count);
  },

  async eligibleBusinessCount(): Promise<number> {
    const [row] = await sql<{ count: string }[]>`SELECT count(*) FROM local_businesses WHERE status = 'active'`;
    return Number(row.count);
  },
};
