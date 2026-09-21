import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/primitives';

/**
 * Global states — PRD Part I §9.
 *
 * Loading skeletons match the content layout and never cycle a fake
 * percentage. Empty states explain why and offer one action. Error states say
 * what failed, what still works and what to do. Stale keeps the information
 * visible with its age.
 */

export function LoadingState({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="rounded-[16px] border border-border-subtle p-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  reason,
  action,
}: {
  title: string;
  /** Why it is empty. Never a decorative message that hides the next step. */
  reason: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-subtle p-6 text-center">
      <h2 className="text-[21px] font-[650]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[16px] text-text-secondary">{reason}</p>
      {action !== undefined && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title,
  whatFailed,
  stillAvailable,
  action,
}: {
  title: string;
  whatFailed: string;
  /** What the traveller can still do. PRD §9.3. */
  stillAvailable: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-[16px] border border-status-danger/30 bg-status-danger/5 p-5"
    >
      <h2 className="text-[18px] font-[650] text-status-danger">{title}</h2>
      <p className="mt-2 text-[16px]">{whatFailed}</p>
      <p className="mt-2 text-[14px] text-text-secondary">{stillAvailable}</p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "Viewing saved information from 8:30 AM" — PRD §5.9. */
export function StaleNote({ savedAt, className }: { savedAt: Date; className?: string }) {
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(savedAt);

  return (
    <p
      data-testid="stale-note"
      className={clsx('text-[14px] font-[650] text-status-warn', className)}
    >
      Viewing saved information from {time}
    </p>
  );
}

export function PermissionDeniedState({
  permission,
  alternative,
  action,
}: {
  permission: 'location' | 'notifications' | 'camera';
  alternative: string;
  action?: ReactNode;
}) {
  const title = {
    location: 'Location is turned off',
    notifications: 'Notifications are turned off',
    camera: 'Camera access is turned off',
  }[permission];

  return (
    <div className="rounded-[16px] border border-border-subtle bg-surface-subtle p-5">
      <h2 className="text-[18px] font-[650]">{title}</h2>
      <p className="mt-2 text-[14px] text-text-secondary">{alternative}</p>
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Persistent offline banner. Actions needing the network are disabled. */
export function OfflineBanner({ lastSyncedAt }: { lastSyncedAt: Date | null }) {
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-status-warn/30 bg-status-warn/10 px-4 py-2 text-[14px]"
    >
      <span className="font-[650] text-status-warn">You are offline</span>
      <span className="text-text-secondary">
        Showing your saved trip.
        {lastSyncedAt !== null && ` Last synced ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(lastSyncedAt)}.`}
      </span>
      <span className="text-text-secondary">Live crowd and weather unavailable.</span>
    </div>
  );
}
