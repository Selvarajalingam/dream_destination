import { getSession } from '@/server/session';
import { hasRole, isAdmin } from '@/server/authorize';
import { DemoSignIn } from './DemoSignIn';

/**
 * Screen T23 — Profile and Preference Memory (P0 subset).
 *
 * The demonstration sign-in lives here because the pilot authentication route
 * is an open production decision (PRD Part II §20). Preference memory controls
 * are shown with what the product does and does not keep.
 */

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getSession();

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Profile</h1>

      <section className="mt-5">
        <h2 className="text-[21px]">Who you are signed in as</h2>
        <p className="mt-1 text-[16px] text-text-secondary">
          {session === null
            ? 'No session yet.'
            : session.isGuest
              ? 'Browsing as a guest. You can generate one plan before signing in.'
              : `Signed in with ${session.roles.length === 0 ? 'no roles' : session.roles.join(', ')}.`}
        </p>

        <DemoSignIn
          isAdmin={session !== null && isAdmin(session)}
          isOwner={session !== null && hasRole(session, 'business_owner')}
        />
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
