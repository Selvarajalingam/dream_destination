import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getObjectStore } from '@/platform/storage';
import { logger } from '@/platform/observability/logger';
import { recordAudit } from '@/server/authorize';
import { DomainError } from '@/shared/result';
import { todayInIndia } from '@/shared/time';
import { catalogRepository } from '@/modules/catalog/repository';
import { ownerRequirements, summariseActivity, ACTIVITY_WINDOW_DAYS } from './domain/dashboard';
import { checkSize, checkUpload, safeFileName, type UploadPurpose } from './domain/files';
import {
  MIN_CHANGE_NOTE,
  evidenceSummary,
  listingGaps,
  ownerMode,
  parseDraftPatch,
  requiredEvidence,
  slugFor,
  splitUpdate,
  submissionBlockers,
  validateClosure,
  type DraftPatch,
  type OwnerMode,
  type TemporaryClosure,
} from './domain/listing';
import { ownerRepository, type OwnerFile, type OwnerListingRecord } from './owner-repository';

/**
 * The business owner flow — PRD Part I B01–B06.
 *
 * Every operation loads the listing scoped to the signed-in owner first, and
 * checks what the listing's state allows before changing anything.
 */

const refuse = (message: string, status = 409): DomainError => new DomainError('business_owner.refused', message, status);
const notFound = (): DomainError => new DomainError('business_owner.not_found', 'That listing was not found.', 404);

export type Actor = { userId: string; requestId?: string };

async function load(businessId: string, actor: Actor): Promise<OwnerListingRecord & { mode: OwnerMode }> {
  const record = await ownerRepository.findMine(businessId, actor.userId);
  if (record === null) throw notFound();
  return { ...record, mode: ownerMode(record.status, record.verification?.status ?? null) };
}

function requireMode(record: { mode: OwnerMode }, ...allowed: OwnerMode[]): void {
  if (allowed.includes(record.mode)) return;
  const message: Record<OwnerMode, string> = {
    editing: 'This listing is still being set up. Finish and submit it first.',
    in_review: 'This listing is with a reviewer, so it cannot change until they decide.',
    live: 'This listing is live. Use the updates page to change it.',
    closed: 'This listing is closed, so it cannot be changed.',
  };
  throw refuse(message[record.mode]);
}

const photos = (files: readonly OwnerFile[]) => files.filter((file) => file.purpose === 'photo');
const evidence = (files: readonly OwnerFile[]) => files.filter((file) => file.purpose === 'evidence');

