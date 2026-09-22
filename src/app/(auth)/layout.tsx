import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Sign-in pages. Outside the traveller, owner and operations layouts, so
 * none of their guards or navigation apply before someone has signed in.
 */

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#auth-main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-primary focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to content
      </a>
      <header className="border-b border-border-subtle bg-surface-base">
        <div className="page-gutter flex min-h-[56px] items-center justify-between gap-4 py-2">
          <Link href="/" className="text-[18px] font-[750] text-brand-deep">
            Dream Destination
          </Link>
          <span className="rounded-full bg-surface-subtle px-3 py-1 text-[13px] font-[650] text-text-secondary">
            Demonstration data
          </span>
        </div>
      </header>
      <main id="auth-main" className="page-gutter py-8">
        {children}
      </main>
    </div>
  );
}
