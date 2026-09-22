/**
 * Local business review — PRD Part I A07.
 *
 * "Verify ownership, address, business type, hours, contact, and evidence.
 * Sponsored placement approval remains separate from listing verification."
 */

export type BusinessCheck = 'ownership' | 'address' | 'businessType' | 'hours' | 'contact';

/** The five checks A07 names, in the order a reviewer works through them. */
export const BUSINESS_CHECKS: ReadonlyArray<{ key: BusinessCheck; label: string }> = [
  { key: 'ownership', label: 'Ownership' },
  { key: 'address', label: 'Address' },
  { key: 'businessType', label: 'Business type' },
  { key: 'hours', label: 'Hours' },
  { key: 'contact', label: 'Contact' },
];

export type ListingDecision = 'approved' | 'changes_requested' | 'rejected';

/**
 * What stands between a listing and approval: every check the reviewer has
 * not confirmed. An empty list means approval is allowed.
 *
 * Requesting changes or rejecting needs no confirmed checks — those are the
 * outcomes for a listing that could not be verified.
 */
export function approvalBlockers(confirmed: ReadonlySet<BusinessCheck>): BusinessCheck[] {
  return BUSINESS_CHECKS.map((check) => check.key).filter((key) => !confirmed.has(key));
}

export type Reviewer = { userId: string; roles: readonly string[] };

const REVIEWING_ROLES = new Set(['verifier', 'tourism_admin', 'platform_admin']);

/** Nobody reviews their own business, whatever other roles they hold. */
export function canReviewBusiness(reviewer: Reviewer, ownerUserId: string | null): boolean {
  if (!reviewer.roles.some((role) => REVIEWING_ROLES.has(role))) return false;
  return ownerUserId === null || ownerUserId !== reviewer.userId;
}

export type SponsorshipDecision = 'approved' | 'declined' | 'revoked';

/**
 * Sponsored placement is a separate decision from listing verification, and
 * it is only available to a listing that has already passed review. A
 * business cannot pay its way into the catalog ahead of being verified.
 */
export function sponsorshipBlocker(listing: {
  status: string;
  ownerVerified: boolean;
  sponsored: boolean;
  requested: boolean;
}, decision: SponsorshipDecision): string | null {
  if (decision === 'revoked') {
    return listing.sponsored ? null : 'This listing is not currently sponsored.';
  }
  if (!listing.requested) return 'There is no open sponsorship request for this listing.';
  if (decision === 'approved') {
    if (listing.status !== 'active') return 'Only an active listing can be sponsored. Verify the listing first.';
    if (!listing.ownerVerified) return 'The listing has not passed verification, so it cannot be sponsored yet.';
  }
  return null;
}

export type RequestKind = 'listing' | 'sensitive_change';

/**
 * Listing status that results from each decision.
 *
 * A sensitive change to a live listing (B06) is decided on its own: declining
 * it discards the change and leaves the listing exactly as it was, because
 * the listing already passed review and a proposed edit is not a reason to
 * hide it.
 */
export function listingStatusAfter(
  decision: ListingDecision,
  kind: RequestKind = 'listing',
  currentStatus = 'pending',
): string {
  if (kind === 'sensitive_change') return currentStatus;
  if (decision === 'approved') return 'active';
  if (decision === 'rejected') return 'rejected';
  return 'pending';
}

/** Whether the held change is written to the listing. It is always cleared. */
export function appliesPendingChange(decision: ListingDecision, kind: RequestKind): boolean {
  return kind === 'sensitive_change' && decision === 'approved';
}
