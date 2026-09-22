import Link from 'next/link';
import { sql } from '@/platform/db/client';
import { getSession } from '@/server/session';
import { hasRole, isAdmin } from '@/server/authorize';
import { SignOutButton } from '@/components/SignOutButton';

/**
 * Screen T23 — Profile and Preference Memory (P0 subset).
 *
 * Shows who is signed in and how to sign out; signing in happens on the
 * separate traveller, business owner and staff pages. Preference memory
 * controls are shown with what the product does and does not keep.
 */

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getSession();
  const signedIn = session !== null && !session.isGuest && session.userId !== null;
  const [user] = signedIn
    ? await sql<{ name: string | null; email: string | null }[]>`
        SELECT display_name AS name, email FROM users WHERE id = ${session!.userId}
      `
    : [];

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Profile</h1>

      <section className="mt-5">
        <h2 className="text-[21px]">Who you are signed in as</h2>
        {signedIn ? (
          <div className="mt-3 rounded-[16px] border border-border-subtle p-4" data-testid="signed-in-as">
            <p className="text-[16px] font-[650]">{user?.name ?? 'Your account'}</p>
            {user?.email != null && <p className="text-[14px] text-text-secondary">{user.email}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {hasRole(session!, 'business_owner') && (
                <Link
                  href="/business"
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
                >
                  Your business listings
                </Link>
              )}
              {isAdmin(session!) && (
                <Link
                  href="/admin"
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-deep px-4 text-[14px] font-[650] text-white"
                >
                  Open the operations area
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[16px] text-text-secondary">
              Browsing as a guest. You can plan one trip before signing in.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Sign-in pages">
              <SignInLink href="/login" title="Traveller" detail="Keep trips and offline packs across devices" />
              <SignInLink href="/business/login" title="Business owner" detail="Manage your local listing" />
              <SignInLink href="/admin/login" title="Operations staff" detail="Verifiers and tourism admins" />
            </ul>
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-[21px]">Privacy and data</h2>
        <ul className="mt-3 space-y-2 text-[16px]">
          <Item>
            Your conversation with Dream AI is not stored as raw chat. Only the structured trip
            brief you can see and edit is kept.
          </Item>
          <Item>
            Your location is used when you tap Share my location, and is put on your clipboard or
            into a message you send. It is not retained.
          </Item>
          <Item>
            An emergency contact, if you add one, stays on this device rather than on our servers.
          </Item>
          <Item>
            Crowd information you contribute is aggregated before anyone sees it, and never shows an
            individual path.
          </Item>
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-[21px]">Accessibility</h2>
        <p className="mt-1 text-[16px] text-text-secondary">
          Setting &ldquo;less walking&rdquo; in a trip brief filters the plan to step-free places
          first, and flags anything left that does not meet the need rather than hiding it.
        </p>
      </section>

      <p className="mt-6 text-[14px] text-text-secondary">
        Every record in this build is seeded demonstration data for the Smart India Hackathon. No
        real bookings, payments or personal records are involved.
      </p>
    </div>
  );
}

function SignInLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="block h-full rounded-[16px] border border-border-subtle p-3 hover:bg-surface-subtle">
        <span className="block text-[16px] font-[650] text-brand-primary">{title} sign-in</span>
        <span className="mt-1 block text-[14px] text-text-secondary">{detail}</span>
      </Link>
    </li>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 border-t border-border-subtle pt-2">
      <span aria-hidden="true" className="text-text-secondary">
        •
      </span>
      <span>{children}</span>
    </li>
  );
}