export const ownerService = {
  load,

  async listMine(actor: Actor) {
    return ownerRepository.listMine(actor.userId);
  },

  /** B01: starts a draft in a pilot area. The pin starts at the area centre. */
  async start(input: { name: string; destinationSlug: string }, actor: Actor): Promise<{ id: string }> {
    const destination = await catalogRepository.findDestinationBySlug(input.destinationSlug);
    if (destination === null) throw refuse('Choose one of the pilot areas.', 400);

    const name = input.name.trim();
    const id = await ownerRepository.createDraft({
      ownerUserId: actor.userId,
      name,
      slug: slugFor(name, randomBytes(3).toString('hex')),
      lat: destination.lat,
      lng: destination.lng,
      locality: destination.name,
    });

    await recordAudit({
      actorUserId: actor.userId,
      action: 'business_listing.draft_created',
      entityType: 'business',
      entityId: id,
      afterState: { name, area: destination.slug },
      requestId: actor.requestId,
    });

    return { id };
  },

  /** B02 autosave: keeps every valid field and reports the invalid ones. */
  async saveDraft(businessId: string, input: Record<string, unknown>, actor: Actor): Promise<{ saved: string[]; errors: Record<string, string> }> {
    const record = await load(businessId, actor);
    requireMode(record, 'editing');

    const { values, errors } = parseDraftPatch(input);
    await ownerRepository.saveFields(businessId, values, { confirmsDetails: false });
    return { saved: Object.keys(values), errors };
  },

  /** B02 photos and B03 evidence. Nothing is stored until every check passes. */
  async upload(
    businessId: string,
    input: { purpose: UploadPurpose; evidenceKind: string | null; file: File },
    actor: Actor,
  ): Promise<OwnerFile> {
    const record = await load(businessId, actor);
    // Evidence is part of what a reviewer judges, so it is fixed once sent.
    // Photos can be refreshed on a live listing, like any rapid detail.
    if (input.purpose === 'evidence') requireMode(record, 'editing');
    else requireMode(record, 'editing', 'live');

    if (input.purpose === 'evidence') {
      const kinds = requiredEvidence(record.category).map((item) => item.kind as string);
      if (record.category === null) throw refuse('Choose a category first, so we know which evidence to ask for.', 400);
      if (input.evidenceKind === null || !kinds.includes(input.evidenceKind)) {
        throw refuse('That is not one of the documents asked for.', 400);
      }
    }

    const sizeProblem = checkSize(input.file.size);
    if (sizeProblem !== null) throw refuse(sizeProblem, 400);

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const check = checkUpload({
      purpose: input.purpose,
      size: bytes.byteLength,
      bytes,
      alreadyStored: input.purpose === 'photo' ? photos(record.files).length : evidence(record.files).length,
    });
    if (!check.ok) throw refuse(check.reason, 400);

    const storageKey = `business/${businessId}/${randomUUID()}`;
    await getObjectStore().put(storageKey, bytes);

    try {
      const file = await ownerRepository.insertFile({
        businessId,
        purpose: input.purpose,
        evidenceKind: input.purpose === 'evidence' ? input.evidenceKind : null,
        originalName: safeFileName(input.file.name),
        contentType: check.contentType,
        byteSize: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        storageKey,
        uploadedBy: actor.userId,
      });

      await recordAudit({
        actorUserId: actor.userId,
        action: `business_file.${input.purpose}_uploaded`,
        entityType: 'business',
        entityId: businessId,
        afterState: { fileId: file.id, evidenceKind: file.evidenceKind, contentType: file.contentType, byteSize: file.byteSize },
        requestId: actor.requestId,
      });

      return file;
    } catch (error) {
      // No row, no bytes: an orphaned object is removed rather than left behind.
      await getObjectStore().delete(storageKey).catch(() => undefined);
      throw error;
    }
  },

  async deleteFile(businessId: string, fileId: string, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    const file = record.files.find((candidate) => candidate.id === fileId);
    if (file === undefined) throw notFound();
    if (file.purpose === 'evidence') requireMode(record, 'editing');
    else requireMode(record, 'editing', 'live');

    const storageKey = await ownerRepository.deleteFile(fileId, businessId);
    if (storageKey !== null) {
      await getObjectStore().delete(storageKey).catch((error: unknown) => {
        logger.warn('storage.delete_failed', { storageKey, error: String(error) });
      });
    }

    await recordAudit({
      actorUserId: actor.userId,
      action: `business_file.${file.purpose}_removed`,
      entityType: 'business',
      entityId: businessId,
      beforeState: { fileId, evidenceKind: file.evidenceKind },
      requestId: actor.requestId,
    });
  },

  /** B03: sends the listing to the A07 queue. It stays pending until decided. */
  async submit(businessId: string, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    requireMode(record, 'editing');

    const evidenceFiles = evidence(record.files);
    const blockers = submissionBlockers(
      record,
      photos(record.files).length,
      new Set(evidenceFiles.map((file) => file.evidenceKind ?? '')),
    );
    if (blockers.length > 0) throw refuse(`Not ready to send yet. ${blockers.join(' ')}`, 400);

    await ownerRepository.submit(businessId, evidenceSummary(record, evidenceFiles));

    await recordAudit({
      actorUserId: actor.userId,
      action: 'business_listing.submitted',
      entityType: 'business',
      entityId: businessId,
      beforeState: { status: record.status, verification: record.verification?.status ?? null },
      afterState: { status: 'pending', verification: 'under_review' },
      requestId: actor.requestId,
    });
  },

  /**
   * B06: rapid fields apply at once; sensitive ones wait for review. A
   * request mixing both applies the rapid part and holds the rest.
   */
  async update(
    businessId: string,
    input: { fields: Record<string, unknown>; note?: string },
    actor: Actor,
  ): Promise<{ applied: string[]; heldForReview: string[] }> {
    const record = await load(businessId, actor);
    requireMode(record, 'live');

    const { values, errors } = parseDraftPatch(input.fields);
    const invalid = Object.entries(errors);
    if (invalid.length > 0) {
      throw new DomainError('business_owner.invalid', invalid.map(([field, message]) => `${field}: ${message}`).join(' '), 400);
    }

    const { rapid, sensitive } = splitUpdate(values);
    const heldForReview = Object.keys(sensitive);

    if (heldForReview.length > 0) {
      if (record.pendingChange !== null) {
        throw refuse('A change to your name, address, pin or owner is already waiting for review. Wait for that decision first.');
      }
      const note = (input.note ?? '').trim();
      if (note.length < MIN_CHANGE_NOTE) {
        throw refuse('Say why this change is needed, so the reviewer can check it.', 400);
      }
    }

    if (Object.keys(rapid).length > 0) {
      await ownerRepository.saveFields(businessId, rapid, { confirmsDetails: true });
      await recordAudit({
        actorUserId: actor.userId,
        action: 'business_listing.updated',
        entityType: 'business',
        entityId: businessId,
        afterState: rapid,
        requestId: actor.requestId,
      });
    }

    if (heldForReview.length > 0) {
      await ownerRepository.requestSensitiveChange(businessId, sensitive, changeSummary(record, sensitive, input.note!.trim()));
      await recordAudit({
        actorUserId: actor.userId,
        action: 'business_listing.change_requested',
        entityType: 'business',
        entityId: businessId,
        afterState: { fields: heldForReview },
        requestId: actor.requestId,
      });
    }

    return { applied: Object.keys(rapid), heldForReview };
  },

  /** "Nothing has changed" is an update too: it resets the review clock. */
  async confirmDetails(businessId: string, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    requireMode(record, 'live');
    await ownerRepository.confirmDetails(businessId);
    await recordAudit({
      actorUserId: actor.userId,
      action: 'business_listing.details_confirmed',
      entityType: 'business',
      entityId: businessId,
      requestId: actor.requestId,
    });
  },

  async setClosure(businessId: string, closure: TemporaryClosure | null, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    requireMode(record, 'live');
    if (closure !== null) {
      const problem = validateClosure(closure, todayInIndia());
      if (problem !== null) throw refuse(problem, 400);
    }
    await ownerRepository.setClosure(businessId, closure);
    await recordAudit({
      actorUserId: actor.userId,
      action: closure === null ? 'business_listing.reopened' : 'business_listing.temporarily_closed',
      entityType: 'business',
      entityId: businessId,
      beforeState: { closure: record.temporaryClosure },
      afterState: { closure },
      requestId: actor.requestId,
    });
  },

  async setAvailability(businessId: string, note: string | null, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    requireMode(record, 'live');
    await ownerRepository.setAvailability(businessId, note);
    await recordAudit({
      actorUserId: actor.userId,
      action: 'business_listing.availability_updated',
      entityType: 'business',
      entityId: businessId,
      afterState: { availabilityNote: note },
      requestId: actor.requestId,
    });
  },

  /** Asks for sponsored placement. A07 decides it separately from verification. */
  async requestSponsorship(businessId: string, actor: Actor): Promise<void> {
    const record = await load(businessId, actor);
    requireMode(record, 'live');
    if (record.approvedUntil === null) throw refuse('Sponsored placement is only available to a verified listing.');
    if (record.sponsored) throw refuse('This listing is already sponsored.');
    if (record.sponsorshipRequestedAt !== null && record.sponsorshipDecidedAt === null) {
      throw refuse('A sponsorship request is already waiting for a decision.');
    }
    await ownerRepository.requestSponsorship(businessId);
    await recordAudit({
      actorUserId: actor.userId,
      action: 'business_sponsorship.requested',
      entityType: 'business',
      entityId: businessId,
      requestId: actor.requestId,
    });
  },

  /** The owner's side of a traveller report, shown to triage in A06. */
  async respondToReport(businessId: string, reportId: string, response: string, actor: Actor): Promise<void> {
    await load(businessId, actor);
    const text = response.trim();
    if (text.length < 10) throw refuse('Write a response the operations team can act on.', 400);

    const updated = await ownerRepository.respondToReport(reportId, businessId, text);
    if (!updated) throw notFound();

    await recordAudit({
      actorUserId: actor.userId,
      action: 'incident.owner_responded',
      entityType: 'incident',
      entityId: reportId,
      afterState: { businessId },
      requestId: actor.requestId,
    });
  },

  /** B05. */
  async dashboard(businessId: string, actor: Actor, now = new Date()) {
    const record = await load(businessId, actor);
    const [activity, reports] = await Promise.all([
      ownerRepository.activity(businessId, ACTIVITY_WINDOW_DAYS),
      ownerRepository.openReports(businessId),
    ]);

    const gaps = listingGaps(record, photos(record.files).length);
    const requirements = ownerRequirements({
      status: record.status,
      verificationStatus: record.verification?.status ?? null,
      verificationKind: record.verification?.kind ?? null,
      decisionReason: record.verification?.decisionReason ?? null,
      lastOwnerUpdateAt: record.lastOwnerUpdateAt,
      approvedUntil: record.approvedUntil,
      hadApproval: record.verification !== null,
      reportsAwaitingResponse: reports.filter((report) => report.ownerResponse === null).length,
      missingFields: record.mode === 'live' ? gaps.map((gap) => gap.message) : [],
      hasPendingChange: record.pendingChange !== null,
      now,
    });

    return { record, activity: summariseActivity(activity), reports, requirements, gaps };
  },
};

