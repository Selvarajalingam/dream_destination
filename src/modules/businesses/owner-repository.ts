import type { Sql } from 'postgres';
import { sql, withTransaction } from '@/platform/db/client';
import type {
  Accessibility,
  BusinessCategory,
  DraftPatch,
  Hours,
  OwnerListing,
  TemporaryClosure,
} from './domain/listing';

/**
 * Business owner persistence — PRD Part I B01–B06.
 *
 * Every read here is scoped to the owner in the query itself. An id that
 * belongs to someone else returns nothing, exactly as an id that does not
 * exist, so a listing id is never an oracle.
 */

export type OwnerListingSummary = {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: string;
  verificationStatus: string | null;
  hasPendingChange: boolean;
  createdAt: Date;
};

export type OwnerFile = {
  id: string;
  purpose: 'photo' | 'evidence';
  evidenceKind: string | null;
  originalName: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
};

export type OwnerListingRecord = OwnerListing & {
  id: string;
  slug: string;
  status: string;
  sponsored: boolean;
  sponsorshipRequestedAt: Date | null;
  sponsorshipDecidedAt: Date | null;
  sponsorshipDecisionReason: string | null;
  lastOwnerUpdateAt: Date | null;
  temporaryClosure: TemporaryClosure | null;
  availabilityNote: string | null;
  pendingChange: DraftPatch | null;
  /** The newest verification request of any kind. */
  verification: {
    status: string;
    kind: 'listing' | 'sensitive_change';
    decisionReason: string | null;
    createdAt: Date;
  } | null;
  /** When the current approval lapses, if the listing has one. */
  approvedUntil: Date | null;
  files: OwnerFile[];
};

type ListingRow = {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory | null;
  description: string | null;
  address: { line?: string | null; locality?: string | null; pin?: string | null };
  contact: { phone?: string | null; ownerName?: string | null };
  lat: number;
  lng: number;
  locationConfirmed: boolean;
  hours: Hours;
  priceBand: number | null;
  services: string[];
  paymentMethods: string[] | null;
  accessibility: Accessibility;
  status: string;
  sponsored: boolean;
  sponsorshipRequestedAt: Date | null;
  sponsorshipDecidedAt: Date | null;
  sponsorshipDecisionReason: string | null;
  lastOwnerUpdateAt: Date | null;
  temporaryClosure: TemporaryClosure | null;
  availabilityNote: string | null;
  pendingChange: DraftPatch | null;
  verificationStatus: string | null;
  verificationKind: 'listing' | 'sensitive_change' | null;
  verificationReason: string | null;
  verificationCreatedAt: Date | null;
  approvedUntil: Date | null;
};

/** A new draft has no category until the owner picks one. */
const DRAFT_CATEGORY = 'uncategorised';

