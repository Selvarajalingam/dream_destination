'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';

/**
 * The sign-in form each portal page renders. It only knows which portal it
 * is for; the server decides whether the account belongs there.
 */

type DemoAccount = { label: string; detail: string; email: string; password: string };

const input = 'mt-1 min-h-[44px] w-full rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]';

export function SignInForm({
  portal,
  next,
  demoAccounts,
}: {
  portal: 'traveller' | 'business' | 'staff';
  next: string | null;
  demoAccounts: DemoAccount[] | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; elsewhere: string | null } | null>(null);
  // Disabled until hydrated, so a password typed on a slow connection is
  // never submitted as a plain form navigation.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const result = await api.post<{ next: string }>('/api/v1/auth/login', {
        portal,
        email,
        password,
        ...(next === null ? {} : { next }),
      });
      // A full load, so every server-rendered area sees the new session.
      window.location.assign(result.next);
    } catch (caught) {
      const problem = caught instanceof ApiProblemError ? caught.problem : null;
      setError({
        message: problem?.detail ?? 'Signing in failed. Check your connection and try again.',
        elsewhere: problem?.actions?.[0] ?? null,
      });
      setBusy(false);
    }
  };

  return (
    <div>
      <form onSubmit={(event) => void submit(event)} noValidate={false}>
        <fieldset disabled={!hydrated || busy} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <label className="block">
            <span className="block text-[14px] font-[650]">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? 'sign-in-error' : undefined}
              className={input}
            />
          </label>

          <div>
            {/* The show/hide button sits outside the label, so it is not read as part of the field's name. */}
            <label htmlFor="sign-in-password" className="block text-[14px] font-[650]">
              Password
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="sign-in-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error !== null}
                aria-describedby={error !== null ? 'sign-in-error' : undefined}
                className={`${input} mt-0`}
              />
              <button
                type="button"
                aria-pressed={showPassword}
                aria-controls="sign-in-password"
                onClick={() => setShowPassword((value) => !value)}
                className="min-h-[44px] shrink-0 rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
              >
                {showPassword ? 'Hide' : 'Show'}
                <span className="visually-hidden"> password</span>
              </button>
            </div>
          </div>

          {error !== null && (
            <p id="sign-in-error" role="alert" className="text-[14px] font-[650] text-status-danger-text">
              {error.message}{' '}
              {error.elsewhere !== null && (
                <Link href={error.elsewhere} className="text-brand-primary underline underline-offset-2">
                  Go there
                </Link>
              )}
            </p>
          )}

          <Button type="submit" className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </fieldset>
      </form>

      {demoAccounts !== null && demoAccounts.length > 0 && (
        <section aria-labelledby="demo-accounts" className="mt-6 rounded-[16px] border border-dashed border-border-subtle p-4">
          <h2 id="demo-accounts" className="text-[16px] font-[650]">
            Demonstration accounts
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            Shown only outside production. They open seeded demonstration data, nothing real.
          </p>
          <ul className="mt-3 space-y-2">
            {demoAccounts.map((account) => (
              <li key={account.email} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2">
                <span className="min-w-0 text-[14px]">
                  <span className="block font-[650]">{account.label}</span>
                  <span className="block text-text-secondary">{account.detail}</span>
                  <span className="block break-all text-[13px] text-text-secondary">
                    {account.email} · {account.password}
                  </span>
                </span>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={!hydrated}
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                >
                  Use this account
                  <span className="visually-hidden">: {account.label}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
