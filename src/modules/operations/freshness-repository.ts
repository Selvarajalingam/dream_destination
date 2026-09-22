import { sql } from '@/platform/db/client';
import {
  BUSINESS_CONFIRMATION_DAYS,
  EXPIRING_WINDOW_DAYS,
  classifyFreshness,
  daysOverdue,
  type FreshnessState,
} from './domain/freshness';

/**
 * Freshness reads and actions for Screen A05.
 *
 * Four groups, matching the PRD: rules, emergency facilities, operating hours
 * and business records. Operating hours are acted on at their source, because
 * re-checking one issuing authority's notice freshens every place it backs.
 */

export type FreshnessGroup = 'rule' | 'help_facility' | 'source' | 'business';

export type FreshnessItem = {
  entityType: FreshnessGroup;
  id: string;
  title: string;
  context: string;
  authority: string | null;
  reviewDueAt: Date | null;
  state: FreshnessState;
  daysOverdue: number | null;
  assignedToId: string | null;
  assignedToName: string | null;
  reminderCount: number;
  lastRemindedAt: Date | null;
};

/** How far forward a successful re-verification pushes the next review. */
const REVERIFY_DAYS: Record<FreshnessGroup, number> = {
  rule: 180,
  help_facility: 90,
  source: 180,
  business: BUSINESS_CONFIRMATION_DAYS,
};

type AssignmentJoin = {
  assigned_to: string | null;
  assignee_name: string | null;
  reminder_count: number | null;
  last_reminded_at: Date | null;
};

const assignment = (group: FreshnessGroup, idColumn: string) => sql`
  LEFT JOIN freshness_assignments fa ON fa.entity_type = ${group} AND fa.entity_id = ${sql.unsafe(idColumn)}
  LEFT JOIN users au ON au.id = fa.assigned_to
`;

const ASSIGNMENT_COLUMNS = sql`
  fa.assigned_to, au.display_name AS assignee_name, fa.reminder_count, fa.last_reminded_at
`;

function toItem(
  entityType: FreshnessGroup,
  row: AssignmentJoin & { id: string; title: string; context: string; authority: string | null; review_due_at: Date | null },
  now: Date,
): FreshnessItem {
  return {
    entityType,
    id: row.id,
    title: row.title,
    context: row.context,
    authority: row.authority,
    reviewDueAt: row.review_due_at,
    state: classifyFreshness(row.review_due_at, now),
    daysOverdue: daysOverdue(row.review_due_at, now),
    assignedToId: row.assigned_to,
    assignedToName: row.assignee_name,
    reminderCount: row.reminder_count ?? 0,
    lastRemindedAt: row.last_reminded_at,
  };
}

