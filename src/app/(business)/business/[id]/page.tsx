import Link from 'next/link';
import { ownerService } from '@/modules/businesses/owner-service';
import { Card } from '@/components/ui/primitives';
import { formatSourceDate } from '@/shared/time';
import { loadOwnedListing, ownerContext } from '../context';
import { StatusChip } from '../StatusChip';
import { ConfirmDetailsButton, ReportResponseForm, SponsorshipButton } from './OwnerActions';

/**
 * Screen B05 — Business Dashboard.
 *
 * "Show listing status, required updates, impressions, saves, direction
 * requests, contact actions, and itinerary additions. Avoid claiming
 * confirmed sales unless conversion data is available."
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Listing dashboard' };

const LEVEL_TONE = {
  required: 'border-status-danger/40 bg-status-danger-surface',
  advice: 'border-border-subtle bg-surface-base',
  info: 'border-border-subtle bg-surface-subtle',
} as const;

const LINK = 'inline-flex min-h-[44px] items-center rounded-xl px-4 text-[14px] font-[650]';

export default async function OwnerDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await ownerContext();
  if (context === null) return null;
  const { copy } = context;

  // Resolves ownership first, so another owner's id renders the 404 page.
  await loadOwnedListing(id, context.userId);
  const { record, activity, reports, requirements } = await ownerService.dashboard(id, { userId: context.userId });
  const live = record.mode === 'live';
  const sponsorshipOpen = record.sponsorshipRequestedAt !== null && record.sponsorshipDecidedAt === null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[26px] lg:text-[32px]">{record.name}</h1>
        <StatusChip status={record.status} verificationStatus={record.verification?.status ?? null} copy={copy} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {record.mode === 'editing' && (
          <Link href={`/business/${id}/details`} data-touch-target className={`${LINK} bg-brand-primary text-white`}>
            {copy.continueSetup}
          </Link>
        )}
        {live && (
          <Link href={`/business/${id}/updates`} data-touch-target className={`${LINK} bg-brand-primary text-white`}>
            {copy.updateListing}
          </Link>
        )}
        <Link href={`/business/${id}/preview`} data-touch-target className={`${LINK} border border-border-subtle`}>
          {copy.previewListing}
        </Link>
        {live && (
          <Link href={`/businesses/${record.slug}`} data-touch-target className={`${LINK} border border-border-subtle`}>
            {copy.open}
          </Link>
        )}
      </div>

      <section className="mt-6" aria-labelledby="requirements-heading">
        <h2 id="requirements-heading" className="text-[21px]">
          {copy.requiredUpdates}
        </h2>
        {requirements.length === 0 ? (
          <p className="mt-2 text-[16px] text-text-secondary">{copy.nothingNeeded}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {requirements.map((requirement) => (
              <li
                key={`${requirement.kind}-${requirement.message}`}
                data-testid="requirement"
                data-kind={requirement.kind}
                className={`rounded-[16px] border p-3 text-[14px] ${LEVEL_TONE[requirement.level]}`}
              >
                {requirement.message}
                {requirement.kind === 'confirm_details' && (
                  <div className="mt-2">
                    <ConfirmDetailsButton businessId={id} label={copy.confirmDetails} doneText={copy.confirmed} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {(live || record.status === 'suspended') && (
        <section className="mt-6" aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="text-[21px]">
            {copy.activityTitle}
          </h2>
          <p data-testid="activity-disclaimer" className="mt-1 text-[14px] text-text-secondary">
            {copy.activityDisclaimer}
          </p>
          {activity.includesDemo && (
            <p data-testid="activity-demo" className="mt-2 rounded-xl bg-status-warn-surface p-2 text-[14px] font-[650] text-status-warn-text">
              {copy.demoActivity}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="activity">
            {activity.metrics.map((metric) => (
              <div key={metric.key} className="rounded-[16px] border border-border-subtle p-3" data-metric={metric.key}>
                <dt className="text-[13px] font-[650] text-text-secondary">{metric.label}</dt>
                <dd className="mt-1 text-[26px] font-[750]">{metric.count ?? <span className="text-[16px] font-[650] text-text-secondary">{copy.notMeasured}</span>}</dd>
                <dd className="mt-1 text-[13px] text-text-secondary">{metric.help}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {reports.length > 0 && (
        <section className="mt-6" aria-labelledby="reports-heading">
          <h2 id="reports-heading" className="text-[21px]">
            {copy.reportsTitle}
          </h2>
          <p className="mt-1 text-[14px] text-text-secondary">{copy.reportsLead}</p>
          <ul className="mt-3 space-y-3">
            {reports.map((report) => (
              <li key={report.id} data-testid="owner-report">
                <Card className="p-4">
                  <p className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                    {report.category} · {formatSourceDate(report.createdAt)}
                  </p>
                  <p className="mt-1 text-[16px]">{report.description}</p>
                  {report.ownerResponse !== null ? (
                    <p className="mt-3 rounded-xl bg-surface-subtle p-3 text-[14px]">
                      <span className="font-[650]">{copy.yourResponse}: </span>
                      {report.ownerResponse}
                    </p>
                  ) : (
                    <ReportResponseForm
                      businessId={id}
                      reportId={report.id}
                      labels={{ yourResponse: copy.yourResponse, respond: copy.respond, responded: copy.responded }}
                    />
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live && (
        <section className="mt-6" aria-labelledby="sponsorship-heading">
          <Card className="p-4">
            <h2 id="sponsorship-heading" className="text-[18px] font-[650]">
              {copy.sponsorshipTitle}
            </h2>
            <p className="mt-1 text-[14px] text-text-secondary">{copy.sponsorshipBody}</p>
            <div className="mt-3" data-testid="owner-sponsorship">
              {record.sponsored ? (
                <p className="text-[14px] font-[650]">{copy.sponsorshipActive}</p>
              ) : sponsorshipOpen ? (
                <p className="text-[14px] font-[650]">{copy.sponsorshipRequested}</p>
              ) : record.approvedUntil === null ? (
                <p className="text-[14px] text-text-secondary">{copy.sponsorshipNeedsVerification}</p>
              ) : (
                <SponsorshipButton businessId={id} label={copy.requestSponsorship} doneText={copy.sponsorshipRequested} />
              )}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
