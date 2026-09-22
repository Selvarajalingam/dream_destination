import Link from 'next/link';
import { ACCEPT_ATTRIBUTE } from '@/modules/businesses/domain/files';
import { Card } from '@/components/ui/primitives';
import { loadOwnedListing, ownerContext } from '../../context';
import { FileUploader } from '../FileUploader';
import { UpdatesForms } from './UpdatesForms';

/**
 * Screen B06 — Business Updates.
 *
 * "Allow rapid update of hours, closure, price band, contact, and
 * availability. Sensitive ownership changes require review."
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Update listing' };

export default async function UpdatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await ownerContext();
  if (context === null) return null;
  const { copy, locale } = context;

  const listing = await loadOwnedListing(id, context.userId);

  if (listing.mode !== 'live') {
    return (
      <div>
        <h1 className="text-[26px]">{copy.updatesTitle}</h1>
        <p className="mt-2 text-[16px] text-text-secondary">{copy.statusLabels[listing.status] ?? listing.status}</p>
        <Link href={`/business/${id}`} className="mt-3 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2">
          {copy.open}
        </Link>
      </div>
    );
  }

  const photos = listing.files.filter((file) => file.purpose === 'photo');

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">{copy.updatesTitle}</h1>
      <p className="mt-2 text-[16px] text-text-secondary">{copy.updatesLead}</p>

      <div className="mt-4">
        <UpdatesForms
          businessId={id}
          copy={copy}
          locale={locale}
          current={{
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
            temporaryClosure: listing.temporaryClosure,
            availabilityNote: listing.availabilityNote,
            hasPendingChange: listing.pendingChange !== null,
          }}
        />
      </div>

      <Card className="mt-4 p-4">
        <FileUploader
          businessId={id}
          purpose="photo"
          label={copy.sectionPhotos}
          accept={ACCEPT_ATTRIBUTE.photo}
          files={photos}
          editable
          labels={{ upload: copy.upload, uploading: copy.uploading, remove: copy.remove, uploaded: copy.uploaded, accepted: copy.accepted }}
        />
      </Card>
    </div>
  );
}