export const freshnessRepository = {
  /** Every record that is stale or inside the expiring window, across groups. */
  async listDue(now: Date = new Date()): Promise<FreshnessItem[]> {
    const horizon = sql`now() + make_interval(days => ${EXPIRING_WINDOW_DAYS})`;

    const rules = await sql<Array<AssignmentJoin & { id: string; title: string; context: string; authority: string | null; review_due_at: Date }>>`
      SELECT r.id, r.title,
             COALESCE(p.name, d.name, 'Whole area') AS context,
             s.issuing_authority AS authority,
             r.review_due_at,
             ${ASSIGNMENT_COLUMNS}
      FROM rule_content r
      JOIN source_records s ON s.id = r.source_id
      LEFT JOIN places p ON p.id = r.place_id
      LEFT JOIN destinations d ON d.id = r.destination_id
      ${assignment('rule', 'r.id')}
      WHERE r.status = 'active' AND r.review_due_at < ${horizon}
    `;

    const facilities = await sql<Array<AssignmentJoin & { id: string; title: string; context: string; authority: string | null; review_due_at: Date | null }>>`
      SELECT h.id, h.name AS title,
             replace(h.facility_type, '_', ' ') AS context,
             s.issuing_authority AS authority,
             h.review_due_at,
             ${ASSIGNMENT_COLUMNS}
      FROM help_facilities h
      LEFT JOIN source_records s ON s.id = h.source_id
      ${assignment('help_facility', 'h.id')}
      WHERE h.status = 'active' AND (h.review_due_at IS NULL OR h.review_due_at < ${horizon})
    `;

    // Sources that back operating hours, with the places that depend on them.
    const hours = await sql<Array<AssignmentJoin & { id: string; title: string; context: string; authority: string | null; review_due_at: Date | null }>>`
      SELECT s.id,
             COALESCE(s.issuing_authority, s.name) AS title,
             'Backs hours for ' || string_agg(DISTINCT p.name, ', ' ORDER BY p.name) AS context,
             s.issuing_authority AS authority,
             s.review_due_at,
             ${ASSIGNMENT_COLUMNS}
      FROM source_records s
      JOIN place_sources ps ON ps.source_id = s.id AND ps.field_scope = 'hours'
      JOIN places p ON p.id = ps.place_id AND p.status = 'active'
      ${assignment('source', 's.id')}
      WHERE s.review_due_at IS NULL OR s.review_due_at < ${horizon}
      GROUP BY s.id, s.issuing_authority, s.name, s.review_due_at,
               fa.assigned_to, au.display_name, fa.reminder_count, fa.last_reminded_at
    `;

    // Businesses are due a fixed period after their last confirmation, by the
    // owner or by a reviewer, whichever is later.
    const businesses = await sql<Array<AssignmentJoin & { id: string; title: string; context: string; authority: string | null; review_due_at: Date | null }>>`
      SELECT b.id, b.name AS title,
             replace(b.category, '_', ' ') AS context,
             'Business owner' AS authority,
             GREATEST(
               b.last_owner_update_at,
               (SELECT max(v.reviewed_at) FROM business_verifications v
                 WHERE v.business_id = b.id AND v.status = 'approved')
             ) + make_interval(days => ${BUSINESS_CONFIRMATION_DAYS}) AS review_due_at,
             ${ASSIGNMENT_COLUMNS}
      FROM local_businesses b
      ${assignment('business', 'b.id')}
      WHERE b.status = 'active'
    `;

    const items = [
      ...rules.map((row) => toItem('rule', row, now)),
      ...facilities.map((row) => toItem('help_facility', row, now)),
      ...hours.map((row) => toItem('source', row, now)),
      ...businesses.map((row) => toItem('business', row, now)),
    ].filter((item) => item.state !== 'fresh');

    // Most overdue first. A record with no date at all goes to the top.
    return items.sort((a, b) => (b.daysOverdue ?? Number.MAX_SAFE_INTEGER) - (a.daysOverdue ?? Number.MAX_SAFE_INTEGER));
  },

  /** People who can be assigned freshness work. */
  async assignableReviewers(): Promise<Array<{ id: string; name: string }>> {
    return sql<Array<{ id: string; name: string }>>`
      SELECT DISTINCT u.id, u.display_name AS name
      FROM users u
      JOIN user_roles r ON r.user_id = u.id
      WHERE r.role IN ('verifier', 'tourism_admin', 'platform_admin')
        AND u.status = 'active'
      ORDER BY u.display_name
    `;
  },

  async assign(input: {
    entityType: FreshnessGroup;
    entityId: string;
    assignedTo: string | null;
    assignedBy: string;
    note: string | null;
  }): Promise<void> {
    await sql`
      INSERT INTO freshness_assignments (entity_type, entity_id, assigned_to, assigned_by, note)
      VALUES (${input.entityType}, ${input.entityId}, ${input.assignedTo}, ${input.assignedBy}, ${input.note})
      ON CONFLICT (entity_type, entity_id) DO UPDATE
        SET assigned_to = EXCLUDED.assigned_to,
            assigned_by = EXCLUDED.assigned_by,
            note = COALESCE(EXCLUDED.note, freshness_assignments.note),
            updated_at = now()
    `;
  },

  /**
   * Records a reminder against each record. Creates the assignment row if one
   * does not exist, so an unassigned record still accumulates its reminders.
   */
  async remind(entries: Array<{ entityType: FreshnessGroup; entityId: string }>, actor: string): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await sql`
        INSERT INTO freshness_assignments (entity_type, entity_id, assigned_by, last_reminded_at, reminder_count)
        VALUES (${entry.entityType}, ${entry.entityId}, ${actor}, now(), 1)
        ON CONFLICT (entity_type, entity_id) DO UPDATE
          SET last_reminded_at = now(),
              reminder_count = freshness_assignments.reminder_count + 1,
              updated_at = now()
      `;
      count += 1;
    }
    return count;
  },

  /**
   * Re-verifies a single record against its source. There is intentionally
   * no batch form of this method.
   */
  async reverify(
    entityType: FreshnessGroup,
    entityId: string,
    reviewer: string,
    note: string,
  ): Promise<{ before: Date | null; after: Date } | null> {
    const days = REVERIFY_DAYS[entityType];

    switch (entityType) {
      case 'rule': {
        const [row] = await sql<{ before: Date | null; after: Date }[]>`
          UPDATE rule_content r
          SET verified_at = now(), review_due_at = now() + make_interval(days => ${days})
          FROM (SELECT review_due_at FROM rule_content WHERE id = ${entityId}) old
          WHERE r.id = ${entityId}
          RETURNING old.review_due_at AS before, r.review_due_at AS after
        `;
        return row ?? null;
      }
      case 'help_facility': {
        const [row] = await sql<{ before: Date | null; after: Date }[]>`
          UPDATE help_facilities h
          SET verified_at = now(), review_due_at = now() + make_interval(days => ${days})
          FROM (SELECT review_due_at FROM help_facilities WHERE id = ${entityId}) old
          WHERE h.id = ${entityId}
          RETURNING old.review_due_at AS before, h.review_due_at AS after
        `;
        return row ?? null;
      }
      case 'source': {
        const [row] = await sql<{ before: Date | null; after: Date }[]>`
          UPDATE source_records s
          SET verified_at = now(), review_due_at = now() + make_interval(days => ${days})
          FROM (SELECT review_due_at FROM source_records WHERE id = ${entityId}) old
          WHERE s.id = ${entityId}
          RETURNING old.review_due_at AS before, s.review_due_at AS after
        `;
        return row ?? null;
      }
      case 'business': {
        const [exists] = await sql<{ id: string }[]>`SELECT id FROM local_businesses WHERE id = ${entityId}`;
        if (exists === undefined) return null;

        // A reviewer confirming a business's details is a verification event,
        // not an owner update, so it is recorded as one.
        await sql`
          INSERT INTO business_verifications (
            business_id, status, evidence_summary, reviewer_user_id, reviewed_at, expires_at, decision_reason
          ) VALUES (
            ${entityId}, 'approved', ${sql.json({ freshnessCheck: true })}, ${reviewer},
            now(), now() + make_interval(days => ${days}), ${note}
          )
        `;
        return { before: null, after: new Date(Date.now() + days * 86_400_000) };
      }
      default:
        return null;
    }
  },
};
