'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';

/** Ends the session on the server, then reloads so every area forgets it. */
export function SignOutButton({ className, redirectTo = '/' }: { className?: string; redirectTo?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void api
          .post('/api/v1/auth/logout', {})
          .catch(() => undefined)
          .finally(() => window.location.assign(redirectTo));
      }}
      className={
        className ??
        'inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]'
      }
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
