import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Landscape, type Scene } from './Landscape';

/**
 * Building blocks for the landing page: icons, tinted section bands, and the
 * image-led cards. Everything here is a server component and holds no data
 * of its own, so the page stays the only place that knows the queries.
 */

export const ICONS = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M12 3l8 3v6c0 4.5-3.2 8.4-8 9-4.8-.6-8-4.5-8-9V6l8-3ZM8.5 12l2.5 2.5 4.5-5',
  leaf: 'M5 19c0-8 5-13 15-14 0 10-5 15-13 15M5 19c2-4 5-7 9-9',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01',
  gem: 'M6 4h12l3 5-9 11L3 9l3-5ZM3 9h18M9 4l3 16M15 4l-3 16',
  store: 'M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9M10 20v-5h4v5',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  tag: 'M3 12V4h8l10 10-8 8L3 12ZM7.5 8h.01',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M18 14.5a6 6 0 0 1 3 5.5',
  landmark: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M3 10l9-6 9 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  chat: 'M4 5h16v11H9l-5 4V5Z',
} as const;

export function Icon({ d, size = 20, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx('shrink-0', className)}
    >
      <path d={d} />
    </svg>
  );
}

const TONES = {
  base: { band: 'bg-surface-base', badge: 'bg-[#e3f4f1] text-brand-primary-hover' },
  mint: { band: 'bg-[#f0f9f4]', badge: 'bg-[#d9f0e3] text-status-good-text' },
  sky: { band: 'bg-[#f1f7fd]', badge: 'bg-[#dcecfa] text-[#1d5a8f]' },
  warm: { band: 'bg-surface-warm', badge: 'bg-[#ffe7cc] text-[#8a4b0b]' },
} as const;

export type Tone = keyof typeof TONES;

