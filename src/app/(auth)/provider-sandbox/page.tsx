import Link from 'next/link';

/**
 * Where a sandbox handoff lands.
 *
 * A real provider's own site takes the booking. There is no real provider in
 * this build, so this page says exactly that rather than imitating one, and
 * hands back a reference the traveller can type into their trip.
 */

export const metadata = { title: 'Sandbox provider' };

export default async function ProviderSandboxPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const { offer } = await searchParams;
  // Derived from the offer id, so the same offer always shows the same code.
  const suffix = (offer ?? 'offer').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase().padStart(4, 'X');

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-[26px]">Sandbox provider</h1>
      <p className="mt-2 text-[16px]">
        This is where a real booking provider&rsquo;s own site would open. This build has no provider contract, so
        nothing here takes a booking or a payment.
      </p>

      <div className="mt-4 rounded-[16px] border border-border-subtle p-4">
        <p className="text-[14px] text-text-secondary">If this were a real provider, you would finish here and be given a reference such as:</p>
        <p className="mt-2 text-[21px] font-[750]" data-testid="sandbox-reference">
          SBX-{suffix}
        </p>
        <p className="mt-2 text-[14px] text-text-secondary">
          You can type that into your trip to keep track of it. Dream Destination will record it as added by you, not as
          confirmed by anyone.
        </p>
      </div>

      <p className="mt-6">
        <Link href="/trips" className="text-[14px] font-[650] text-brand-primary underline underline-offset-2">
          Back to your trips
        </Link>
      </p>
    </div>
  );
}
