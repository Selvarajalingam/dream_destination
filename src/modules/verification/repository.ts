import { sql } from '@/platform/db/client';
import type { Verification, VerificationChecklist, VerificationStatus } from './domain/types';

/**
 * Verification reads and decisions.
 *
 * The database enforces one approved verification per place through the
 * partial unique index in PRD Part II §6.8; this layer never works around it.
 */

type VerificationRow = {
  id: string;
  place_id: string;
  status: VerificationStatus;
  checklist: VerificationChecklist;
  known_limitations: string[] | null;
  reviewer_user_id: string | null;
  reviewed_at: Date | null;
  expires_at: Date | null;
  decision_reason: string | null;
  owner_user_id: string | null;
};

const toVerification = (row: VerificationRow): Verification => ({
  id: row.id,
  placeId: row.place_id,
  status: row.status,
  reviewedAt: row.reviewed_at,
  expiresAt: row.expires_at,
  knownLimitations: row.known_limitations ?? [],
  reviewerType: (row.checklist.reviewer?.value as string | undefined) ?? null,
  checklist: row.checklist,
  ownerUserId: row.owner_user_id,
  decisionReason: row.decision_reason,
});

/** A hidden gem's submitter, used to block self-approval. */
const OWNER_JOIN = sql`
  LEFT JOIN places pl ON pl.id = v.place_id
  LEFT JOIN local_businesses lb ON ST_DWithin(lb.location, pl.location, 50) AND lb.owner_user_id IS NOT NULL
`;

export const verificationRepository = {
  /** The verification that decides whether a place may show the badge. */
  async findForPlace(placeId: string): Promise<Verification | null> {
    const [row] = await sql<VerificationRow[]>`
      SELECT v.id, v.place_id, v.status, v.checklist, v.known_limitations,
             v.reviewer_user_id, v.reviewed_at, v.expires_at, v.decision_reason,
             lb.owner_user_id
      FROM hidden_gem_verifications v
      ${OWNER_JOIN}
      WHERE v.place_id = ${placeId}
      ORDER BY (v.status = 'approved') DESC, v.updated_at DESC
      LIMIT 1
    `;
    return row === undefined ? null : toVerification(row);
  },

  async findById(id: string): Promise<Verification | null> {
    const [row] = await sql<VerificationRow[]>`
      SELECT v.id, v.place_id, v.status, v.checklist, v.known_limitations,
             v.reviewer_user_id, v.reviewed_at, v.expires_at, v.decision_reason,
             lb.owner_user_id
      FROM hidden_gem_verifications v
      ${OWNER_JOIN}
      WHERE v.id = ${id}
      LIMIT 1
    `;
    return row === undefined ? null : toVerification(row);
  },

  /** Bulk lookup so a list of places needs one query, not N. */
  async findForPlaces(placeIds: string[]): Promise<Map<string, Verification>> {
    if (placeIds.length === 0) return new Map();

    const rows = await sql<VerificationRow[]>`
      SELECT DISTINCT ON (v.place_id)
             v.id, v.place_id, v.status, v.checklist, v.known_limitations,
             v.reviewer_user_id, v.reviewed_at, v.expires_at, v.decision_reason,
             NULL::uuid AS owner_user_id
      FROM hidden_gem_verifications v
      WHERE v.place_id = ANY(${sql.array(placeIds)}::uuid[])
      ORDER BY v.place_id, (v.status = 'approved') DESC, v.updated_at DESC
    `;

    return new Map(rows.map((row) => [row.place_id, toVerification(row)]));
  },

  /** The review queue for Screen A02. */
  async listQueue(): Promise<
    Array<{
      id: string;
      placeName: string;
      placeSlug: string;
      district: string | null;
      status: VerificationStatus;
      riskCategory: string;
      evidenceCompleteness: number;
      reviewerUserId: string | null;
      reviewerName: string | null;
      ageDays: number;
      submitterName: string;
    }>
  > {
    return sql`
      SELECT v.id,
             p.name AS "placeName",
             p.slug AS "placeSlug",
             d.district,
             v.status,
             p.category AS "riskCategory",
             (SELECT count(*) FROM jsonb_object_keys(v.checklist)) * 100 / 9 AS "evidenceCompleteness",
             v.reviewer_user_id AS "reviewerUserId",
             u.display_name AS "reviewerName",
             EXTRACT(DAY FROM now() - v.created_at)::int AS "ageDays",
             'Seeded demonstration submission' AS "submitterName"
      FROM hidden_gem_verifications v
      JOIN places p ON p.id = v.place_id
      LEFT JOIN destinations d ON d.id = p.destination_id
      LEFT JOIN users u ON u.id = v.reviewer_user_id
      WHERE v.status IN ('under_review', 'evidence_pending', 'changes_requested')
         OR (v.status = 'approved' AND v.expires_at < now())
      ORDER BY v.created_at
    ` as never;
  },

  /** Records a decision and bumps the version. A reason is mandatory. */
  async recordDecision(input: {
    verificationId: string;
    status: VerificationStatus;
    reviewerUserId: string;
    reason: string;
    expiresAt: Date | null;
  }): Promise<Verification | null> {
    const [row] = await sql<VerificationRow[]>`
      UPDATE hidden_gem_verifications v
      SET status = ${input.status},
          reviewer_user_id = ${input.reviewerUserId},
          reviewed_at = now(),
          expires_at = ${input.expiresAt},
          decision_reason = ${input.reason},
          version = v.version + 1,
          updated_at = now()
      WHERE v.id = ${input.verificationId}
      RETURNING v.id, v.place_id, v.status, v.checklist, v.known_limitations,
                v.reviewer_user_id, v.reviewed_at, v.expires_at, v.decision_reason,
                NULL::uuid AS owner_user_id
    `;
    return row === undefined ? null : toVerification(row);
  },

  /** Counts for the operations overview. */
  async expiringSoonCount(withinDays = 30): Promise<number> {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM hidden_gem_verifications
      WHERE status = 'approved'
        AND expires_at IS NOT NULL
        AND expires_at BETWEEN now() AND now() + make_interval(days => ${withinDays})
    `;
    return Number(row.count);
  },
};
