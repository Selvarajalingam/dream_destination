import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Uploads go to a throwaway directory, set before the store is first used.
const uploadDir = mkdtempSync(path.join(tmpdir(), 'dd-uploads-'));
process.env.UPLOAD_DIR = uploadDir;

import { sql } from '@/platform/db/client';
import { businessRepository } from '@/modules/businesses/repository';
import { businessReviewRepository } from '@/modules/businesses/review-repository';
import { businessReviewService } from '@/modules/businesses/review-service';
import { BUSINESS_CHECKS } from '@/modules/businesses/domain/review';
import { ownerRepository } from '@/modules/businesses/owner-repository';
import { ownerService } from '@/modules/businesses/owner-service';
import { cleanupTestUsers, createTestUser } from './helpers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as BlobPart], name, { type });

let owner: { userId: string };
let stranger: { userId: string };
let reviewer: { userId: string; roles: string[] };

beforeAll(async () => {
  owner = await createTestUser(['traveler']);
  stranger = await createTestUser(['traveler']);
  const [admin] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = 'admin@demo.dreamdestination.invalid'`;
  reviewer = { userId: admin.id, roles: ['tourism_admin', 'verifier'] };
});

afterAll(async () => {
  // Listings survive their owner (ON DELETE SET NULL), so remove them first.
  await sql`
    DELETE FROM local_businesses
    WHERE owner_user_id IN (SELECT id FROM users WHERE email LIKE 'test.%@example.invalid')
  `;
  await cleanupTestUsers();
  await sql.end();
  rmSync(uploadDir, { recursive: true, force: true });
});

/** A draft filled in far enough to submit, with its evidence uploaded. */
async function readyDraft(name: string): Promise<string> {
  const { id } = await ownerService.start({ name, destinationSlug: 'coonoor-valley' }, owner);
  const { errors } = await ownerService.saveDraft(
    id,
    {
      category: 'shop',
      addressLine: '4 Bedford Circle',
      pin: '643101',
      location: { lat: 11.3521, lng: 76.7953 },
      phone: '0423 220 1234',
      ownerName: 'Test Owner',
      hours: { mon: ['09:00', '17:00'], sun: null },
    },
    owner,
  );
  expect(errors).toEqual({});
  await ownerService.upload(id, { purpose: 'evidence', evidenceKind: 'registration', file: file(PNG, 'gst.png', 'image/png') }, owner);
  await ownerService.upload(id, { purpose: 'evidence', evidenceKind: 'address_proof', file: file(PNG, 'bill.png', 'image/png') }, owner);
  return id;
}

const allChecks = BUSINESS_CHECKS.map((check) => check.key);

describe('onboarding (B01–B04)', () => {
  it('starts a draft that no traveller and no other account can see', async () => {
    const { id } = await ownerService.start({ name: 'Hidden Draft Stall', destinationSlug: 'coonoor-valley' }, owner);
    const [row] = await sql<{ slug: string; status: string }[]>`SELECT slug, status FROM local_businesses WHERE id = ${id}`;

    expect(row.status).toBe('draft');
    expect(await businessRepository.findBySlug(row.slug)).toBeNull();
    expect(await ownerRepository.findMine(id, stranger.userId)).toBeNull();
    await expect(ownerService.saveDraft(id, { name: 'Taken over' }, stranger)).rejects.toMatchObject({ status: 404 });
  });

  it('autosaves the valid fields and names the invalid ones', async () => {
    const { id } = await ownerService.start({ name: 'Autosave Stall', destinationSlug: 'coonoor-valley' }, owner);
    const result = await ownerService.saveDraft(id, { addressLine: '9 Mount Road', pin: '12', phone: 'call me' }, owner);

    expect(result.saved).toEqual(['addressLine']);
    expect(Object.keys(result.errors).sort()).toEqual(['phone', 'pin']);
    expect((await ownerService.load(id, owner)).addressLine).toBe('9 Mount Road');
  });

  it('keeps the pin unconfirmed until the owner places it', async () => {
    const { id } = await ownerService.start({ name: 'Pin Stall', destinationSlug: 'coonoor-valley' }, owner);
    expect((await ownerService.load(id, owner)).locationConfirmed).toBe(false);

    await ownerService.saveDraft(id, { location: { lat: 11.35, lng: 76.8 } }, owner);
    expect((await ownerService.load(id, owner)).locationConfirmed).toBe(true);
  });

  it('refuses to send a listing with trust-critical gaps or missing evidence', async () => {
    const { id } = await ownerService.start({ name: 'Incomplete Stall', destinationSlug: 'coonoor-valley' }, owner);
    await expect(ownerService.submit(id, owner)).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a file that is not what it claims to be, and stores nothing', async () => {
    const { id } = await ownerService.start({ name: 'Upload Stall', destinationSlug: 'coonoor-valley' }, owner);
    await ownerService.saveDraft(id, { category: 'shop' }, owner);

    const script = new TextEncoder().encode('<script>alert(1)</script>');
    await expect(
      ownerService.upload(id, { purpose: 'photo', evidenceKind: null, file: file(script, 'front.png', 'image/png') }, owner),
    ).rejects.toMatchObject({ status: 400 });

    const activePdf = new TextEncoder().encode('%PDF-1.7 << /OpenAction << /S /JavaScript >> >>');
    await expect(
      ownerService.upload(id, { purpose: 'evidence', evidenceKind: 'registration', file: file(activePdf, 'gst.pdf', 'application/pdf') }, owner),
    ).rejects.toMatchObject({ status: 400 });

    expect(await ownerRepository.countFiles(id, 'photo')).toBe(0);
    expect(await ownerRepository.countFiles(id, 'evidence')).toBe(0);
  });

  it('sends a complete listing to A07, where it stays pending until approved', async () => {
    const id = await readyDraft('Bedford Honey House');
    await ownerService.submit(id, owner);

    const record = await ownerService.load(id, owner);
    expect(record.status).toBe('pending');
    expect(record.mode).toBe('in_review');
    expect(await businessRepository.findBySlug(record.slug)).toBeNull();

    const queue = await businessReviewRepository.verificationQueue();
    expect(queue.some((row) => row.businessId === id)).toBe(true);

    const detail = await businessReviewRepository.findDetail(id);
    expect(detail!.evidence.ownership).toMatch(/gst\.png/);
    expect(detail!.files.filter((entry) => entry.purpose === 'evidence')).toHaveLength(2);

    // Nothing can change under the reviewer.
    await expect(ownerService.saveDraft(id, { name: 'Changed mid-review' }, owner)).rejects.toMatchObject({ status: 409 });

    await businessReviewService.decideListing({
      businessId: id,
      decision: 'approved',
      reason: 'Documents match the shop frontage.',
      confirmedChecks: allChecks,
      reviewer,
    });

    expect(await businessRepository.findBySlug(record.slug)).not.toBeNull();
  });
});

describe('live listing updates (B06)', () => {
  let id: string;
  let slug: string;

  beforeAll(async () => {
    id = await readyDraft('Circle Spice Store');
    await ownerService.submit(id, owner);
    await businessReviewService.decideListing({ businessId: id, decision: 'approved', reason: 'All five checks passed.', confirmedChecks: allChecks, reviewer });
    await sql`UPDATE local_businesses SET last_owner_update_at = now() - interval '100 days' WHERE id = ${id}`;
    slug = (await ownerService.load(id, owner)).slug;
  });

  it('applies hours and phone at once, and counts it as the owner confirming the listing', async () => {
    const result = await ownerService.update(id, { fields: { phone: '98765 43210', hours: { mon: ['08:00', '16:00'] } } }, owner);
    expect(result).toEqual({ applied: ['phone', 'hours'], heldForReview: [] });

    const live = await businessRepository.findBySlug(slug);
    expect(live!.phone).toBe('+919876543210');
    expect(Date.now() - live!.lastOwnerUpdateAt!.getTime()).toBeLessThan(60_000);
  });

  it('holds a name change for review, needs a reason, and leaves travellers the reviewed name', async () => {
    await expect(ownerService.update(id, { fields: { name: 'Renamed Store' } }, owner)).rejects.toMatchObject({ status: 400 });

    const result = await ownerService.update(id, { fields: { name: 'Renamed Store' }, note: 'We renamed the shop after the new owner took over.' }, owner);
    expect(result.heldForReview).toEqual(['name']);
    expect((await businessRepository.findBySlug(slug))!.name).toBe('Circle Spice Store');

    // One change at a time.
    await expect(
      ownerService.update(id, { fields: { pin: '643102' }, note: 'PIN code was wrong on the listing form.' }, owner),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the listing live when the reviewer declines the change', async () => {
    await businessReviewService.decideListing({
      businessId: id,
      decision: 'rejected',
      reason: 'No document showing the new name.',
      confirmedChecks: [],
      reviewer,
    });

    const live = await businessRepository.findBySlug(slug);
    expect(live).not.toBeNull();
    expect(live!.name).toBe('Circle Spice Store');
    expect((await ownerService.load(id, owner)).pendingChange).toBeNull();
  });

  it('writes the change to the listing when the reviewer approves it', async () => {
    await ownerService.update(id, { fields: { name: 'Circle Spice Company' }, note: 'Registered name on the new GST certificate.' }, owner);
    await businessReviewService.decideListing({
      businessId: id,
      decision: 'approved',
      reason: 'GST certificate shows the new name.',
      confirmedChecks: allChecks,
      reviewer,
    });

    expect((await businessRepository.findBySlug(slug))!.name).toBe('Circle Spice Company');
  });

  it('leaves a temporarily closed listing out of suggestions, but keeps its page', async () => {
    const [destination] = await sql<{ id: string }[]>`SELECT id FROM destinations WHERE slug = 'coonoor-valley'`;
    const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

    await ownerService.setClosure(id, { from: today, until: today, note: 'Family wedding' }, owner);
    const nearby = await businessRepository.findForDestination(destination.id, 100);
    expect(nearby.some((row) => row.id === id)).toBe(false);
    expect((await businessRepository.findBySlug(slug))!.temporaryClosure?.note).toBe('Family wedding');

    await ownerService.setClosure(id, null, owner);
    expect((await businessRepository.findForDestination(destination.id, 100)).some((row) => row.id === id)).toBe(true);
  });

  it('lets only a verified live listing ask for sponsorship, once', async () => {
    await ownerService.requestSponsorship(id, owner);
    await expect(ownerService.requestSponsorship(id, owner)).rejects.toMatchObject({ status: 409 });
    const queue = await businessReviewRepository.sponsorshipQueue();
    expect(queue.find((row) => row.businessId === id)?.ownerVerified).toBe(true);
  });
});

describe('owner dashboard (B05)', () => {
  it('shows the seeded owner their open report, and records their response', async () => {
    const [kitchen] = await sql<{ id: string; owner: string }[]>`
      SELECT id, owner_user_id AS owner FROM local_businesses WHERE slug = 'badaga-home-kitchen'
    `;
    const seededOwner = { userId: kitchen.owner };

    const dashboard = await ownerService.dashboard(kitchen.id, seededOwner);
    const report = dashboard.reports.find((entry) => entry.ownerResponse === null);
    expect(report).toBeDefined();
    expect(dashboard.requirements.map((item) => item.kind)).toContain('report_awaiting_response');
    expect(Object.keys(report!)).not.toContain('reporterUserId');

    // Another account cannot answer it.
    await expect(ownerService.respondToReport(kitchen.id, report!.id, 'Not my listing at all.', stranger)).rejects.toMatchObject({
      status: 404,
    });

    await ownerService.respondToReport(kitchen.id, report!.id, 'Ragi mudde is served on weekdays only; menu board updated.', seededOwner);
    const [row] = await sql<{ owner_response: string }[]>`SELECT owner_response FROM incident_reports WHERE id = ${report!.id}`;
    expect(row.owner_response).toMatch(/weekdays only/);
  });

  it('reports demo activity as demo, and saves as not measured', async () => {
    const [kitchen] = await sql<{ id: string; owner: string }[]>`
      SELECT id, owner_user_id AS owner FROM local_businesses WHERE slug = 'badaga-home-kitchen'
    `;
    const { activity } = await ownerService.dashboard(kitchen.id, { userId: kitchen.owner });
    expect(activity.metrics.find((metric) => metric.key === 'saves')?.count).toBeNull();
    if (activity.metrics.some((metric) => (metric.count ?? 0) > 0)) expect(activity.includesDemo).toBe(true);
  });
});
