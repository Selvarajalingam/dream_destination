import Link from 'next/link';
import { notFound } from 'next/navigation';
import { verificationRepository } from '@/modules/verification/repository';
import { catalogRepository } from '@/modules/catalog/repository';
import { resolveVerificationDisplay } from '@/modules/verification/domain/gate';
import { rulesRepository } from '@/modules/rules/repository';
import { DecisionForm } from './DecisionForm';

/**
 * Screen A03 — Verification Workspace.
 *
 * Split view: place details and map on one side, evidence, checklist, source
 * links and prior decisions on the other, with the four decision actions. A
 * reason is mandatory, which the form and the API both enforce.
 */

export const dynamic = 'force-dynamic';

export default async function VerificationWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const verification = await verificationRepository.findById(id);
  if (verification === null) notFound();

  const place = await catalogRepository.findPlaceById(verification.placeId);
  if (place === null) notFound();

  const [rules, sources] = await Promise.all([
    rulesRepository.findForPlace(place.id),
    catalogRepository.findSourcesForPlace(place.id),
  ]);

  const display = resolveVerificationDisplay(verification, new Date());

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href="/admin/verifications" className="text-brand-primary underline underline-offset-2">
          Review queue
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">{place.name}</h1>
      <p className="mt-1 text-[14px] capitalize text-text-secondary">
        {place.category.replace(/_/g, ' ')} · status {verification.status.replace(/_/g, ' ')}
        {display.status === 'expired' && ' · past its review date'}
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="text-[21px]">Place details</h2>
          <dl className="mt-3 space-y-2 rounded-[16px] border border-border-subtle p-4 text-[14px]">
            <Row label="Coordinates" value={`${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`} />
            <Row label="Expected visit" value={`${place.expectedVisitMinutes ?? 60} minutes`} />
            <Row
              label="Step-free entry"
              value={place.accessibility.stepFreeEntry === true ? 'Yes' : 'No'}
            />
            <Row label="Hidden gem" value={place.isHiddenGem ? 'Yes' : 'No'} />
          </dl>

          <a
            href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=15/${place.lat}/${place.lng}`}
            target="_blank"
            rel="noreferrer noopener"
            data-touch-target
            className="mt-3 inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
          >
            Open location in maps
          </a>

          <h2 className="mt-6 text-[21px]">Sources on record</h2>
          <ul className="mt-3 space-y-2 text-[14px]">
            {sources.map((source) => (
              <li key={`${source.id}-${source.fieldScope}`} className="rounded-xl border border-border-subtle p-3">
                <p className="font-[650]">{source.issuingAuthority ?? source.name}</p>
                <p className="text-text-secondary">
                  Covers {source.fieldScope}
                  {source.verifiedAt !== null &&
                    ` · verified ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(source.verifiedAt)}`}
                </p>
                {source.sourceUrl !== null && (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-primary underline underline-offset-2"
                  >
                    Open source
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-[21px]">Checklist</h2>
          <dl className="mt-3 space-y-3 rounded-[16px] border border-border-subtle p-4">
            {display.checklistGroups.map((group) => (
              <div key={group.key} className="border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
                <dt className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                  {group.label}
                </dt>
                <dd className="mt-1 text-[14px]">{group.value}</dd>
              </div>
            ))}
          </dl>

          {display.knownLimitations.length > 0 && (
            <>
              <h2 className="mt-6 text-[21px]">Recorded limitations</h2>
              <ul className="mt-3 space-y-2">
                {display.knownLimitations.map((limitation) => (
                  <li
                    key={limitation}
                    className="rounded-xl border border-status-warn/40 bg-status-warn-surface p-3 text-[14px]"
                  >
                    {limitation}
                  </li>
                ))}
              </ul>
            </>
          )}

          {verification.decisionReason !== null && (
            <>
              <h2 className="mt-6 text-[21px]">Previous decision</h2>
              <p className="mt-2 rounded-xl bg-surface-subtle p-3 text-[14px]">
                {verification.decisionReason}
              </p>
            </>
          )}

          {rules.length > 0 && (
            <p className="mt-4 text-[14px] text-text-secondary">
              {rules.length} sourced rule{rules.length === 1 ? '' : 's'} already apply here.
            </p>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="text-[21px]">Decision</h2>
        <DecisionForm verificationId={verification.id} placeSlug={place.slug} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="text-right font-[650]">{value}</dd>
    </div>
  );
}
