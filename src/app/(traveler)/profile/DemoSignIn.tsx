'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';

/**
 * Demonstration sign-in.
 *
 * Selecting a seeded role rather than entering a password, because the pilot
 * authentication route is an open production decision and inventing one here
 * would be pretending to a decision nobody has taken.
 */

const ROLES = [
  { key: 'traveler', label: 'Traveller', detail: 'Plan trips and carry them offline' },
  { key: 'verifier', label: 'Verifier', detail: 'Review hidden-gem submissions' },
  { key: 'admin', label: 'Tourism admin', detail: 'Crowd overrides and verification decisions' },
  { key: 'owner', label: 'Business owner', detail: 'Keep a local listing current and register a new one' },
] as const;

export function DemoSignIn({ isAdmin, isOwner }: { isAdmin: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (role: string): Promise<void> => {
    setBusy(role);
    setError(null);

    try {
      await ensureSession();
      await api.post('/api/v1/demo-session', { role });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'Could not sign in.',
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 rounded-[16px] border border-border-subtle p-4">
      <h3 className="text-[16px] font-[650]">Demonstration sign-in</h3>
      <p className="mt-1 text-[14px] text-text-secondary">
        Choose a seeded role. No passwords are involved: the pilot authentication route has not been
        decided yet, so this build does not pretend to one.
      </p>

      <ul className="mt-3 space-y-2">
        {ROLES.map((role) => (
          <li
            key={role.key}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2"
          >
            <span className="min-w-0">
              <span className="block text-[14px] font-[650]">{role.label}</span>
              <span className="block text-[13px] text-text-secondary">{role.detail}</span>
            </span>
            <Button
              size="small"
              variant="secondary"
              onClick={() => void signIn(role.key)}
              disabled={busy !== null}
            >
              {busy === role.key ? 'Signing in…' : 'Sign in'}
            </Button>
          </li>
        ))}
      </ul>

      {error !== null && (
        <p role="alert" className="mt-3 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}

      {isOwner && (
        <a
          href="/business"
          data-touch-target
          className="mt-4 mr-2 inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
        >
          Open your business listings
        </a>
      )}

      {isAdmin && (
        <a
          href="/admin/verifications"
          data-touch-target
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-deep px-4 text-[14px] font-[650] text-white"
        >
          Open the operations area
        </a>
      )}
    </div>
  );
}
