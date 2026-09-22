import Link from 'next/link';
import { listingGaps, submissionBlockers } from '@/modules/businesses/domain/listing';
import { BusinessListingView } from '@/components/patterns/BusinessListingView';
import { Card } from '@/components/ui/primitives';
import { todayInIndia } from '@/shared/time';
import { loadOwnedListing, ownerContext } from '../../context';
import { OnboardingSteps } from '../OnboardingSteps';
import { SubmitButton } from './SubmitButton';

/**
 * Screen B04 — Listing Preview.
 *
 * "Show exactly how travelers will see the listing. Highlight missing
 * trust-critical fields." The listing renders through the same component as
 * T12, with each gap marked where a traveller would look for it.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Preview listing' };

const INACTIVE = 'inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650] text-text-secondary';

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await ownerContext();
  if (context === null) return null;
  const { copy } = context;

  const listing = await loadOwnedListing(id, context.userId);
  const photos = listing.files.filter((file) => file.purpose === 'photo');
  const evidenceKinds = new Set(listing.files.filter((file) => file.purpose === 'evidence').map((file) => file.evidenceKind ?? ''));

  const gaps = listingGaps(listing, photos.length);
  const critical = gaps.filter((gap) => gap.critical);
  const advice = gaps.filter((gap) => !gap.critical);
  const blockers = submissionBlockers(listing, photos.length, evidenceKinds);
  const evidenceBlockers = blockers.filter((blocker) => !critical.some((gap) => gap.message === blocker));

  return (
    <div>
      {listing.mode === 'editing' && <OnboardingSteps businessId={id} current="preview" copy={copy} />}
      <h1 className="mt-4 text-[26px] lg:text-[32px]">{copy.previewTitle}</h1>
      <p className="mt-2 text-[16px] text-text-secondary">{copy.previewLead}</p>

      {listing.mode === 'editing' && (
        <Card className="mt-4 p-4" data-testid="gaps-panel">
          {blockers.length === 0 ? (
            <p className="text-[16px] font-[650] text-status-good-text">{copy.noGaps}</p>
          ) : (
            <>
              <h2 className="text-[18px] font-[650] text-status-danger-text">{copy.gapsTitle}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px]">
                {critical.map((gap) => (
                  <li key={gap.field} data-testid="critical-gap">
                    {gap.message}
                  </li>
                ))}
                {evidenceBlockers.map((blocker) => (
                  <li key={blocker} data-testid="critical-gap">
                    {blocker}
                  </li>
                ))}
              </ul>
            </>
          )}
          {advice.length > 0 && (
            <>
              <h2 className="mt-4 text-[16px] font-[650]">{copy.adviceTitle}</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-text-secondary">
                {advice.map((gap) => (
                  <li key={gap.field}>{gap.message}</li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <SubmitButton businessId={id} disabled={blockers.length > 0} labels={{ send: copy.sendForReview, sending: copy.sending, sent: copy.sent }} />
            <Link
              href={`/business/${id}/details`}
              data-touch-target
              className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
            >
              {copy.editDetails}
            </Link>
          </div>
        </Card>
      )}

      {/* The traveller view, framed so it cannot be mistaken for the owner's controls. */}
      <section aria-label="Traveller view" className="mt-6 rounded-[20px] border-2 border-dashed border-border-subtle p-4" data-testid="listing-preview">
        <BusinessListingView
          today={todayInIndia()}
          headingLevel={2}
          missing={new Set(critical.map((gap) => gap.field))}
          listing={{
            name: listing.name,
            category: listing.category,
            description: listing.description,
            priceBand: listing.priceBand,
            ownerVerified: listing.approvedUntil !== null,
            sponsored: listing.sponsored,
            hours: listing.hours,
            lastOwnerUpdateAt: listing.lastOwnerUpdateAt,
            phone: listing.phone,
            addressText: [listing.addressLine, listing.locality, listing.pin].filter(Boolean).join(', ') || null,
            accessibility: listing.accessibility,
            paymentMethods: listing.paymentMethods,
            services: listing.services,
            temporaryClosure: listing.temporaryClosure,
            availabilityNote: listing.availabilityNote,
            photoIds: photos.map((photo) => photo.id),
          }}
          actions={
            // Inert here: a preview must not call the owner or count as a visit.
            <>
              <span aria-disabled="true" className={INACTIVE}>Add to itinerary</span>
              {listing.phone !== null && <span aria-disabled="true" className={INACTIVE}>Call</span>}
              <span aria-disabled="true" className={INACTIVE}>Open in maps</span>
            </>
          }
        />
      </section>
    </div>
  );
}
