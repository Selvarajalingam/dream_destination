import Link from 'next/link';
import { ACCEPT_ATTRIBUTE, MAX_PHOTOS } from '@/modules/businesses/domain/files';
import { BUSINESS_CATEGORIES } from '@/modules/businesses/domain/listing';
import { Card } from '@/components/ui/primitives';
import { CATEGORY_LABEL } from '../../copy';
import { loadOwnedListing, ownerContext } from '../../context';
import { FileUploader } from '../FileUploader';
import { OnboardingSteps } from '../OnboardingSteps';
import { DetailsForm } from './DetailsForm';

/** Screen B02 — Business Details. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Business details' };

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await ownerContext();
  if (context === null) return null;
  const { copy, locale } = context;

  const listing = await loadOwnedListing(id, context.userId);

  if (listing.mode !== 'editing') {
    return (
      <div>
        <h1 className="text-[26px]">{listing.name}</h1>
        <p className="mt-2 text-[16px] text-text-secondary">
          {listing.mode === 'live' ? copy.updatesLead : copy.statusLabels[listing.status]}
        </p>
        <Link
          href={listing.mode === 'live' ? `/business/${id}/updates` : `/business/${id}`}
          data-touch-target
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
        >
          {listing.mode === 'live' ? copy.updateListing : copy.open}
        </Link>
      </div>
    );
  }

  const photos = listing.files.filter((file) => file.purpose === 'photo');

  return (
    <div>
      <OnboardingSteps businessId={id} current="details" copy={copy} />
      <h1 className="mt-4 text-[26px] lg:text-[32px]">{copy.detailsTitle}</h1>

      <div className="mt-4">
        <DetailsForm
          businessId={id}
          copy={copy}
          locale={locale}
          categories={BUSINESS_CATEGORIES}
          categoryLabels={CATEGORY_LABEL[locale]}
          nextHref={`/business/${id}/evidence`}
          initial={{
            name: listing.name,
            category: listing.category,
            description: listing.description,
            addressLine: listing.addressLine,
            locality: listing.locality,
            pin: listing.pin,
            lat: listing.lat,
            lng: listing.lng,
            phone: listing.phone,
            ownerName: listing.ownerName,
            hours: listing.hours,
            priceBand: listing.priceBand,
            services: listing.services,
            paymentMethods: listing.paymentMethods,
            accessibility: listing.accessibility,
          }}
        />
      </div>

      <Card className="mt-4 p-4">
        <h2 className="text-[18px] font-[650]">{copy.sectionPhotos}</h2>
        <p className="mt-1 text-[14px] text-text-secondary">
          JPEG, PNG or WebP · 5 MB · {photos.length}/{MAX_PHOTOS}
        </p>
        <div className="mt-3">
          <FileUploader
            businessId={id}
            purpose="photo"
            label={copy.sectionPhotos}
            accept={ACCEPT_ATTRIBUTE.photo}
            files={photos}
            editable
            labels={{ upload: copy.upload, uploading: copy.uploading, remove: copy.remove, uploaded: copy.uploaded, accepted: copy.accepted }}
          />
        </div>
      </Card>
    </div>
  );
}
