import Link from 'next/link';
import { notFound } from 'next/navigation';
import { incidentsRepository } from '@/modules/incidents/repository';
import { canSuspend } from '@/modules/incidents/domain/incidents';
import { isUuid } from '@/server/authorize';
import { Card } from '@/components/ui/primitives';
import { IncidentActions } from './IncidentActions';

/**
 * Screen A06 — Incident Triage, a single report.
 *
 * The PRD's seven elements, in order: severity, location, evidence, reporter
 * privacy, listing state, owner response and action log.
 */

export const dynamic = 'force-dynamic';

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const incident = await incidentsRepository.findById(id);
  if (incident === null) notFound();

  const [log, triagers] = await Promise.all([
    incidentsRepository.actionLog(incident.id, incident.entityId),
    incidentsRepository.assignableTriagers(),
  ]);

  const publicHref =
    incident.entitySlug === null
      ? null
      : incident.entityType === 'place'
        ? `/places/${incident.entitySlug}`
        : `/businesses/${incident.entitySlug}`;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <Link href="/admin/incidents" className="text-brand-primary underline underline-offset-2">
          Incident queue
        </Link>
      </nav>

      <h1 className="mt-2 text-[26px] lg:text-[32px]">{incident.entityName ?? 'Unknown listing'}</h1>
      <p data-testid="incident-severity" className="mt-1 text-[16px] font-[650] capitalize">
        {incident.severity} · {incident.category} · status {incident.status}
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 space-y-4">
          <Card className="p-4">
            <h2 className="text-[18px] font-[650]">What was reported</h2>
            <p className="mt-2 whitespace-pre-line text-[16px]">{incident.description}</p>
            <p className="mt-3 text-[14px] text-text-secondary">
              No photos or files are collected with reports in this build, so the description is the
              whole of the evidence.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[18px] font-[650]">Reporter</h2>
            <p data-testid="reporter-privacy" className="mt-2 text-[14px]">
              Identity withheld. Reporter details are not available in triage, and contact details or
              exact coordinates typed into the report were removed before it was saved.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[18px] font-[650]">Location and listing</h2>
            <dl className="mt-2 space-y-2 text-[14px]">
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Listing type</dt>
                <dd className="font-[650] capitalize">{incident.entityType}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Listing state</dt>
                <dd data-testid="listing-state" className="font-[650] capitalize">
                  {incident.entityStatus ?? 'unknown'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-secondary">Other open reports here</dt>
                <dd className="font-[650]">{incident.otherOpenReportsOnEntity}</dd>
              </div>
              {incident.lat !== null && incident.lng !== null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-text-secondary">Coordinates</dt>
                  <dd className="font-[650]">
                    {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {publicHref !== null && (
                <a
                  href={publicHref}
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
                >
                  See traveller view
                </a>
              )}
              {incident.lat !== null && incident.lng !== null && (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${incident.lat}&mlon=${incident.lng}#map=15/${incident.lat}/${incident.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-3 text-[14px] font-[650]"
                >
                  Open in maps
                </a>
              )}
            </div>
          </Card>

          {incident.entityType === 'business' && (
            <Card className="p-4">
              <h2 className="text-[18px] font-[650]">Owner response</h2>
              {incident.ownerResponse === null ? (
                <p className="mt-2 text-[14px] text-text-secondary">The owner has not responded.</p>
              ) : (
                <p data-testid="owner-response" className="mt-2 text-[16px]">
                  {incident.ownerResponse}
                </p>
              )}
            </Card>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          <IncidentActions
            incidentId={incident.id}
            status={incident.status}
            severity={incident.severity}
            entityStatus={incident.entityStatus}
            assignedTo={incident.assignedTo}
            triagers={triagers}
            suspendAvailable={canSuspend(incident.severity)}
          />

          <Card className="p-4">
            <h2 className="text-[18px] font-[650]">Action log</h2>
            {log.length === 0 ? (
              <p className="mt-2 text-[14px] text-text-secondary">No action taken yet.</p>
            ) : (
              <ol data-testid="action-log" className="mt-2 divide-y divide-border-subtle">
                {log.map((entry) => (
                  <li key={entry.id} className="py-2 text-[14px]">
                    <p>
                      <span className="font-[650]">{entry.actorName ?? 'System'}</span>{' '}
                      {entry.action.replace(/[._]/g, ' ')}
                    </p>
                    {reasonOf(entry.after) !== null && (
                      <p className="text-text-secondary">&ldquo;{reasonOf(entry.after)}&rdquo;</p>
                    )}
                    <p className="text-[13px] text-text-secondary">
                      {new Intl.DateTimeFormat('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'Asia/Kolkata',
                      })
                        .format(entry.createdAt)
                        .replace('Sept', 'Sep')}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function reasonOf(state: unknown): string | null {
  if (state === null || typeof state !== 'object') return null;
  const reason = (state as Record<string, unknown>).reason;
  return typeof reason === 'string' ? reason : null;
}