export const ownerRepository = {
  async listMine(userId: string): Promise<OwnerListingSummary[]> {
    return sql<OwnerListingSummary[]>`
      SELECT b.id, b.slug, b.name, b.category, b.status::text AS status,
             v.status::text AS "verificationStatus",
             (b.pending_change IS NOT NULL) AS "hasPendingChange",
             b.created_at AS "createdAt"
      FROM local_businesses b
      LEFT JOIN LATERAL (
        SELECT status FROM business_verifications bv
        WHERE bv.business_id = b.id ORDER BY bv.created_at DESC LIMIT 1
      ) v ON true
      WHERE b.owner_user_id = ${userId}
      ORDER BY b.created_at DESC
    `;
  },

  async findMine(businessId: string, userId: string): Promise<OwnerListingRecord | null> {
    const [row] = await sql<ListingRow[]>`
      SELECT b.id, b.slug, b.name,
             NULLIF(b.category, ${DRAFT_CATEGORY}) AS category,
             b.description, b.address, b.contact,
             ST_Y(b.location::geometry) AS lat,
             ST_X(b.location::geometry) AS lng,
             b.location_confirmed AS "locationConfirmed",
             b.operating_hours AS hours,
             b.price_band AS "priceBand",
             b.services,
             b.payment_methods AS "paymentMethods",
             b.accessibility,
             b.status::text AS status,
             b.sponsored,
             b.sponsorship_requested_at AS "sponsorshipRequestedAt",
             b.sponsorship_decided_at AS "sponsorshipDecidedAt",
             b.sponsorship_decision_reason AS "sponsorshipDecisionReason",
             b.last_owner_update_at AS "lastOwnerUpdateAt",
             b.temporary_closure AS "temporaryClosure",
             b.availability_note AS "availabilityNote",
             b.pending_change AS "pendingChange",
             v.status::text AS "verificationStatus",
             v.request_kind AS "verificationKind",
             v.decision_reason AS "verificationReason",
             v.created_at AS "verificationCreatedAt",
             (
               SELECT max(av.expires_at) FROM business_verifications av
               WHERE av.business_id = b.id AND av.status = 'approved'
                 AND (av.expires_at IS NULL OR av.expires_at > now())
             ) AS "approvedUntil"
      FROM local_businesses b
      LEFT JOIN LATERAL (
        SELECT * FROM business_verifications bv
        WHERE bv.business_id = b.id ORDER BY bv.created_at DESC LIMIT 1
      ) v ON true
      WHERE b.id = ${businessId} AND b.owner_user_id = ${userId}
    `;

    if (row === undefined) return null;

    const files = await sql<OwnerFile[]>`
      SELECT id, purpose, evidence_kind AS "evidenceKind", original_name AS "originalName",
             content_type AS "contentType", byte_size AS "byteSize", created_at AS "createdAt"
      FROM business_files WHERE business_id = ${businessId}
      ORDER BY created_at
    `;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description,
      addressLine: row.address.line ?? null,
      locality: row.address.locality ?? null,
      pin: row.address.pin ?? null,
      lat: row.lat,
      lng: row.lng,
      locationConfirmed: row.locationConfirmed,
      phone: row.contact.phone ?? null,
      ownerName: row.contact.ownerName ?? null,
      hours: row.hours,
      priceBand: row.priceBand,
      services: row.services,
      paymentMethods: row.paymentMethods ?? [],
      accessibility: row.accessibility,
      status: row.status,
      sponsored: row.sponsored,
      sponsorshipRequestedAt: row.sponsorshipRequestedAt,
      sponsorshipDecidedAt: row.sponsorshipDecidedAt,
      sponsorshipDecisionReason: row.sponsorshipDecisionReason,
      lastOwnerUpdateAt: row.lastOwnerUpdateAt,
      temporaryClosure: row.temporaryClosure,
      availabilityNote: row.availabilityNote,
      pendingChange: row.pendingChange,
      verification:
        row.verificationStatus === null
          ? null
          : {
              status: row.verificationStatus,
              kind: row.verificationKind ?? 'listing',
              decisionReason: row.verificationReason,
              createdAt: row.verificationCreatedAt!,
            },
      approvedUntil: row.approvedUntil,
      files,
    };
  },

  async createDraft(input: { ownerUserId: string; name: string; slug: string; lat: number; lng: number; locality: string }): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO local_businesses (
        owner_user_id, slug, name, category, location, location_confirmed, address, status
      ) VALUES (
        ${input.ownerUserId}, ${input.slug}, ${input.name}, ${DRAFT_CATEGORY},
        ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
        false, ${sql.json({ locality: input.locality })}, 'draft'
      )
      RETURNING id
    `;
    return row.id;
  },

  /**
   * Writes whichever fields are present. Also used for live rapid updates,
   * and inside A07's transaction when an approved change is applied.
   */
  async saveFields(
    businessId: string,
    patch: DraftPatch,
    options: { confirmsDetails: boolean },
    db: Sql = sql,
  ): Promise<void> {
    const sets = [];

    if (patch.name !== undefined) sets.push(db`name = ${patch.name}`);
    if (patch.category !== undefined) sets.push(db`category = ${patch.category}`);
    if (patch.description !== undefined) sets.push(db`description = ${patch.description}`);

    const address: Record<string, string | null> = {};
    if (patch.addressLine !== undefined) address.line = patch.addressLine;
    if (patch.locality !== undefined) address.locality = patch.locality;
    if (patch.pin !== undefined) address.pin = patch.pin;
    if (Object.keys(address).length > 0) sets.push(db`address = address || ${db.json(address)}`);

    const contact: Record<string, string | null> = {};
    if (patch.phone !== undefined) contact.phone = patch.phone;
    if (patch.ownerName !== undefined) contact.ownerName = patch.ownerName;
    if (Object.keys(contact).length > 0) sets.push(db`contact = contact || ${db.json(contact)}`);

    if (patch.location !== undefined) {
      sets.push(db`location = ST_SetSRID(ST_MakePoint(${patch.location.lng}, ${patch.location.lat}), 4326)::geography`);
      sets.push(db`location_confirmed = true`);
    }
    if (patch.hours !== undefined) sets.push(db`operating_hours = ${db.json(patch.hours)}`);
    if (patch.priceBand !== undefined) sets.push(db`price_band = ${patch.priceBand}`);
    if (patch.services !== undefined) sets.push(db`services = ${db.array(patch.services)}`);
    if (patch.paymentMethods !== undefined) sets.push(db`payment_methods = ${db.array(patch.paymentMethods)}`);
    if (patch.accessibility !== undefined) sets.push(db`accessibility = ${db.json(patch.accessibility as never)}`);
    if (options.confirmsDetails) sets.push(db`last_owner_update_at = now()`);

    if (sets.length === 0) return;
    sets.push(db`updated_at = now()`);

    const assignments = sets.reduce((all, next) => db`${all}, ${next}`);
    await db`UPDATE local_businesses SET ${assignments} WHERE id = ${businessId}`;
  },

  /** The owner confirms nothing has changed, which resets the review clock. */
  async confirmDetails(businessId: string): Promise<void> {
    await sql`UPDATE local_businesses SET last_owner_update_at = now(), updated_at = now() WHERE id = ${businessId}`;
  },

  async setClosure(businessId: string, closure: TemporaryClosure | null): Promise<void> {
    await sql`
      UPDATE local_businesses
      SET temporary_closure = ${closure === null ? null : sql.json(closure)},
          last_owner_update_at = now(), updated_at = now()
      WHERE id = ${businessId}
    `;
  },

  async setAvailability(businessId: string, note: string | null): Promise<void> {
    await sql`
      UPDATE local_businesses
      SET availability_note = ${note}, last_owner_update_at = now(), updated_at = now()
      WHERE id = ${businessId}
    `;
  },

  /** Sends a draft, or a listing returned for changes, to the A07 queue. */
  async submit(businessId: string, evidence: Record<string, string>): Promise<void> {
    await withTransaction(async (tx) => {
      await tx`
        INSERT INTO business_verifications (business_id, status, request_kind, evidence_summary)
        VALUES (${businessId}, 'under_review', 'listing', ${tx.json(evidence)})
      `;
      await tx`
        UPDATE local_businesses
        SET status = 'pending', last_owner_update_at = now(), updated_at = now()
        WHERE id = ${businessId}
      `;
    });
  },

  /** Holds a sensitive change for review. The live listing is untouched. */
  async requestSensitiveChange(businessId: string, change: DraftPatch, evidence: Record<string, string>): Promise<void> {
    await withTransaction(async (tx) => {
      await tx`
        UPDATE local_businesses SET pending_change = ${tx.json(change as never)}, updated_at = now()
        WHERE id = ${businessId}
      `;
      await tx`
        INSERT INTO business_verifications (business_id, status, request_kind, evidence_summary)
        VALUES (${businessId}, 'under_review', 'sensitive_change', ${tx.json(evidence)})
      `;
    });
  },

  async requestSponsorship(businessId: string): Promise<void> {
    await sql`
      UPDATE local_businesses
      SET sponsorship_requested_at = now(), sponsorship_decided_at = NULL,
          sponsorship_decision_reason = NULL, updated_at = now()
      WHERE id = ${businessId}
    `;
  },

  // --- Files ---------------------------------------------------------------

  async countFiles(businessId: string, purpose: 'photo' | 'evidence'): Promise<number> {
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM business_files WHERE business_id = ${businessId} AND purpose = ${purpose}
    `;
    return row.count;
  },

  async insertFile(input: {
    businessId: string;
    purpose: 'photo' | 'evidence';
    evidenceKind: string | null;
    originalName: string;
    contentType: string;
    byteSize: number;
    sha256: string;
    storageKey: string;
    uploadedBy: string;
  }): Promise<OwnerFile> {
    const [row] = await sql<OwnerFile[]>`
      INSERT INTO business_files (
        business_id, purpose, evidence_kind, original_name, content_type, byte_size, sha256, storage_key, uploaded_by
      ) VALUES (
        ${input.businessId}, ${input.purpose}, ${input.evidenceKind}, ${input.originalName},
        ${input.contentType}, ${input.byteSize}, ${input.sha256}, ${input.storageKey}, ${input.uploadedBy}
      )
      RETURNING id, purpose, evidence_kind AS "evidenceKind", original_name AS "originalName",
                content_type AS "contentType", byte_size AS "byteSize", created_at AS "createdAt"
    `;
    return row;
  },

  /** Deletes the row and returns the storage key, so the bytes can follow. */
  async deleteFile(fileId: string, businessId: string): Promise<string | null> {
    const [row] = await sql<{ storageKey: string }[]>`
      DELETE FROM business_files WHERE id = ${fileId} AND business_id = ${businessId}
      RETURNING storage_key AS "storageKey"
    `;
    return row?.storageKey ?? null;
  },

  /** A file with what is needed to decide who may read it. */
  async findFileForRead(fileId: string): Promise<{
    storageKey: string;
    contentType: string;
    originalName: string;
    purpose: 'photo' | 'evidence';
    ownerUserId: string | null;
    listingStatus: string;
  } | null> {
    const [row] = await sql<Array<{
      storageKey: string;
      contentType: string;
      originalName: string;
      purpose: 'photo' | 'evidence';
      ownerUserId: string | null;
      listingStatus: string;
    }>>`
      SELECT f.storage_key AS "storageKey", f.content_type AS "contentType",
             f.original_name AS "originalName", f.purpose,
             b.owner_user_id AS "ownerUserId", b.status::text AS "listingStatus"
      FROM business_files f JOIN local_businesses b ON b.id = f.business_id
      WHERE f.id = ${fileId}
    `;
    return row ?? null;
  },

  // --- Dashboard (B05) -----------------------------------------------------

  /** Traveller actions on this listing in the window, split by data origin. */
  async activity(businessId: string, days: number): Promise<Array<{ eventName: string; isDemo: boolean; count: number }>> {
    return sql<Array<{ eventName: string; isDemo: boolean; count: number }>>`
      SELECT event_name AS "eventName", is_demo AS "isDemo", count(*)::int AS count
      FROM analytics_events
      WHERE entity_type = 'business' AND entity_id = ${businessId}
        AND occurred_at > now() - make_interval(days => ${days})
      GROUP BY event_name, is_demo
    `;
  },

  /** Open traveller reports about this listing. The reporter is never read. */
  async openReports(businessId: string): Promise<Array<{
    id: string;
    category: string;
    severity: string;
    description: string;
    createdAt: Date;
    ownerResponse: string | null;
    ownerRespondedAt: Date | null;
  }>> {
    return sql`
      SELECT id, category, severity, description, created_at AS "createdAt",
             owner_response AS "ownerResponse", owner_responded_at AS "ownerRespondedAt"
      FROM incident_reports
      WHERE entity_type = 'business' AND entity_id = ${businessId}
        AND status IN ('open', 'investigating')
      ORDER BY created_at DESC
    `;
  },

  async respondToReport(reportId: string, businessId: string, response: string): Promise<boolean> {
    const rows = await sql`
      UPDATE incident_reports
      SET owner_response = ${response}, owner_responded_at = now()
      WHERE id = ${reportId} AND entity_type = 'business' AND entity_id = ${businessId}
        AND status IN ('open', 'investigating')
      RETURNING id
    `;
    return rows.length === 1;
  },
};
