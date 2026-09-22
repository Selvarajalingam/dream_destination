import { sql, withTransaction } from '@/platform/db/client';
import type { BusinessCheck, ListingDecision } from './domain/review';

/**
 * Business review persistence for Screen A07.
 *
 * Listing verification and sponsored placement are two queues with two
 * decisions. They share this file only because they share a table.
 */

export type ReviewQueueRow = {
  businessId: string;
  verificationId: string;
  name: string;
  slug: string;
  category: string;
  verificationStatus: string;
  submittedAt: Date;
  sponsorshipRequested: boolean;
};

export type SponsorshipQueueRow = {
  businessId: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  ownerVerified: boolean;
  requestedAt: Date;
};

export type BusinessReviewDetail = {
  businessId: string;
  verificationId: string | null;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  status: string;
  ownerUserId: string | null;
  ownerName: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  priceBand: number | null;
  verificationStatus: string | null;
  evidence: Record<string, string>;
  decisionReason: string | null;
  sponsored: boolean;
  sponsorshipRequestedAt: Date | null;
  sponsorshipDecidedAt: Date | null;
  sponsorshipDecisionReason: string | null;
  ownerVerified: boolean;
};

export const businessReviewRepository = {
  async verificationQueue(): Promise<ReviewQueueRow[]> {
    return sql<ReviewQueueRow[]>`
      SELECT DISTINCT ON (b.id)
             b.id AS "businessId",
             v.id AS "verificationId",
             b.name, b.slug, b.category,
             v.status AS "verificationStatus",
             v.created_at AS "submittedAt",
             (b.sponsorship_requested_at IS NOT NULL AND b.sponsorship_decided_at IS NULL) AS "sponsorshipRequested"
      FROM local_businesses b
      JOIN business_verifications v ON v.business_id = b.id
      WHERE v.status IN ('under_review', 'evidence_pending', 'changes_requested')
      ORDER BY b.id, v.created_at DESC
    `;
  },

  async sponsorshipQueue(): Promise<SponsorshipQueueRow[]> {
    return sql<SponsorshipQueueRow[]>`
      SELECT b.id AS "businessId", b.name, b.slug, b.category, b.status,
             EXISTS (
               SELECT 1 FROM business_verifications v
               WHERE v.business_id = b.id AND v.status = 'approved'
                 AND (v.expires_at IS NULL OR v.expires_at > now())
             ) AS "ownerVerified",
             b.sponsorship_requested_at AS "requestedAt"
      FROM local_businesses b
      WHERE b.sponsorship_requested_at IS NOT NULL AND b.sponsorship_decided_at IS NULL
      ORDER BY b.sponsorship_requested_at
    `;
  },

  async findDetail(businessId: string): Promise<BusinessReviewDetail | null> {
    const [row] = await sql<Array<Omit<BusinessReviewDetail, 'evidence'> & { evidence: Record<string, unknown> | null }>>`
      SELECT b.id AS "businessId",
             v.id AS "verificationId",
             b.name, b.slug, b.category, b.description,
             b.status::text AS status,
             b.owner_user_id AS "ownerUserId",
             u.display_name AS "ownerName",
             b.contact->>'phone' AS phone,
             ST_Y(b.location::geometry) AS lat,
             ST_X(b.location::geometry) AS lng,
             b.price_band AS "priceBand",
             v.status::text AS "verificationStatus",
             v.evidence_summary AS evidence,
             v.decision_reason AS "decisionReason",
             b.sponsored,
             b.sponsorship_requested_at AS "sponsorshipRequestedAt",
             b.sponsorship_decided_at AS "sponsorshipDecidedAt",
             b.sponsorship_decision_reason AS "sponsorshipDecisionReason",
             EXISTS (
               SELECT 1 FROM business_verifications av
               WHERE av.business_id = b.id AND av.status = 'approved'
                 AND (av.expires_at IS NULL OR av.expires_at > now())
             ) AS "ownerVerified"
      FROM local_businesses b
      LEFT JOIN users u ON u.id = b.owner_user_id
      LEFT JOIN LATERAL (
        SELECT * FROM business_verifications bv
        WHERE bv.business_id = b.id
        ORDER BY (bv.status IN ('under_review', 'evidence_pending', 'changes_requested')) DESC, bv.created_at DESC
        LIMIT 1
      ) v ON true
      WHERE b.id = ${businessId}
    `;

    if (row === undefined) return null;

    // Only the evidence text is shown; bookkeeping flags stay out of the view.
    const evidence: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.evidence ?? {})) {
      if (typeof value === 'string') evidence[key] = value;
    }

    return { ...row, evidence };
  },

  /** Records a listing decision and moves the listing to its new status. */
  async decideListing(input: {
    businessId: string;
    verificationId: string;
    decision: ListingDecision;
    status: 'active' | 'pending' | 'rejected';
    reviewerUserId: string;
    reason: string;
    confirmedChecks: BusinessCheck[];
  }): Promise<void> {
    await withTransaction(async (tx) => {
      await tx`
        UPDATE business_verifications
        SET status = ${input.decision},
            reviewer_user_id = ${input.reviewerUserId},
            reviewed_at = now(),
            expires_at = ${input.decision === 'approved' ? tx`now() + interval '6 months'` : null},
            decision_reason = ${input.reason},
            evidence_summary = evidence_summary || ${tx.json({ confirmedChecks: input.confirmedChecks })}
        WHERE id = ${input.verificationId}
      `;
      await tx`
        UPDATE local_businesses SET status = ${input.status}, updated_at = now()
        WHERE id = ${input.businessId}
      `;
    });
  },

  async decideSponsorship(input: {
    businessId: string;
    sponsored: boolean;
    reason: string;
    /** A revocation closes nothing, since there is no open request. */
    closesRequest: boolean;
  }): Promise<void> {
    await sql`
      UPDATE local_businesses
      SET sponsored = ${input.sponsored},
          sponsorship_decided_at = ${input.closesRequest ? sql`now()` : sql`sponsorship_decided_at`},
          sponsorship_decision_reason = ${input.reason},
          updated_at = now()
      WHERE id = ${input.businessId}
    `;
  },
};
