import Link from 'next/link';
import { operationsService } from '@/modules/operations/service';
import type { RankedItem } from '@/modules/operations/domain/urgency';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';

/**
 * Screen A01 — Operations Overview.
 *
 * Urgent items first: incidents, lapsed verifications, stale official
 * sources, heavy-crowd overrides and silent crowd feeds, ordered by the
 * tested urgency rule in modules/operations/domain.
 */

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<RankedItem['kind'], string> = {
  incident: 'Incident',
  expired_verification: 'Verification',
  stale_source: 'Source',
  red_override: 'Crowd advisory',
  failed_feed: 'Crowd feed',
};

const TIER_TONE: Record<RankedItem['tierLabel'], string> = {
  'Act now': 'border-status-danger/40 bg-status-danger-surface',
  Today: 'border-status-warn/40 bg-status-warn-surface',
  'This week': 'border-border-subtle bg-surface-base',
};

export default async function OperationsOverviewPage() {
  const overview = await operationsService.overview();
  const { counts } = overview;

  const tiers = (['Act now', 'Today', 'This week'] as const).map((label) => ({
    label,
    items: overview.items.filter((item) => item.tierLabel === label),
  }));

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Operations overview</h1>
      <p data-testid="ops-headline" className="mt-1 text-[16px] font-[650]">
        {overview.headline}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Open incidents" value={counts.openIncidents} href="/admin/incidents" urgent={counts.criticalIncidents > 0} />
        <Stat label="Lapsed verifications" value={counts.expiredVerifications} href="/admin/verifications" urgent={counts.expiredVerifications > 0} />
        <Stat label="Expiring in 30 days" value={counts.expiringVerifications} href="/admin/verifications" />
        <Stat label="Stale sources" value={counts.staleSources} href="/admin/freshness" />
        <Stat label="Heavy-crowd advisories" value={counts.activeRedOverrides} href="/admin/crowd" />
        <Stat label="Silent crowd feeds" value={counts.failedFeeds} href="/admin/crowd" urgent={counts.failedFeeds > 0} />
      </dl>

      {overview.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing needs attention"
            reason="No open incidents, lapsed verifications, stale sources, advisories or silent feeds."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {tiers.map(
            (tier) =>
              tier.items.length > 0 && (
                <section key={tier.label} aria-labelledby={`tier-${tier.label}`}>
                  <h2 id={`tier-${tier.label}`} className="text-[21px]">
                    {tier.label}{' '}
                    <span className="text-[16px] font-normal text-text-secondary">({tier.items.length})</span>
                  </h2>
                  <ul className="mt-3 space-y-2">
                    {tier.items.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <Link
                          href={item.href}
                          data-testid="urgent-item"
                          data-kind={item.kind}
                          data-tier={item.tierLabel}
                          className={`block rounded-[16px] border p-4 hover:brightness-[0.98] ${TIER_TONE[item.tierLabel]}`}
                        >
                          <p className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                            {KIND_LABEL[item.kind]} · {age(item.since)}
                          </p>
                          <p className="mt-1 text-[16px] font-[650]">{item.title}</p>
                          <p className="mt-1 text-[14px] text-text-secondary">{item.detail}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
        </div>
      )}

      {overview.recentAudit.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[21px]">Recent decisions</h2>
          <Card className="mt-3 divide-y divide-border-subtle">
            {overview.recentAudit.map((entry) => (
              <p key={entry.id} className="flex flex-wrap justify-between gap-2 p-3 text-[14px]">
                <span>
                  <span className="font-[650]">{entry.actorName ?? 'System'}</span>{' '}
                  {entry.action.replace(/[._]/g, ' ')}
                </span>
                <span className="text-text-secondary">{age(entry.createdAt)}</span>
              </p>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  urgent = false,
}: {
  label: string;
  value: number;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[16px] border p-3 ${
        urgent ? 'border-status-danger/40 bg-status-danger-surface' : 'border-border-subtle'
      }`}
    >
      <dt className="text-[13px] font-[650] text-text-secondary">{label}</dt>
      <dd className={`mt-1 text-[26px] font-[750] ${urgent ? 'text-status-danger-text' : ''}`}>{value}</dd>
    </Link>
  );
}

function age(since: Date): string {
  const minutes = Math.round((Date.now() - since.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
