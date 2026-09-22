import Link from 'next/link';
import { ownerService } from '@/modules/businesses/owner-service';
import { EmptyState } from '@/components/states/states';
import { CATEGORY_LABEL } from './copy';
import { ownerContext } from './context';
import { statusKey, StatusChip } from './StatusChip';

/** Screen B05 — the owner's listings. Each opens its own dashboard. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your listings' };

export default async function OwnerListingsPage() {
  const context = await ownerContext();
  if (context === null) return null;
  const { copy, locale } = context;

  const listings = await ownerService.listMine({ userId: context.userId });

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">{copy.listingsTitle}</h1>

      {listings.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={copy.noListings}
            reason={copy.startLead}
            action={
              <Link
                href="/business/new"
                data-touch-target
                className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
              >
                {copy.navRegister}
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/business/${listing.id}`}
                data-testid="owner-listing"
                data-status={statusKey(listing.status, listing.verificationStatus)}
                className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[18px] font-[650]">{listing.name}</span>
                  <StatusChip status={listing.status} verificationStatus={listing.verificationStatus} copy={copy} />
                </span>
                <span className="mt-1 block text-[14px] text-text-secondary">
                  {CATEGORY_LABEL[locale][listing.category] ?? '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
