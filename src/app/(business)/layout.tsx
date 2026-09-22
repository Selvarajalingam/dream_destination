import Link from 'next/link';
import type { ReactNode } from 'react';
import { ownerCopy } from './business/copy';
import { ownerContext } from './business/context';
import { LocaleSwitch } from './business/LocaleSwitch';

/**
 * Business owner shell — PRD Part I B01–B06.
 *
 * Mobile first (E10-S05: "Mobile flow saves progress"). Access to any one
 * listing is decided by owning it, so this shell only asks that someone is
 * signed in.
 */

export default async function BusinessLayout({ children }: { children: ReactNode }) {
  const context = await ownerContext();
  const copy = context?.copy ?? ownerCopy('en-IN');

  return (
    <div className="min-h-dvh" lang={context?.locale === 'ta-IN' ? 'ta' : 'en'}>
      <a
        href="#business-main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-primary focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to content
      </a>

      <header className="border-b border-border-subtle bg-surface-base">
        <div className="page-gutter flex min-h-[56px] flex-wrap items-center justify-between gap-3 py-2">
          <Link href="/business" className="text-[18px] font-[750] text-brand-deep">
            {copy.shellTitle}
          </Link>
          {context !== null && (
            <div className="flex flex-wrap items-center gap-1">
              <nav aria-label="Business" className="flex flex-wrap gap-1">
                <Link
                  href="/business"
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-[650] hover:bg-surface-subtle"
                >
                  {copy.navListings}
                </Link>
                <Link
                  href="/business/new"
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-[14px] font-[650] hover:bg-surface-subtle"
                >
                  {copy.navRegister}
                </Link>
              </nav>
              <LocaleSwitch locale={context.locale} label={copy.language} />
            </div>
          )}
        </div>
      </header>

      <main id="business-main" className="page-gutter mx-auto max-w-3xl py-5">
        {context === null ? (
          <div>
            <h1 className="text-[26px]">{copy.signInTitle}</h1>
            <p className="mt-2 text-[16px] text-text-secondary">{copy.signInBody}</p>
            <Link
              href="/profile"
              data-touch-target
              className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
            >
              {copy.signInAction}
            </Link>
          </div>
        ) : (
          children
        )}

        <p className="mt-10 border-t border-border-subtle pt-4">
          <Link href="/" className="text-[14px] font-[650] text-brand-primary underline underline-offset-2">
            {copy.backToApp}
          </Link>
        </p>
      </main>
    </div>
  );
}
