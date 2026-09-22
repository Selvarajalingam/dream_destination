import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSession } from '@/server/session';
import { isAdmin } from '@/server/authorize';
import { SignOutButton } from '@/components/SignOutButton';

/**
 * Administration shell — PRD Part I §3.3.
 *
 * The role check runs server-side on every request. A traveller sees a plain
 * "not available" page rather than a redirect to a sign-in screen, because
 * confirming that an admin area exists at a given path is itself information.
 */

/** PRD Part I §3.3 administration navigation. */
const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/verifications', label: 'Verification' },
  { href: '/admin/crowd', label: 'Crowd' },
  { href: '/admin/freshness', label: 'Content' },
  { href: '/admin/businesses', label: 'Businesses' },
  { href: '/admin/incidents', label: 'Incidents' },
  { href: '/admin/analytics', label: 'Analytics' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (session === null || session.isGuest) {
    return (
      <main className="page-gutter py-10">
        <h1 className="text-[26px]">Operations staff only</h1>
        <p className="mt-2 text-[16px] text-text-secondary">Sign in with a staff account to continue.</p>
        <Link
          href="/admin/login"
          data-touch-target
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-deep px-4 text-[14px] font-[650] text-white"
        >
          Staff sign-in
        </Link>
      </main>
    );
  }

  if (!isAdmin(session)) {
    return (
      <main className="page-gutter py-10">
        <h1 className="text-[26px]">Not available</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          This page is not available to your account.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2"
        >
          Back to Dream Destination
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#admin-main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-primary focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-border-subtle bg-brand-deep text-white">
        <div className="page-gutter flex min-h-[56px] flex-wrap items-center justify-between gap-3 py-2">
          <Link href="/admin" className="text-[18px] font-[750]">
            Dream Destination · Operations
          </Link>
          <nav aria-label="Administration" className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-touch-target
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-[650] hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
            <SignOutButton
              redirectTo="/admin/login"
              className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-[650] hover:bg-white/10"
            />
          </nav>
        </div>
      </header>

      <main id="admin-main" className="page-gutter py-5">
        <p className="mb-4 rounded-xl bg-surface-subtle p-3 text-[14px] text-text-secondary">
          Every record in this environment is seeded demonstration data. Decisions taken here are
          recorded in the audit log exactly as they would be in a pilot.
        </p>
        {children}
      </main>
    </div>
  );
}
