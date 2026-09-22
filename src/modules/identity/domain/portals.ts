/**
 * Sign-in portals: one page each for travellers, business owners and
 * operations staff.
 *
 * Each portal admits only the roles it serves, so a traveller cannot sign in
 * through the staff page and land somewhere they have no business being, and
 * the staff page is the only door into the operations area.
 */

export type Portal = 'traveller' | 'business' | 'staff';

export const PORTALS: Record<
  Portal,
  { roles: readonly string[]; home: string; path: string; label: string }
> = {
  traveller: { roles: ['traveler'], home: '/', path: '/login', label: 'traveller sign-in' },
  business: { roles: ['business_owner'], home: '/business', path: '/business/login', label: 'business owner sign-in' },
  staff: {
    roles: ['verifier', 'tourism_admin', 'platform_admin', 'analyst'],
    home: '/admin',
    path: '/admin/login',
    label: 'staff sign-in',
  },
};

export function portalAdmits(portal: Portal, roles: readonly string[]): boolean {
  return roles.some((role) => PORTALS[portal].roles.includes(role));
}

/** The portal an account should use instead, when it used the wrong one. */
export function portalFor(roles: readonly string[]): Portal | null {
  for (const portal of ['staff', 'business', 'traveller'] as const) {
    if (portalAdmits(portal, roles)) return portal;
  }
  return null;
}

/** Failed attempts allowed before the account is locked for a while. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export function lockUntil(failedAttempts: number, now: Date): Date | null {
  return failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
}

/**
 * Where to go after signing in. Only a same-site path is honoured, so a
 * crafted link cannot bounce a fresh session to another site.
 */
export function safeNext(next: string | null | undefined, portal: Portal): string {
  if (typeof next !== 'string') return PORTALS[portal].home;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) {
    return PORTALS[portal].home;
  }
  return next;
}
