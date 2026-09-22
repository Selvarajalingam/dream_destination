import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DEMO_ACCOUNTS } from '@/modules/identity/domain/demo-accounts';
import { PORTALS, portalAdmits, safeNext, type Portal } from '@/modules/identity/domain/portals';
import { getSession } from '@/server/session';
import { SignInForm } from './SignInForm';

/**
 * One sign-in page per audience. Someone already signed in with the right
 * kind of account is sent straight on.
 */

const OTHER_LINKS: Record<Portal, Array<{ portal: Portal; text: string }>> = {
  traveller: [
    { portal: 'business', text: 'Run a local business? Sign in as an owner' },
    { portal: 'staff', text: 'Operations staff sign-in' },
  ],
  business: [
    { portal: 'traveller', text: 'Travelling? Sign in as a traveller' },
    { portal: 'staff', text: 'Operations staff sign-in' },
  ],
  staff: [
    { portal: 'traveller', text: 'Traveller sign-in' },
    { portal: 'business', text: 'Business owner sign-in' },
  ],
};

export async function SignInPage({
  portal,
  title,
  lead,
  next,
  footer,
}: {
  portal: Portal;
  title: string;
  lead: string;
  next: string | undefined;
  footer?: React.ReactNode;
}) {
  const session = await getSession();
  if (session !== null && !session.isGuest && portalAdmits(portal, session.roles)) {
    redirect(safeNext(next, portal));
  }

  const environment = process.env.APP_ENV ?? 'local';
  const showDemo = environment === 'local' || environment === 'preview';
  const demo = showDemo
    ? DEMO_ACCOUNTS.filter((account) => account.portal === portal).map(({ label, detail, email, password }) => ({
        label,
        detail,
        email,
        password,
      }))
    : null;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-[26px] lg:text-[32px]">{title}</h1>
      <p className="mt-2 text-[16px] text-text-secondary">{lead}</p>

      <div className="mt-6">
        <SignInForm portal={portal} next={next ?? null} demoAccounts={demo} />
      </div>

      {footer}

      <nav aria-label="Other sign-in pages" className="mt-8 border-t border-border-subtle pt-4">
        <ul className="space-y-2 text-[14px]">
          {OTHER_LINKS[portal].map((link) => (
            <li key={link.portal}>
              <Link href={PORTALS[link.portal].path} className="font-[650] text-brand-primary underline underline-offset-2">
                {link.text}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
