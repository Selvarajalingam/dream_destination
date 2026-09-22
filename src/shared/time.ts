export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** The pilot geography is Tamil Nadu; all local times are IST. */
export const PILOT_TIMEZONE = 'Asia/Kolkata';

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/**
 * "12 Sep 2026" — the source-freshness format from PRD Part I §5.7.
 *
 * en-GB renders September as "Sept", which is four letters where every other
 * month is three. The PRD's example uses "Sep", so it is normalised here to
 * keep the pattern even across all twelve months.
 */
export function formatSourceDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: PILOT_TIMEZONE,
  })
    .format(date)
    .replace('Sept', 'Sep');
}

/** "09:00" in pilot-local time. */
export function formatLocalTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: PILOT_TIMEZONE,
  }).format(date);
}

/**
 * "updated 12 minutes ago" — never "live". PRD Part I §12.2 forbids
 * presenting any crowd reading as live.
 */
export function formatAge(observedAt: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / MINUTE_MS));
  if (minutes < 1) return 'updated just now';
  if (minutes === 1) return 'updated 1 minute ago';
  if (minutes < 60) return `updated ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'updated 1 hour ago';
  if (hours < 24) return `updated ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'updated 1 day ago' : `updated ${days} days ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Today as an ISO date in India, where every listing and trip is. */
export function todayInIndia(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}
