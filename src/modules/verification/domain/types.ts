export type VerificationStatus =
  | 'draft'
  | 'evidence_pending'
  | 'under_review'
  | 'approved'
  | 'changes_requested'
  | 'rejected'
  | 'expired'
  | 'suspended'
  | 'suppressed';

export type UserRole =
  | 'traveler'
  | 'business_owner'
  | 'verifier'
  | 'tourism_admin'
  | 'platform_admin'
  | 'analyst';

export type ChecklistEntry = {
  value: string;
  checked: boolean;
};

/** Keyed by the nine PRD T11 content groups. */
export type VerificationChecklist = Record<string, ChecklistEntry>;

export type Verification = {
  id: string;
  placeId: string;
  status: VerificationStatus;
  reviewedAt: Date | null;
  expiresAt: Date | null;
  knownLimitations: string[];
  reviewerType: string | null;
  checklist: VerificationChecklist;
  /** Set when the submission came from a business owner. */
  ownerUserId: string | null;
  decisionReason: string | null;
};

export type ChecklistGroup = {
  key: string;
  label: string;
  value: string;
  checked: boolean;
};

export type VerificationDisplay = {
  /** True only for an approved, unexpired verification. */
  showBadge: boolean;
  status: VerificationStatus | 'none';
  verifiedAt: Date | null;
  expiresAt: Date | null;
  nextReviewAt: Date | null;
  /** Always populated when known, badge or not. */
  knownLimitations: string[];
  reviewerType: string | null;
  checklistGroups: ChecklistGroup[];
};

export type Actor = {
  userId: string;
  roles: UserRole[];
};
