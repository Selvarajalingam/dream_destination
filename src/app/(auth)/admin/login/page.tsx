import { SignInPage } from '../../SignInPage';

/** Operations staff sign-in: verifiers and tourism administrators only. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Staff sign-in' };

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <SignInPage
      portal="staff"
      title="Operations staff sign-in"
      lead="For verifiers and tourism administrators. Every decision taken after signing in is recorded in the audit log."
      next={next}
    />
  );
}
