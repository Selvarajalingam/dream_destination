import Link from 'next/link';
import { analyticsService, type Dashboard } from '@/modules/analytics/service';
import { operationsService } from '@/modules/operations/service';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';

/**
 * Screen A08 — Impact Analytics.
 *
 * "Show qualified trips, off-peak shifts, hidden-gem interest, local-business
 * exposure/actions, distribution fairness, and data freshness. Demo/seeded
 * data must carry a visible label."
 *
 * Simulated and recorded events are never mixed. The view is one or the
 * other, chosen explicitly, and the simulated view says so at the top.
 */

export const dynamic = 'force-dynamic';

export default async function ImpactAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const showDemo = data !== 'recorded';

  const [dashboard, overview] = await Promise.all([
    analyticsService.dashboard(showDemo),
    operationsService.overview(),
  ]);

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Impact analytics</h1>

      <nav aria-label="Data source" className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/analytics"
          aria-current={showDemo ? 'page' : undefined}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] ${
            showDemo ? 'border-brand-saffron bg-brand-saffron text-brand-deep' : 'border-border-subtle'
          }`}
        >
          Simulated demo data
        </Link>
        <Link
          href="/admin/analytics?data=recorded"
          aria-current={showDemo ? undefined : 'page'}
          className={`inline-flex min-h-[44px] items-center rounded-full border px-4 text-[14px] font-[650] ${
            showDemo ? 'border-border-subtle' : 'border-brand-primary bg-brand-primary text-white'
          }`}
        >
          Recorded in this environment
        </Link>
      </nav>

      {showDemo ? (
        <p
          data-testid="demo-label"
          role="note"
          className="mt-4 rounded-xl border border-brand-saffron bg-surface-warm p-3 text-[14px] font-[650]"
        >
          Simulated demonstration data. These figures were generated to show how the dashboard reads.
          They are not pilot results and must not be presented as outcomes.
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-subtle p-3 text-[14px]">
          Events recorded by this environment as people used it. In a local or demo environment,
          these are test sessions, not travellers.
        </p>
      )}

      {dashboard.totalEvents === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No events recorded yet"
            reason="Nothing has been tracked in this view. Use the traveller screens, or switch to the simulated data to see how the dashboard reads."
          />
        </div>
      ) : (
        <DashboardBody dashboard={dashboard} />
      )}

      <section className="mt-8">
        <h2 className="text-[21px]">Data freshness</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Events in this view" value={String(dashboard.totalEvents)} />
          <Fact
            label="Latest event"
            value={dashboard.latestEventAt === null ? 'None' : relative(dashboard.latestEventAt)}
          />
          <Fact label="Stale sources" value={String(overview.counts.staleSources)} warn={overview.counts.staleSources > 0} />
          <Fact label="Silent crowd feeds" value={String(overview.counts.failedFeeds)} warn={overview.counts.failedFeeds > 0} />
        </dl>
        <p className="mt-2 text-[13px] text-text-secondary">
          Events carry no chat text, precise location, medical details or document content, and are
          tied to a session rather than a person. See docs/analytics-data-dictionary.md.
        </p>
      </section>
    </div>
  );
}

function DashboardBody({ dashboard }: { dashboard: Dashboard }) {
  const { business } = dashboard;
  const maxFunnel = Math.max(1, ...dashboard.funnel.map((stage) => stage.count));

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Fact label="Qualified trips" value={String(dashboard.qualifiedTrips)} hint="Sessions that reached a usable itinerary" />
        <Fact
          label="Off-peak shifts"
          value={`${dashboard.offPeak.accepted} of ${dashboard.offPeak.offered}`}
          hint={dashboard.offPeak.acceptanceRate === null ? 'No quieter times offered' : `${percent(dashboard.offPeak.acceptanceRate)} accepted a quieter time`}
        />
        <Fact label="Hidden-gem views" value={String(dashboard.hiddenGemViews)} hint="Verified lesser-known places opened" />
        <Fact label="Dream Score explanations" value={String(dashboard.dreamScoreOpens)} hint="Times someone opened “why this matches”" />
      </dl>

      <section className="mt-8" aria-labelledby="funnel-heading">
        <h2 id="funnel-heading" className="text-[21px]">Planning funnel</h2>
        <ol data-testid="funnel" className="mt-3 space-y-2">
          {dashboard.funnel.map((stage) => (
            <li key={stage.name}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px]">
                <span className="font-[650]">{stage.name}</span>
                <span className="text-text-secondary">
                  {stage.count}
                  {stage.fromPrevious !== null && ` · ${percent(stage.fromPrevious)} of previous step`}
                </span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
                <div className="h-full rounded-full bg-brand-primary" style={{ width: `${(stage.count / maxFunnel) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8" aria-labelledby="local-heading">
        <h2 id="local-heading" className="text-[21px]">Local business exposure and actions</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {business.totals.map((entry) => (
            <Fact key={entry.label} label={entry.label} value={String(entry.count)} />
          ))}
        </dl>
        <p className="mt-2 text-[13px] text-text-secondary">
          Actions are directions, contacts and itinerary additions. None of these is a confirmed sale,
          and they are not reported as one.
        </p>

        <Card className="mt-4 p-4" data-testid="fairness" data-reading={business.fairness.reading}>
          <h3 className="text-[18px] font-[650]">Distribution fairness</h3>
          <p className="mt-1 text-[16px]">
            Attention is <strong>{business.fairness.reading}</strong>.{' '}
            {business.fairness.reached} of {business.fairness.eligible} listed businesses received at least one
            action, and the top fifth received {percent(business.fairness.topFifthShare)} of all actions.
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            Gini coefficient {business.fairness.gini.toFixed(2)}, counting businesses with no actions as zero.
            Sponsored placement does not affect any ranking that drives this.
          </p>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-[16px] font-[650]">By category</h3>
            <table className="mt-2 w-full text-[14px]">
              <thead>
                <tr className="text-left text-text-secondary">
                  <th scope="col" className="py-1 font-[650]">Category</th>
                  <th scope="col" className="py-1 text-right font-[650]">Impressions</th>
                  <th scope="col" className="py-1 text-right font-[650]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {business.byCategory.map((row) => (
                  <tr key={row.category} className="border-t border-border-subtle">
                    <td className="py-1 capitalize">{row.category}</td>
                    <td className="py-1 text-right">{row.impressions}</td>
                    <td className="py-1 text-right">{row.actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-4">
            <h3 className="text-[16px] font-[650]">Most-actioned businesses</h3>
            <ol className="mt-2 space-y-1 text-[14px]">
              {business.topBusinesses.map((row) => (
                <li key={row.businessId} className="flex justify-between gap-3">
                  <span>{row.name ?? 'Removed listing'}</span>
                  <span className="text-text-secondary">{row.actions}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </section>

      {dashboard.topHiddenGems.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[21px]">Hidden-gem interest</h2>
          <Card className="mt-3 p-4">
            <ol className="space-y-1 text-[14px]">
              {dashboard.topHiddenGems.map((row) => (
                <li key={row.placeId} className="flex justify-between gap-3">
                  <span>{row.name ?? 'Removed place'}</span>
                  <span className="text-text-secondary">{row.views} views</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      )}
    </>
  );
}

function Fact({ label, value, hint, warn = false }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={`rounded-[16px] border p-3 ${warn ? 'border-status-warn/40 bg-status-warn-surface' : 'border-border-subtle'}`}>
      <dt className="text-[13px] font-[650] text-text-secondary">{label}</dt>
      <dd className={`mt-1 text-[21px] font-[750] ${warn ? 'text-status-warn-text' : ''}`}>{value}</dd>
      {hint !== undefined && <dd className="mt-1 text-[13px] text-text-secondary">{hint}</dd>}
    </div>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function relative(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}