/** A full-width tinted band with an icon badge, title, reason and View all link. */
export function Band({
  id,
  tone,
  icon,
  title,
  reason,
  children,
}: {
  id: string;
  tone: Tone;
  icon: string;
  title: string;
  reason: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={clsx('full-bleed', TONES[tone].band)}>
      <div className="page-gutter py-10 lg:py-14">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={clsx(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                TONES[tone].badge,
              )}
            >
              <Icon d={icon} size={22} />
            </span>
            <div>
              <h2 id={id} className="text-[22px] lg:text-[28px]">
                {title}
              </h2>
              <p className="mt-0.5 text-[14px] text-text-secondary lg:text-[15px]">{reason}</p>
            </div>
          </div>
          <Link
            href="/explore"
            data-touch-target
            aria-label={`View all: ${title}`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2 text-[14px] font-[700] text-brand-primary-hover hover:bg-white/70"
          >
            <span className="hidden sm:inline">View all</span>
            <span className="sm:hidden">All</span>
            <Icon d={ICONS.arrow} size={16} />
          </Link>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

/** Horizontal snap rail on phones, an even grid from the small breakpoint up. */
export function Rail({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        '-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6',
        'sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0',
        '[&>*]:w-[78%] [&>*]:max-w-[320px] [&>*]:shrink-0 [&>*]:snap-start',
        'sm:[&>*]:w-auto sm:[&>*]:max-w-none',
        columns,
      )}
    >
      {children}
    </div>
  );
}

const CARD =
  'group overflow-hidden rounded-[24px] border border-border-subtle bg-surface-base shadow-sm transition-shadow hover:shadow-lg motion-safe:transition-transform motion-safe:hover:-translate-y-0.5';

export function Tag({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'sky' | 'warm' }) {
  return (
    <span
      className={clsx(
        'rounded-full px-2.5 py-1 text-[12px] font-[650] capitalize',
        tone === 'mint' && 'bg-[#e0f3ea] text-status-good-text',
        tone === 'sky' && 'bg-[#e0eefa] text-[#1d5a8f]',
        tone === 'warm' && 'bg-[#fdebd5] text-[#8a4b0b]',
      )}
    >
      {children}
    </span>
  );
}

const TAG_TONES = ['mint', 'sky', 'warm'] as const;

export function tagList(themes: readonly string[]) {
  return themes.slice(0, 3).map((theme, index) => (
    <Tag key={theme} tone={TAG_TONES[index % TAG_TONES.length]}>
      {theme.replace(/[_-]/g, ' ')}
    </Tag>
  ));
}

export function DestinationCard({
  href,
  name,
  district,
  summary,
  cost,
  themes,
  scene,
}: {
  href: string;
  name: string;
  district: string | null;
  summary: string;
  cost: string;
  themes: readonly string[];
  scene: Scene;
}) {
  return (
    <Link href={href} className={clsx(CARD, 'flex h-full flex-col')}>
      <div className="relative h-56 overflow-hidden">
        <Landscape scene={scene} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0f2a40] via-[#0f2a40]/70 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-[13px] font-[750] text-brand-deep shadow-sm">
          {cost}
        </span>
        <div className="absolute inset-x-4 bottom-3 text-white">
          <p className="text-[19px] font-[800] leading-tight">{name}</p>
          {district !== null && <p className="text-[13px] text-white">{district}</p>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-3 text-[14px] text-text-secondary">{summary}</p>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">{tagList(themes)}</div>
      </div>
    </Link>
  );
}

/** A wide horizontal card with the image on the left, used for quieter places. */
export function WideCard({
  href,
  name,
  district,
  summary,
  cost,
  themes,
  scene,
}: {
  href: string;
  name: string;
  district: string | null;
  summary: string;
  cost: string;
  themes: readonly string[];
  scene: Scene;
}) {
  return (
    <Link href={href} className={clsx(CARD, 'flex h-full flex-col sm:flex-row')}>
      <div className="h-28 shrink-0 overflow-hidden sm:h-auto sm:w-44">
        <Landscape scene={scene} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[17px] font-[700] leading-snug text-text-primary">{name}</p>
            {district !== null && <p className="text-[14px] text-text-secondary">{district}</p>}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e0f3ea] px-2.5 py-1 text-[12px] font-[700] text-status-good-text">
            <Icon d={ICONS.users} size={14} />
            Tends to be quiet
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[14px] text-text-secondary">{summary}</p>
        <p className="mt-2 text-[16px] font-[750] text-brand-deep">
          {cost} <span className="text-[13px] font-normal text-text-secondary">est. cost</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">{tagList(themes)}</div>
      </div>
    </Link>
  );
}

export function GemCard({
  href,
  name,
  description,
  scene,
}: {
  href: string;
  name: string;
  description: string | null;
  scene: Scene;
}) {
  return (
    <Link href={href} className={clsx(CARD, 'flex h-full flex-col')}>
      <div className="h-28 overflow-hidden">
        <Landscape scene={scene} className="h-full w-full transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[16px] font-[700] leading-snug text-text-primary">{name}</p>
        <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-[#e0f3ea] px-2.5 py-1 text-[12px] font-[700] text-status-good-text">
          <Icon d={ICONS.check} size={14} />
          Dream Verified
        </span>
        {description !== null && (
          <p className="mt-2 line-clamp-3 text-[14px] text-text-secondary">{description}</p>
        )}
      </div>
    </Link>
  );
}

const CATEGORY_ICON: Record<string, string> = {
  restaurant: ICONS.store,
  homestay: ICONS.landmark,
  guide: ICONS.users,
  artisan: ICONS.tag,
};

export function BusinessTile({
  href,
  name,
  category,
  sponsored,
}: {
  href: string;
  name: string;
  category: string;
  sponsored: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[76px] items-center gap-3 rounded-[18px] border border-[#f1dcc0] bg-white p-3 shadow-sm transition-shadow hover:shadow-lg"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ffe7cc] text-[#8a4b0b]">
        <Icon d={CATEGORY_ICON[category] ?? ICONS.store} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-[700] text-text-primary">{name}</span>
        <span className="block text-[13px] capitalize text-text-secondary">{category.replace(/_/g, ' ')}</span>
        {sponsored && (
          <span
            data-testid="sponsored-label"
            className="mt-1 inline-block rounded-full bg-surface-subtle px-2 py-0.5 text-[12px] font-[650] text-text-secondary"
          >
            Sponsored
          </span>
        )}
      </span>
      <Icon
        d={ICONS.arrow}
        size={18}
        className="text-brand-primary-hover transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
