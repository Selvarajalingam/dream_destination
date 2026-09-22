import Link from 'next/link';
import { ACCEPT_ATTRIBUTE } from '@/modules/businesses/domain/files';
import { requiredEvidence } from '@/modules/businesses/domain/listing';
import { Card } from '@/components/ui/primitives';
import { loadOwnedListing, ownerContext } from '../../context';
import { FileUploader } from '../FileUploader';
import { OnboardingSteps } from '../OnboardingSteps';

/**
 * Screen B03 — Verification Submission.
 *
 * "Upload required evidence by business type. Explain accepted files,
 * privacy, and review time." The documents asked for depend on the category
 * chosen in B02.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Verification evidence' };

export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await ownerContext();
  if (context === null) return null;
  const { copy } = context;

  const listing = await loadOwnedListing(id, context.userId);
  const editable = listing.mode === 'editing';
  const required = requiredEvidence(listing.category);

  return (
    <div>
      {editable && <OnboardingSteps businessId={id} current="evidence" copy={copy} />}
      <h1 className="mt-4 text-[26px] lg:text-[32px]">{copy.evidenceTitle}</h1>
      <p className="mt-2 text-[16px]">{copy.evidenceLead}</p>

      <ul className="mt-4 space-y-2 rounded-[16px] bg-surface-subtle p-4 text-[14px]">
        <li data-testid="accepted-files">{copy.accepted}</li>
        <li data-testid="evidence-privacy">{copy.privacy}</li>
        <li data-testid="review-time">{copy.reviewTime}</li>
      </ul>

      {required.length === 0 ? (
        <Card className="mt-4 p-4">
          <p className="text-[16px]">{copy.chooseCategoryFirst}</p>
          <Link href={`/business/${id}/details`} className="mt-2 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2">
            {copy.editDetails}
          </Link>
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {required.map((item) => (
            <Card key={item.kind} className="p-4">
              <FileUploader
                businessId={id}
                purpose="evidence"
                evidenceKind={item.kind}
                label={item.label}
                accept={ACCEPT_ATTRIBUTE.evidence}
                files={listing.files.filter((file) => file.evidenceKind === item.kind)}
                editable={editable}
                labels={{ upload: copy.upload, uploading: copy.uploading, remove: copy.remove, uploaded: copy.uploaded, accepted: copy.accepted }}
              />
            </Card>
          ))}
        </div>
      )}

      {editable && (
        <Link
          href={`/business/${id}/preview`}
          data-touch-target
          className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-5 text-[16px] font-[650] text-white"
        >
          {copy.continueToPreview}
        </Link>
      )}
    </div>
  );
}
