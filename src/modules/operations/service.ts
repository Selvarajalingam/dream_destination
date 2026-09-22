import { operationsRepository } from './repository';
import { headline, rankUrgentItems, type OverviewCounts, type RankedItem } from './domain/urgency';

export type OperationsOverview = {
  headline: string;
  counts: OverviewCounts;
  items: RankedItem[];
  recentAudit: Awaited<ReturnType<typeof operationsRepository.recentAudit>>;
};

export const operationsService = {
  async overview(): Promise<OperationsOverview> {
    const [incidents, expired, stale, overrides, feeds, expiring, recentAudit] = await Promise.all([
      operationsRepository.openIncidents(),
      operationsRepository.expiredVerifications(),
      operationsRepository.staleSources(),
      operationsRepository.activeRedOverrides(),
      operationsRepository.failedFeeds(),
      operationsRepository.expiringVerificationCount(),
      operationsRepository.recentAudit(),
    ]);

    const counts: OverviewCounts = {
      openIncidents: incidents.length,
      criticalIncidents: incidents.filter((item) => item.severity === 'critical').length,
      expiredVerifications: expired.length,
      expiringVerifications: expiring,
      staleSources: stale.length,
      activeRedOverrides: overrides.length,
      failedFeeds: feeds.length,
    };

    return {
      headline: headline(counts),
      counts,
      items: rankUrgentItems([...incidents, ...expired, ...stale, ...overrides, ...feeds]),
      recentAudit,
    };
  },
};
