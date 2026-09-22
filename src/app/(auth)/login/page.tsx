import Link from 'next/link';
import { SignInPage } from '../SignInPage';

/** Traveller sign-in. Signing in is optional: a guest can plan one trip first. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in' };

export default async function TravellerSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <SignInPage
      portal="traveller"
      title="Sign in"
      lead="Keep your trips, offline packs and preferences across devices."
      next={next}
      footer={
        <p className="mt-6 text-[14px] text-text-secondary">
          Just looking?{' '}
          <Link href="/" className="font-[650] text-brand-primary underline underline-offset-2">
            Continue as a guest
          </Link>{' '}
          and plan one trip without an account.
        </p>
      }
    />
  );
}
