import Link from 'next/link';
import type { ReactNode } from 'react';
import { ScrollHeader } from './ScrollHeader';

const DESKTOP_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/explore', label: 'Explore' },
  { href: '/trips', label: 'Trips' },
  { href: '/dream-ai', label: 'AI Assistant' },
];

/**
 * Traveller shell — PRD Part I §3.1.
 *
 * Carries the skip link, the main landmark, the polite live region used by AI
 * generation and budget changes (§11), and the five-item bottom navigation.
 * Every navigation target is at least 44×44 CSS pixels.
 */

const NAV = [
  { href: '/', label: 'Home', icon: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z' },
  { href: '/explore', label: 'Explore', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3' },
  { href: '/dream-ai', label: 'Dream AI', icon: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z' },
  { href: '/trips', label: 'Trips', icon: 'M4 7h16v13H4zM9 7V4h6v3' },
  { href: '/profile', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0' },
];

export default function TravelerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip pb-[76px] md:pb-0">
      <a
        href="#main"
        className="visually-hidden focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-primary focus:px-4 focus:py-3 focus:text-white"
      >
        Skip to content
      </a>

      <ScrollHeader>
          <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap text-[17px] font-[800] text-brand-deep sm:text-[18px]">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
              <rect width="34" height="34" rx="10" fill="#0f766e" />
              <path d="M6 26 15 11l5 8 3-4 5 11Z" fill="#ffffff" />
              <circle cx="24" cy="10" r="2.5" fill="#f28c28" />
            </svg>
            Dream Destination
          </Link>
          <nav aria-label="Primary" className="hidden items-center md:flex lg:gap-1">
            {DESKTOP_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-touch-target
                className="inline-flex items-center whitespace-nowrap rounded-full px-3 text-[15px] font-[650] text-text-primary hover:bg-surface-subtle lg:px-4"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="whitespace-nowrap rounded-full border border-border-subtle bg-white px-3 py-1 text-[13px] font-[650] text-text-secondary">
            <span className="lg:hidden">Demo data</span>
            <span className="hidden lg:inline">Demonstration data</span>
          </span>
      </ScrollHeader>

      <main id="main" className="page-gutter py-5">
        {children}
      </main>

      <footer className="bg-brand-deep text-[#d5e0ea]">
        <div className="page-gutter flex flex-col gap-4 py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[17px] font-[800] text-white">Dream Destination</p>
            <p className="text-[14px]">Meaningful trips for a brighter tomorrow.</p>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] font-[650]">
            {DESKTOP_LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-block py-2 hover:text-white hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {/*
        Announcements for AI generation and budget changes are written here by
        client components. PRD Part I §11 requires a polite live region.
      */}
      <div id="live-region" aria-live="polite" aria-atomic="false" className="visually-hidden" />

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-border-subtle bg-surface-base pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                data-touch-target
                className="flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 py-2 text-[13px] font-[650] text-text-secondary"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={item.icon} />
                </svg>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
