import { sql, withTransaction } from '@/platform/db/client';
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from './domain/incidents';

/**
 * Incident persistence for Screen A06 and the traveller report flow.
 *
 * The reporter's user id is stored, because it is needed to rate-limit abuse
 * and to let a reporter see their own reports later, but it is never selected
 * into any triage read. Reporter privacy is enforced by what these queries
 * return, not by a UI that politely declines to render a field it was handed.
 */

export type IncidentEntityType = 'place' | 'business';

export type IncidentListRow = {
  id: string;
  entityType: IncidentEntityType;
  entityId: string;
  entityName: string | null;
  entitySlug: string | null;
  entityStatus: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  createdAt: Date;
  assignedToName: string | null;
  suspendedEntity: boolean;
  hasOwnerResponse: boolean;
};

export type IncidentDetail = IncidentListRow & {
  assignedTo: string | null;
  lat: number | null;
  lng: number | null;
  ownerResponse: string | null;
  ownerRespondedAt: Date | null;
  resolvedAt: Date | null;
  resolution: string | null;
  otherOpenReportsOnEntity: number;
};

export type ActionLogEntry = {
  id: string;
  action: string;
  actorName: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

const BASE_COLUMNS = sql`
  i.id,
  i.entity_type AS "entityType",
  i.entity_id AS "entityId",
  COALESCE(p.name, b.name) AS "entityName",
  COALESCE(p.slug, b.slug) AS "entitySlug",
  COALESCE(p.status::text, b.status::text) AS "entityStatus",
  i.category, i.severity, i.status, i.description,
  i.created_at AS "createdAt",
  au.display_name AS "assignedToName",
  i.suspended_entity AS "suspendedEntity",
  (i.owner_response IS NOT NULL) AS "hasOwnerResponse"
`;

const BASE_JOINS = sql`
  LEFT JOIN places p ON i.entity_type = 'place' AND p.id = i.entity_id
  LEFT JOIN local_businesses b ON i.entity_type = 'business' AND b.id = i.entity_id
  LEFT JOIN users au ON au.id = i.assigned_to
`;

export const incidentsRepository = {
  /**
   * Travellers with this entity in a plan that has not finished, so a
   * suspension can reach the people it actually affects.
   */
  async travellersPlanning(entityType: string, entityId: string): Promise<Array<{ userId: string; tripId: string; tripTitle: string }>> {
    if (entityType !== 'place' && entityType !== 'business') return [];
    const column = entityType === 'place' ? sql`ii.place_id` : sql`ii.local_business_id`;

    return sql<Array<{ userId: string; tripId: string; tripTitle: string }>>`
      SELECT DISTINCT t.owner_user_id AS "userId", t.id AS "tripId", t.title AS "tripTitle"
      FROM trips t
      JOIN itinerary_days d ON d.trip_id = t.id
      JOIN itinerary_items ii ON ii.itinerary_day_id = d.id
      WHERE ${column} = ${entityId}
        AND t.status IN ('draft', 'upcoming', 'active')
        AND t.owner_user_id IS NOT NULL
    `;
  },

  /** Resolves a public slug to the id a report is filed against. */
  async resolveEntity(
    entityType: IncidentEntityType,
    slug: string,
  ): Promise<{ id: string; name: string } | null> {
    const [row] =
      entityType === 'place'
        ? await sql<{ id: string; name: string }[]>`SELECT id, name FROM places WHERE slug = ${slug}`
        : await sql<{ id: string; name: string }[]>`SELECT id, name FROM local_businesses WHERE slug = ${slug}`;
    return row ?? null;
  },

  async create(input: {
    reporterUserId: string | null;
    entityType: IncidentEntityType;
    entityId: string;
    category: IncidentCategory;
    severity: IncidentSeverity;
    description: string;
  }): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO incident_reports (reporter_user_id, entity_type, entity_id, category, severity, description, status)
      VALUES (${input.reporterUserId}, ${input.entityType}, ${input.entityId}, ${input.category},
              ${input.severity}, ${input.description}, 'open')
      RETURNING id
    `;
    return row.id;
  },

  /** How many reports this reporter has filed recently, for abuse limits. */
  async recentCountForReporter(reporterUserId: string, hours: number): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM incident_reports
      WHERE reporter_user_id = ${reporterUserId}
        AND created_at > now() - make_interval(hours => ${hours})
    `;
    return Number(row.count);
  },

  async list(filter: { status?: 'active' | 'closed' } = {}): Promise<IncidentListRow[]> {
    const statuses =
      filter.status === 'closed' ? ['resolved', 'dismissed'] : ['open', 'investigating'];

    return sql<IncidentListRow[]>`
      SELECT ${BASE_COLUMNS}
      FROM incident_reports i
      ${BASE_JOINS}
      WHERE i.status IN ${sql(statuses)}
      ORDER BY
        CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        i.created_at
    `;
  },

  async findById(id: string): Promise<IncidentDetail | null> {
    const [row] = await sql<IncidentDetail[]>`
      SELECT ${BASE_COLUMNS},
             i.assigned_to AS "assignedTo",
             COALESCE(ST_Y(p.location::geometry), ST_Y(b.location::geometry)) AS lat,
             COALESCE(ST_X(p.location::geometry), ST_X(b.location::geometry)) AS lng,
             i.owner_response AS "ownerResponse",
             i.owner_responded_at AS "ownerRespondedAt",
             i.resolved_at AS "resolvedAt",
             i.resolution,
             (SELECT count(*)::int FROM incident_reports o
               WHERE o.entity_id = i.entity_id AND o.id <> i.id
                 AND o.status IN ('open', 'investigating')) AS "otherOpenReportsOnEntity"
      FROM incident_reports i
      ${BASE_JOINS}
      WHERE i.id = ${id}
      LIMIT 1
    `;
    return row ?? null;
  },

  /** Everything audited against this incident or the listing it concerns. */
  async actionLog(incidentId: string, entityId: string): Promise<ActionLogEntry[]> {
    return sql<ActionLogEntry[]>`
      SELECT a.id, a.action,
             u.display_name AS "actorName",
             a.before_state AS before,
             a.after_state AS after,
             a.created_at AS "createdAt"
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.entity_id IN (${incidentId}, ${entityId})
      ORDER BY a.created_at DESC
    `;
  },

  async setAssignee(id: string, userId: string | null): Promise<void> {
    await sql`UPDATE incident_reports SET assigned_to = ${userId} WHERE id = ${id}`;
  },

  async setSeverity(id: string, severity: IncidentSeverity): Promise<void> {
    await sql`UPDATE incident_reports SET severity = ${severity} WHERE id = ${id}`;
  },

  async setStatus(id: string, status: IncidentStatus, resolution: string | null): Promise<void> {
    const closing = status === 'resolved' || status === 'dismissed';
    await sql`
      UPDATE incident_reports
      SET status = ${status},
          resolution = ${closing ? resolution : null},
          resolved_at = ${closing ? sql`now()` : null}
      WHERE id = ${id}
    `;
  },

  /**
   * Suspends the listing an incident concerns and marks the incident as the
   * cause, in one transaction, so there is never a suspended place with no
   * record of why.
   */
  async suspendEntity(incident: Pick<IncidentDetail, 'id' | 'entityType' | 'entityId'>): Promise<void> {
    await withTransaction(async (tx) => {
      if (incident.entityType === 'place') {
        await tx`UPDATE places SET status = 'suspended', updated_at = now() WHERE id = ${incident.entityId}`;
      } else {
        await tx`UPDATE local_businesses SET status = 'suspended', updated_at = now() WHERE id = ${incident.entityId}`;
      }
      await tx`
        UPDATE incident_reports
        SET suspended_entity = true,
            status = CASE WHEN status = 'open' THEN 'investigating' ELSE status END
        WHERE id = ${incident.id}
      `;
    });
  },

  async reinstateEntity(incident: Pick<IncidentDetail, 'id' | 'entityType' | 'entityId'>): Promise<void> {
    await withTransaction(async (tx) => {
      if (incident.entityType === 'place') {
        await tx`UPDATE places SET status = 'active', updated_at = now() WHERE id = ${incident.entityId}`;
      } else {
        await tx`UPDATE local_businesses SET status = 'active', updated_at = now() WHERE id = ${incident.entityId}`;
      }
      await tx`UPDATE incident_reports SET suspended_entity = false WHERE id = ${incident.id}`;
    });
  },

  /** Other reports that suspended the same listing and are still open. */
  async otherActiveSuspensions(incident: Pick<IncidentDetail, 'id' | 'entityId'>): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM incident_reports
      WHERE entity_id = ${incident.entityId} AND id <> ${incident.id}
        AND suspended_entity AND status IN ('open', 'investigating')
    `;
    return Number(row.count);
  },

  async assignableTriagers(): Promise<Array<{ id: string; name: string }>> {
    return sql<Array<{ id: string; name: string }>>`
      SELECT DISTINCT u.id, u.display_name AS name
      FROM users u JOIN user_roles r ON r.user_id = u.id
      WHERE r.role IN ('tourism_admin', 'platform_admin', 'verifier') AND u.status = 'active'
      ORDER BY u.display_name
    `;
  },
};
