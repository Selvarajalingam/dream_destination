import type {
  Actor,
  ChecklistGroup,
  UserRole,
  Verification,
  VerificationDisplay,
} from './types';

/**
 * Dream Verified gating.
 *
 * PRD Part II §19: "Only an approved, unexpired verification can display Dream
 * Verified" and "Business owners cannot approve their own verification."
 *
 * PRD Part I T11: known limitations must appear before the visit action, so
 * they are returned whatever the badge state.
 */

/** The nine content groups PRD Part I T11 requires, in display order. */
export const CHECKLIST_GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'access_and_road', label: 'Access and road conditions' },
  { key: 'mobile_network', label: 'Mobile and network availability' },
  { key: 'operating_daylight', label: 'Operating and daylight guidance' },
  { key: 'weather_season', label: 'Weather and season limitations' },
  { key: 'emergency_access', label: 'Emergency access' },
  { key: 'nearest_medical', label: 'Nearest medical facility' },
  { key: 'capacity_environment', label: 'Capacity and environmental limits' },
  { key: 'permits_culture', label: 'Photography, permit and cultural rules' },
  { key: 'reviewer', label: 'Verification and reviewer' },
];

const DECIDING_ROLES: ReadonlySet<UserRole> = new Set([
  'verifier',
  'tourism_admin',
  'platform_admin',
]);

const EMPTY_DISPLAY: VerificationDisplay = {
  showBadge: false,
  status: 'none',
  verifiedAt: null,
  expiresAt: null,
  nextReviewAt: null,
  knownLimitations: [],
  reviewerType: null,
  checklistGroups: [],
};

export function resolveVerificationDisplay(
  verification: Verification | null,
  now: Date,
): VerificationDisplay {
  if (verification === null) return EMPTY_DISPLAY;

  const hasExpired =
    verification.expiresAt !== null && verification.expiresAt.getTime() <= now.getTime();

  // An approved row past its expiry is reported as expired, not approved, so
  // nothing downstream can treat it as current.
  const status =
    verification.status === 'approved' && hasExpired ? 'expired' : verification.status;

  return {
    showBadge: verification.status === 'approved' && !hasExpired,
    status,
    verifiedAt: verification.reviewedAt,
    expiresAt: verification.expiresAt,
    nextReviewAt: verification.expiresAt,
    knownLimitations: verification.knownLimitations,
    reviewerType: verification.reviewerType,
    checklistGroups: toChecklistGroups(verification),
  };
}

function toChecklistGroups(verification: Verification): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];
  for (const { key, label } of CHECKLIST_GROUPS) {
    const entry = verification.checklist[key];
    if (entry === undefined) continue;
    groups.push({ key, label, value: entry.value, checked: entry.checked });
  }
  return groups;
}

export function canDecide(actor: Actor, verification: Verification): boolean {
  const hasRole = actor.roles.some((role) => DECIDING_ROLES.has(role));
  if (!hasRole) return false;

  // Separation of duties: nobody decides on their own submission, whatever
  // roles they also hold.
  return verification.ownerUserId !== actor.userId;
}
