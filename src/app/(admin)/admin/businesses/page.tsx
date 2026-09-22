import Link from 'next/link';
import { businessReviewRepository } from '@/modules/businesses/review-repository';
import { EmptyState } from '@/components/states/states';

/**
 * Screen A07 — Local Business Review, the two queues.
 *
 * Listing verification and sponsored placement are shown as separate queues,
 * because they are separate decisions (PRD Part I A07).
 */

export const dynamic = 'force-dynamic';

export default async function BusinessReviewQueuePage() {
  const [listings, sponsorships] = await Promise.all([
    businessReviewRepository.verificationQueue(),
    businessReviewRepository.sponsorshipQueue(),
  ]);

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Local business review</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        Verifying a listing and approving paid placement are separate decisions, made separately.
      </p>

      <section className="mt-6" aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="text-[21px]">
          Listings awaiting verification{' '}
          <span className="text-[16px] font-normal text-text-secondary">({listings.length})</span>
        </h2>

        {listings.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No listings waiting" reason="Every submitted business has a decision." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {listings.map((row) => (
              <li key={row.businessId}>
                <Link
                  href={`/admin/businesses/${row.businessId}`}
                  data-testid="listing-row"
                  className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
                >
                  <p className="text-[16px] font-[650]">{row.name}</p>
                  <p className="text-[14px] capitalize text-text-secondary">
                    {row.category.replace(/_/g, ' ')} · {row.verificationStatus.replace(/_/g, ' ')} · submitted{' '}
                    {daysAgo(row.submittedAt)}
                  </p>
                  {row.sponsorshipRequested && (
                    <p className="mt-1 text-[13px] text-text-secondary">
                      Also requested sponsorship — decided separately, after verification.
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="sponsorship-heading">
        <h2 id="sponsorship-heading" className="text-[21px]">
          Sponsorship requests{' '}
          <span className="text-[16px] font-normal text-text-secondary">({sponsorships.length})</span>
        </h2>

        {sponsorships.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No sponsorship requests" reason="No business is waiting on a placement decision." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {sponsorships.map((row) => (
              <li key={row.businessId}>
                <Link
                  href={`/admin/businesses/${row.businessId}`}
                  data-testid="sponsorship-row"
                  data-verified={row.ownerVerified}
                  className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
                >
                  <p className="text-[16px] font-[650]">{row.name}</p>
                  <p className="text-[14px] text-text-secondary">
                    {row.ownerVerified && row.status === 'active'
                      ? 'Listing verified — ready for a sponsorship decision.'
                      : 'Listing not yet verified — sponsorship cannot be approved until it is.'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function daysAgo(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
