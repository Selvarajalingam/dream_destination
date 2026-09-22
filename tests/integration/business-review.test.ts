import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { businessRepository } from '@/modules/businesses/repository';
import { businessReviewRepository } from '@/modules/businesses/review-repository';
import { businessReviewService } from '@/modules/businesses/review-service';
import { BUSINESS_CHECKS } from '@/modules/businesses/domain/review';

afterAll(async () => {
  await sql.end();
});

const userId = async (email: string): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
  return row.id;
};

const admin = async () => ({
  userId: await userId('admin@demo.dreamdestination.invalid'),
  roles: ['tourism_admin', 'verifier'],
});

const businessId = async (slug: string): Promise<string> => {
  const [row] = await sql<{ id: string }[]>`SELECT id FROM local_businesses WHERE slug = ${slug}`;
  return row.id;
};

const ALL_CHECKS = BUSINESS_CHECKS.map((check) => check.key);

describe('business review queues (A07)', () => {
  it('lists the three seeded businesses awaiting verification', async () => {
    const queue = await businessReviewRepository.verificationQueue();
    expect(queue.map((row) => row.slug).sort()).toEqual([
      'kotagiri-spice-trail-homestay',
      'nilgiri-weavers-studio',
      'ooty-lakeview-cafe',
    ]);
  });

  it('keeps sponsorship requests in their own queue, marking which are verified', async () => {
    const queue = await businessReviewRepository.sponsorshipQueue();
    const bySlug = new Map(queue.map((row) => [row.slug, row]));
    expect(bySlug.get('kovai-millet-store')?.ownerVerified).toBe(true);
    expect(bySlug.get('nilgiri-weavers-studio')?.ownerVerified).toBe(false);
  });

  it('keeps pending listings out of traveller discovery', async () => {
    expect(await businessRepository.findBySlug('ooty-lakeview-cafe')).toBeNull();
  });
});

describe('listing decisions', () => {
  it('refuses approval until every check is confirmed, naming what is missing', async () => {
    const id = await businessId('ooty-lakeview-cafe');

    await expect(
      businessReviewService.decideListing({
        businessId: id,
        decision: 'approved',
        reason: 'Looks fine to me overall.',
        confirmedChecks: ['address', 'businessType', 'hours', 'contact'],
        reviewer: await admin(),
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/ownership/) });
  });

  it('verifies a listing with every check confirmed and puts it in front of travellers', async () => {
    const id = await businessId('kotagiri-spice-trail-homestay');

    await businessReviewService.decideListing({
      businessId: id,
      decision: 'approved',
      reason: 'Patta checked against the village record; phone verified by callback.',
      confirmedChecks: ALL_CHECKS,
      reviewer: await admin(),
    });

    const listing = await businessRepository.findBySlug('kotagiri-spice-trail-homestay');
    expect(listing).not.toBeNull();
    expect(listing!.ownerVerified).toBe(true);

    const audit = await sql`
      SELECT 1 FROM audit_logs WHERE entity_id = ${id} AND action = 'business_listing.approved'
    `;
    expect(audit.length).toBe(1);
  });

  it('requests changes without needing confirmed checks, leaving the listing hidden', async () => {
    const id = await businessId('ooty-lakeview-cafe');

    await businessReviewService.decideListing({
      businessId: id,
      decision: 'changes_requested',
      reason: 'Lease names someone other than the applicant; need authorisation.',
      confirmedChecks: [],
      reviewer: await admin(),
    });

    const detail = await businessReviewRepository.findDetail(id);
    expect(detail!.status).toBe('pending');
    expect(await businessRepository.findBySlug('ooty-lakeview-cafe')).toBeNull();
  });

  it('refuses an owner reviewing their own business', async () => {
    const id = await businessId('nilgiri-weavers-studio');
    const owner = await userId('owner.tea@demo.dreamdestination.invalid');

    await expect(
      businessReviewService.decideListing({
        businessId: id,
        decision: 'approved',
        reason: 'Approving my own shop, surely fine.',
        confirmedChecks: ALL_CHECKS,
        reviewer: { userId: owner, roles: ['business_owner', 'verifier'] },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('sponsorship decisions', () => {
  it('refuses to sponsor a listing that has not passed verification', async () => {
    const id = await businessId('nilgiri-weavers-studio');

    await expect(
      businessReviewService.decideSponsorship({
        businessId: id,
        decision: 'approved',
        reason: 'They asked nicely for placement.',
        reviewer: await admin(),
      }),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/verif/i) });
  });

  it('approves sponsorship for a verified listing, independently of its verification', async () => {
    const id = await businessId('kovai-millet-store');

    await businessReviewService.decideSponsorship({
      businessId: id,
      decision: 'approved',
      reason: 'Placement package agreed for the season.',
      reviewer: await admin(),
    });

    const listing = await businessRepository.findBySlug('kovai-millet-store');
    expect(listing!.sponsored).toBe(true);
    // Sponsorship changed nothing about verification.
    expect(listing!.ownerVerified).toBe(true);

    expect((await businessReviewRepository.sponsorshipQueue()).some((row) => row.businessId === id)).toBe(false);
  });

  it('revokes an active sponsorship and records why', async () => {
    const id = await businessId('kovai-millet-store');

    await businessReviewService.decideSponsorship({
      businessId: id,
      decision: 'revoked',
      reason: 'Placement period ended at month close.',
      reviewer: await admin(),
    });

    expect((await businessRepository.findBySlug('kovai-millet-store'))!.sponsored).toBe(false);

    const actions = await sql<{ action: string }[]>`
      SELECT action FROM audit_logs WHERE entity_id = ${id} ORDER BY created_at
    `;
    expect(actions.map((row) => row.action)).toEqual([
      'business_sponsorship.approved',
      'business_sponsorship.revoked',
    ]);
  });
});