const FIELD_LABEL: Record<string, string> = {
  name: 'name',
  category: 'category',
  addressLine: 'street address',
  locality: 'locality',
  pin: 'PIN code',
  location: 'map pin',
  ownerName: 'responsible owner',
};

/**
 * What the A07 reviewer reads for a sensitive change, keyed by the same five
 * checks as a first review.
 */
function changeSummary(current: OwnerListingRecord, change: DraftPatch, note: string): Record<string, string> {
  const describe = (fields: string[]): string => {
    const changed = fields.filter((field) => field in change);
    if (changed.length === 0) return 'Unchanged by this request';
    return changed
      .map((field) => {
        const before = field === 'location' ? `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}` : String(current[field as keyof OwnerListingRecord] ?? 'blank');
        const afterValue = change[field as keyof DraftPatch];
        const after =
          field === 'location' && afterValue !== undefined
            ? `${(afterValue as { lat: number }).lat.toFixed(5)}, ${(afterValue as { lng: number }).lng.toFixed(5)}`
            : String(afterValue ?? 'blank');
        return `Change ${FIELD_LABEL[field]} from "${before}" to "${after}"`;
      })
      .join('; ');
  };

  return {
    ownership: describe(['ownerName']),
    address: describe(['addressLine', 'locality', 'pin', 'location']),
    businessType: describe(['name', 'category']),
    hours: 'Unchanged by this request',
    contact: 'Unchanged by this request',
    ownerNote: note,
  };
}
