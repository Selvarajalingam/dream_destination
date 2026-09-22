import Link from 'next/link';
import { incidentsRepository } from '@/modules/incidents/repository';
import { EmptyState } from '@/components/states/states';

/**
 * Screen A06 — Incident Triage, the queue.
 *
 * Ordered by severity, then by how long each report has waited. The reporter
 * is never shown: the repository does not select them.
 */

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<string, string> = {
  critical: 'bg-status-danger text-white',
  high: 'bg-status-danger-surface text-status-danger-text',
  medium: 'bg-status-warn-surface text-status-warn-text',
  low: 'bg-surface-subtle text-text-secondary',
};

export default async function IncidentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showClosed = view === 'closed';
  const incidents = await incidentsRepository.list({ status: showClosed ? 'closed' : 'active' });

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Incident triage</h1>
      <p className="mt-1 text-[16px] text-text-secondary">
        {showClosed
          ? `${incidents.length} resolved or dismissed report${incidents.length === 1 ? '' : 's'}.`
          : `${incidents.length} open report${incidents.length === 1 ? '' : 's'}, most severe first.`}
      </p>

      <nav aria-label="Incident views" className="mt-4 flex gap-2">
        <Link
          href="/admin/incidents"
          aria-current={showClosed ? undefined : 'page'}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] ${
            showClosed ? 'border-border-subtle' : 'border-brand-primary bg-brand-primary text-white'
          }`}
        >
          Open
        </Link>
        <Link
          href="/admin/incidents?view=closed"
          aria-current={showClosed ? 'page' : undefined}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] ${
            showClosed ? 'border-brand-primary bg-brand-primary text-white' : 'border-border-subtle'
          }`}
        >
          Closed
        </Link>
      </nav>

      {incidents.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title={showClosed ? 'No closed reports' : 'No open reports'}
            reason={showClosed ? 'Nothing has been resolved or dismissed yet.' : 'Every traveller report has been dealt with.'}
          />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/admin/incidents/${incident.id}`}
                data-testid="incident-row"
                data-severity={incident.severity}
                className="block rounded-[16px] border border-border-subtle p-4 hover:bg-surface-subtle"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[13px] font-[700] uppercase ${SEVERITY_TONE[incident.severity]}`}>
                    {incident.severity}
                  </span>
                  <span className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                    {incident.category} · {incident.entityType}
                  </span>
                  {incident.suspendedEntity && (
                    <span className="rounded-full bg-brand-deep px-2 py-0.5 text-[13px] font-[650] text-white">
                      Listing suspended
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[16px] font-[650]">{incident.entityName ?? 'Unknown listing'}</p>
                <p className="mt-1 line-clamp-2 text-[14px] text-text-secondary">{incident.description}</p>
                <p className="mt-2 text-[13px] text-text-secondary">
                  {waited(incident.createdAt)} · {incident.assignedToName ?? 'Unassigned'} · status {incident.status}
                  {incident.hasOwnerResponse && ' · owner has responded'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function waited(since: Date): string {
  const hours = Math.round((Date.now() - since.getTime()) / 3_600_000);
  if (hours < 1) return 'Reported just now';
  if (hours < 48) return `Reported ${hours} h ago`;
  return `Reported ${Math.round(hours / 24)} days ago`;
}
