import Link from 'next/link';
import { notFound } from 'next/navigation';
import { businessReviewRepository } from '@/modules/businesses/review-repository';
import { BUSINESS_CHECKS, sponsorshipBlocker } from '@/modules/businesses/domain/review';
import { isUuid } from '@/server/authorize';
import { Card } from '@/components/ui/primitives';
import { ListingDecisionForm, SponsorshipDecisionForm } from './ReviewForms';

/**
 * Screen A07 — reviewing one business.
 *
 * The evidence for each PRD check sits beside a confirmation box for it, and
 * the sponsorship decision is a separate panel with its own reason.
 */

export const dynamic = 'force-dynamic';

const OPEN = ['under_review', 'evidence_pending', 'changes_requested'];

export default async function BusinessReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const detail = await businessReviewRepository.findDetail(id);
  if (detail === null) notFound();

  const listingOpen = OPEN.includes(detail.verificationStatus ?? '');
  const requested = detail.sponsorshipRequestedAt !== null && detail.sponsorshipDecidedAt === null;
  const approveBlocker = sponsorshipBlocker(
    { status: detail.status, ownerVerified: detail.ownerVerified, sponsored: detail.sponsored, requested },
    'approved',
  );

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href="/admin/businesses" className="text-brand-primary underline underline-offset-2">
          Business review
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">{detail.name}</h1>
      <p className="mt-1 text-[14px] capitalize text-text-secondary">
        {detail.category.replace(/_/g, ' ')} · listing {detail.status} · verification{' '}
        {(detail.verificationStatus ?? 'none').replace(/_/g, ' ')}
        {detail.requestKind === 'sensitive_change' && ' · change request'}
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <Card className="p-4">
            <h2 className="text-[18px] font-[650]">Listing as submitted</h2>
            {detail.description !== null && <p className="mt-2 text-[16px]">{detail.description}</p>}
            <dl className="mt-3 space-y-2 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Owner account</dt>
                <dd className="font-[650]">{detail.ownerName ?? 'None recorded'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Phone</dt>
                <dd className="font-[650]">{detail.phone ?? 'None'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Coordinates</dt>
                <dd className="font-[650]">
                  {detail.lat.toFixed(4)}, {detail.lng.toFixed(4)}
                </dd>
              </div>
            </dl>
            <a
              href={`https://www.openstreetmap.org/?mlat=${detail.lat}&mlon=${detail.lng}#map=17/${detail.lat}/${detail.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              data-touch-target
              className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
            >
              Check the address on a map
            </a>
          </Card>

          {detail.requestKind === 'sensitive_change' && listingOpen && (
            <Card className="border-status-warn/40 p-4" data-testid="requested-change">
              <h2 className="text-[18px] font-[650]">Requested change to a live listing</h2>
              <p className="mt-1 text-[14px] text-text-secondary">
                Travellers see the current details until you decide. Declining discards the change and leaves the
                listing live.
              </p>
              <ul className="mt-3 space-y-1 text-[14px]">
                {Object.entries(detail.evidence)
                  .filter(([, text]) => text.startsWith('Change '))
                  .flatMap(([, text]) => text.split('; '))
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
              {detail.ownerNote !== null && (
                <p className="mt-3 rounded-xl bg-surface-subtle p-3 text-[14px]">
                  <span className="font-[650]">Owner&apos;s reason: </span>
                  {detail.ownerNote}
                </p>
              )}
            </Card>
          )}

          {detail.files.length > 0 && (
            <Card className="p-4" data-testid="submitted-files">
              <h2 className="text-[18px] font-[650]">Uploaded files</h2>
              <p className="mt-1 text-[14px] text-text-secondary">
                Evidence opens as a download and is visible only to the owner and reviewers.
              </p>
              <ul className="mt-2 space-y-1 text-[14px]">
                {detail.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap justify-between gap-2 border-t border-border-subtle pt-1">
                    <span className="text-text-secondary">
                      {file.purpose === 'photo' ? 'Photo' : file.evidenceKind === 'registration' ? 'Registration' : 'Address proof'}
                    </span>
                    <a
                      href={`/api/v1/business/files/${file.id}`}
                      className="font-[650] text-brand-primary underline underline-offset-2"
                    >
                      {file.originalName}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {detail.decisionReason !== null && !listingOpen && (
            <Card className="p-4">
              <h2 className="text-[18px] font-[650]">Last decision</h2>
              <p className="mt-2 text-[14px]">{detail.decisionReason}</p>
            </Card>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          {listingOpen ? (
            <ListingDecisionForm
              businessId={detail.businessId}
              checks={BUSINESS_CHECKS.map((check) => ({
                key: check.key,
                label: check.label,
                evidence: detail.evidence[check.key] ?? 'No evidence submitted',
              }))}
            />
          ) : (
            <Card className="p-4">
              <h2 className="text-[18px] font-[650]">Listing verification</h2>
              <p className="mt-2 text-[14px] text-text-secondary">
                No verification is waiting for a decision on this listing.
              </p>
            </Card>
          )}

          <SponsorshipDecisionForm
            businessId={detail.businessId}
            sponsored={detail.sponsored}
            requested={requested}
            approveBlocker={approveBlocker}
            lastReason={detail.sponsorshipDecisionReason}
          />
        </section>
      </div>
    </div>
  );
}
