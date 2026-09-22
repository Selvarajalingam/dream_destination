import { notFound } from 'next/navigation';
import { sql } from '@/platform/db/client';
import { ownerService } from '@/modules/businesses/owner-service';
import { DomainError } from '@/shared/result';
import { isUuid } from '@/server/authorize';
import { getSession } from '@/server/session';
import { ownerCopy, type OwnerCopy, type OwnerLocale } from './copy';

/**
 * Who is using the owner area, in which language. Null for a guest: every
 * owner screen belongs to an account.
 */
export async function ownerContext(): Promise<{ userId: string; locale: OwnerLocale; copy: OwnerCopy } | null> {
  const session = await getSession();
  if (session === null || session.isGuest || session.userId === null) return null;

  const [user] = await sql<{ locale: string }[]>`SELECT preferred_locale AS locale FROM users WHERE id = ${session.userId}`;
  const locale: OwnerLocale = user?.locale === 'ta-IN' ? 'ta-IN' : 'en-IN';
  return { userId: session.userId, locale, copy: ownerCopy(locale) };
}

/** Loads a listing the signed-in owner owns, or renders the 404 page. */
export async function loadOwnedListing(id: string, userId: string) {
  if (!isUuid(id)) notFound();
  try {
    return await ownerService.load(id, { userId });
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
}
