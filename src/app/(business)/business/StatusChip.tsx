import type { OwnerCopy } from './copy';

/** The one status an owner needs, combining listing and verification state. */
export function statusKey(status: string, verificationStatus: string | null): string {
  if (status === 'pending' && verificationStatus === 'changes_requested') return 'changes_requested';
  return status;
}

const TONE: Record<string, string> = {
  draft: 'bg-surface-subtle text-text-secondary',
  pending: 'bg-status-warn-surface text-status-warn-text',
  changes_requested: 'bg-status-danger-surface text-status-danger-text',
  active: 'bg-status-good-surface text-status-good-text',
  suspended: 'bg-status-danger-surface text-status-danger-text',
  rejected: 'bg-surface-subtle text-text-secondary',
  expired: 'bg-surface-subtle text-text-secondary',
};

export function StatusChip({
  status,
  verificationStatus,
  copy,
}: {
  status: string;
  verificationStatus: string | null;
  copy: OwnerCopy;
}) {
  const key = statusKey(status, verificationStatus);
  return (
    <span data-testid="listing-status" className={`rounded-full px-3 py-1 text-[13px] font-[650] ${TONE[key] ?? TONE.draft}`}>
      {copy.statusLabels[key] ?? key}
    </span>
  );
}
