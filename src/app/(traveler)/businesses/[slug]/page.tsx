import { notFound } from 'next/navigation';
import { businessRepository } from '@/modules/businesses/repository';
import { AddToTrip } from '@/components/patterns/AddToTrip';
import { BusinessListingView } from '@/components/patterns/BusinessListingView';
import { ReportConcern } from '@/components/patterns/ReportConcern';
import { trackPage } from '@/server/track-page';
import { TrackedLink } from '@/components/TrackedLink';
import { todayInIndia } from '@/shared/time';

/**
 * Screen T12 — Local Business Detail.
 *
 * Rendered by the same component as the owner's B04 preview, so what an
 * owner previews is what a traveller gets.
 */

export const dynamic = 'force-dynamic';

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const business = await businessRepository.findBySlug(slug);
  if (business === null) notFound();

  await trackPage('business_detail_viewed', { businessId: business.id, category: business.category as never });

  const tracked = { businessId: business.id, category: business.category as never };

  return (
    <BusinessListingView
      today={todayInIndia()}
      listing={{
        name: business.name,
        category: business.category,
        description: business.description,
        priceBand: business.priceBand,
        ownerVerified: business.ownerVerified,
        sponsored: business.sponsored,
        hours: business.operatingHours,
        lastOwnerUpdateAt: business.lastOwnerUpdateAt,
        phone: business.phone,
        addressText: business.addressText,
        accessibility: business.accessibility as never,
        paymentMethods: business.paymentMethods ?? [],
        services: business.services,
        temporaryClosure: business.temporaryClosure,
        availabilityNote: business.availabilityNote,
        photoIds: business.photoIds,
      }}
      actions={
        <>
          <AddToTrip kind="business" targetId={business.id} label="Add to itinerary" />
          {business.phone !== null && (
            <TrackedLink
              event="business_contact"
              properties={tracked}
              href={`tel:${business.phone}`}
              data-touch-target
              className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
            >
              Call
            </TrackedLink>
          )}
          <TrackedLink
            event="business_directions"
            properties={tracked}
            href={`https://www.openstreetmap.org/?mlat=${business.lat}&mlon=${business.lng}#map=16/${business.lat}/${business.lng}`}
            target="_blank"
            rel="noreferrer noopener"
            data-touch-target
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
          >
            Open in maps
          </TrackedLink>
        </>
      }
      footer={
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-text-secondary">
            Details are provided by the business owner and checked at onboarding. Something wrong?
          </p>
          <ReportConcern entityType="business" slug={business.slug} name={business.name} label="Report an issue" />
        </div>
      }
    />
  );
}
