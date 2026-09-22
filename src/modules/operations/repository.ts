import { sql } from '@/platform/db/client';
import type { IncidentSeverity, UrgentItem } from './domain/urgency';

/**
 * Operations reads for Screen A01.
 *
 * Each query returns items already shaped for the urgency ranker, so the
 * service only has to concatenate and rank them.
 */

/** A sensor feed silent for longer than this is treated as failed. */
const FEED_SILENCE_MINUTES = 90;

/** A verification expiring inside this window appears as a warning. */
const EXPIRING_WINDOW_DAYS = 30;

export const operationsRepository = {
  async openIncidents(): Promise<UrgentItem[]> {
    const rows = await sql<
      Array<{
        id: string;
        severity: IncidentSeverity;
        category: string;
        description: string;
        created_at: Date;
        entity_name: string | null;
      }>
    >`
      SELECT i.id, i.severity, i.category, i.description, i.created_at,
             COALESCE(p.name, b.name) AS entity_name
      FROM incident_reports i
      LEFT JOIN places p ON i.entity_type = 'place' AND p.id = i.entity_id
      LEFT JOIN local_businesses b ON i.entity_type = 'business' AND b.id = i.entity_id
      WHERE i.status IN ('open', 'investigating')
      ORDER BY i.created_at
    `;

    return rows.map((row) => ({
      kind: 'incident',
      id: row.id,
      severity: row.severity,
      title: `${capitalise(row.severity)} ${row.category} report: ${row.entity_name ?? 'unknown listing'}`,
      detail: truncate(row.description, 140),
      href: `/admin/incidents/${row.id}`,
      since: row.created_at,
    }));
  },

  /**
   * Approved verifications past their expiry. The public badge already drops
   * off automatically at read time; this is the queue to re-review them.
   */
  async expiredVerifications(): Promise<UrgentItem[]> {
    const rows = await sql<Array<{ id: string; place_name: string; expires_at: Date }>>`
      SELECT v.id, p.name AS place_name, v.expires_at
      FROM hidden_gem_verifications v
      JOIN places p ON p.id = v.place_id
      WHERE v.status = 'approved' AND v.expires_at <= now()
      ORDER BY v.expires_at
    `;

    return rows.map((row) => ({
      kind: 'expired_verification',
      id: row.id,
      title: `Verification lapsed: ${row.place_name}`,
      detail: 'The Dream Verified badge is no longer shown. Recorded limitations still are.',
      href: `/admin/verifications/${row.id}`,
      since: row.expires_at,
    }));
  },

  async staleSources(): Promise<UrgentItem[]> {
    const rows = await sql<
      Array<{ id: string; name: string; issuing_authority: string | null; review_due_at: Date; rule_count: string }>
    >`
      SELECT s.id, s.name, s.issuing_authority, s.review_due_at,
             (SELECT count(*) FROM rule_content r WHERE r.source_id = s.id AND r.status = 'active') AS rule_count
      FROM source_records s
      WHERE s.review_due_at IS NOT NULL AND s.review_due_at < now()
      ORDER BY s.review_due_at
    `;

    return rows.map((row) => ({
      kind: 'stale_source',
      id: row.id,
      title: `Source past review: ${row.issuing_authority ?? row.name}`,
      detail: `${row.rule_count} active rule${row.rule_count === '1' ? '' : 's'} depend on it. Travellers see a stale warning.`,
      href: '/admin/freshness',
      since: row.review_due_at,
    }));
  },

  async activeRedOverrides(): Promise<UrgentItem[]> {
    const rows = await sql<Array<{ id: string; place_name: string; reason: string; starts_at: Date; expires_at: Date }>>`
      SELECT o.id, p.name AS place_name, o.reason, o.starts_at, o.expires_at
      FROM crowd_overrides o
      JOIN places p ON p.id = o.place_id
      WHERE o.band = 'heavy' AND o.starts_at <= now() AND o.expires_at > now()
      ORDER BY o.starts_at
    `;

    return rows.map((row) => ({
      kind: 'red_override',
      id: row.id,
      title: `Heavy crowd advisory: ${row.place_name}`,
      detail: `${truncate(row.reason, 100)} Expires ${formatTime(row.expires_at)}.`,
      href: '/admin/crowd',
      since: row.starts_at,
    }));
  },

  /**
   * Places that have had an authorised sensor feed, whose latest reading is
   * now older than the silence threshold. Travellers at these places see
   * Unknown, which is correct but worth someone's attention.
   */
  async failedFeeds(): Promise<UrgentItem[]> {
    const rows = await sql<Array<{ place_id: string; place_name: string; last_at: Date }>>`
      SELECT o.place_id, p.name AS place_name, max(o.observed_at) AS last_at
      FROM crowd_observations o
      JOIN places p ON p.id = o.place_id
      WHERE o.metadata->>'sourceKind' = 'sensor'
      GROUP BY o.place_id, p.name
      HAVING max(o.observed_at) < now() - make_interval(mins => ${FEED_SILENCE_MINUTES})
      ORDER BY last_at
    `;

    return rows.map((row) => ({
      kind: 'failed_feed',
      id: row.place_id,
      title: `Crowd feed silent: ${row.place_name}`,
      detail: `No reading since ${formatTime(row.last_at)}. Travellers are shown Unknown.`,
      href: '/admin/crowd',
      since: row.last_at,
    }));
  },

  async expiringVerificationCount(): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM hidden_gem_verifications
      WHERE status = 'approved'
        AND expires_at > now()
        AND expires_at <= now() + make_interval(days => ${EXPIRING_WINDOW_DAYS})
    `;
    return Number(row.count);
  },

  /** Recent audited actions, so an operator can see what colleagues just did. */
  async recentAudit(limit = 8): Promise<
    Array<{ id: string; action: string; entityType: string; actorName: string | null; createdAt: Date }>
  > {
    return sql`
      SELECT a.id, a.action,
             a.entity_type AS "entityType",
             u.display_name AS "actorName",
             a.created_at AS "createdAt"
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    ` as never;
  },
};

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1).trimEnd()}…`;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
    .format(date)
    .replace('Sept', 'Sep');
}
