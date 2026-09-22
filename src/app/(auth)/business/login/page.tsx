import { SignInPage } from '../../SignInPage';

/** Business owner sign-in, the door to B01–B06. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business owner sign-in' };

export default async function BusinessSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <SignInPage
      portal="business"
      title="Business owner sign-in"
      lead="Keep your listing current, answer traveller reports and see how travellers find you."
      next={next}
    />
  );
}
