import { recordAudit } from '@/server/authorize';
import { DomainError } from '@/shared/result';
import {
  approvalBlockers,
  canReviewBusiness,
  listingStatusAfter,
  sponsorshipBlocker,
  BUSINESS_CHECKS,
  type BusinessCheck,
  type ListingDecision,
  type Reviewer,
  type SponsorshipDecision,
} from './domain/review';
import { businessReviewRepository } from './review-repository';

/**
 * Business review decisions — Screen A07.
 *
 * Two independent decisions with independent audit trails: whether a listing
 * is verified, and whether it may carry sponsored placement.
 */

const refuse = (message: string, status = 409): DomainError => new DomainError('business_review.refused', message, status);

const CHECK_LABEL = new Map(BUSINESS_CHECKS.map((check) => [check.key, check.label.toLowerCase()]));

export const businessReviewService = {
  async decideListing(input: {
    businessId: string;
    decision: ListingDecision;
    reason: string;
    confirmedChecks: BusinessCheck[];
    reviewer: Reviewer;
    requestId?: string;
  }): Promise<void> {
    const detail = await businessReviewRepository.findDetail(input.businessId);
    if (detail === null) throw refuse('That business does not exist.', 404);

    if (!canReviewBusiness(input.reviewer, detail.ownerUserId)) {
      throw refuse('You cannot review a business you own.', 403);
    }

    const open = ['under_review', 'evidence_pending', 'changes_requested'];
    if (detail.verificationId === null || !open.includes(detail.verificationStatus ?? '')) {
      throw refuse('This listing has no verification waiting for a decision.');
    }

    if (input.decision === 'approved') {
      const blockers = approvalBlockers(new Set(input.confirmedChecks));
      if (blockers.length > 0) {
        throw refuse(
          `Approval needs every check confirmed. Still unconfirmed: ${blockers.map((key) => CHECK_LABEL.get(key)).join(', ')}.`,
          400,
        );
      }
    }

    const status = listingStatusAfter(input.decision, detail.requestKind, detail.status);

    await businessReviewRepository.decideListing({
      businessId: detail.businessId,
      verificationId: detail.verificationId,
      decision: input.decision,
      requestKind: detail.requestKind,
      pendingChange: detail.pendingChange,
      status,
      reviewerUserId: input.reviewer.userId,
      reason: input.reason,
      confirmedChecks: input.confirmedChecks,
    });

    await recordAudit({
      actorUserId: input.reviewer.userId,
      action: detail.requestKind === 'sensitive_change' ? `business_change.${input.decision}` : `business_listing.${input.decision}`,
      entityType: 'business',
      entityId: detail.businessId,
      beforeState: { status: detail.status, verification: detail.verificationStatus },
      afterState: {
        status,
        verification: input.decision,
        reason: input.reason,
        confirmedChecks: input.confirmedChecks,
        ...(detail.requestKind === 'sensitive_change' ? { change: detail.pendingChange } : {}),
      },
      requestId: input.requestId,
    });
  },

  async decideSponsorship(input: {
    businessId: string;
    decision: SponsorshipDecision;
    reason: string;
    reviewer: Reviewer;
    requestId?: string;
  }): Promise<void> {
    const detail = await businessReviewRepository.findDetail(input.businessId);
    if (detail === null) throw refuse('That business does not exist.', 404);

    if (!canReviewBusiness(input.reviewer, detail.ownerUserId)) {
      throw refuse('You cannot decide sponsorship for a business you own.', 403);
    }

    const requested = detail.sponsorshipRequestedAt !== null && detail.sponsorshipDecidedAt === null;
    const blocker = sponsorshipBlocker(
      { status: detail.status, ownerVerified: detail.ownerVerified, sponsored: detail.sponsored, requested },
      input.decision,
    );
    if (blocker !== null) throw refuse(blocker);

    const sponsored = input.decision === 'approved';

    await businessReviewRepository.decideSponsorship({
      businessId: detail.businessId,
      sponsored,
      reason: input.reason,
      closesRequest: input.decision !== 'revoked',
    });

    await recordAudit({
      actorUserId: input.reviewer.userId,
      action: `business_sponsorship.${input.decision}`,
      entityType: 'business',
      entityId: detail.businessId,
      beforeState: { sponsored: detail.sponsored },
      afterState: { sponsored, reason: input.reason },
      requestId: input.requestId,
    });
  },
};
