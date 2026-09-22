/**
 * Operations urgency — PRD Part I A01: "Show urgent items first: incident
 * reports, expired verifications, stale official sources, red crowd overrides,
 * and failed provider feeds."
 *
 * The order is a safety judgement, so it lives here as a tested rule rather
 * than as a sort buried in a query. Anything that can put a traveller at risk
 * right now outranks anything that is merely out of date.
 */

export type UrgentKind =
  | 'incident'
  | 'expired_verification'
  | 'stale_source'
  | 'red_override'
  | 'failed_feed';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type UrgentItem = {
  kind: UrgentKind;
  id: string;
  title: string;
  detail: string;
  href: string;
  /** When the condition started: report time, expiry time, or feed silence. */
  since: Date;
  /** Only meaningful for incidents. */
  severity?: IncidentSeverity;
};

export type RankedItem = UrgentItem & {
  /** Lower is more urgent. Exposed so the screen can group by tier. */
  tier: number;
  tierLabel: 'Act now' | 'Today' | 'This week';
};

/**
 * Tier for each kind of item.
 *
 * - A critical or high incident, or a verification that has lapsed on a place
 *   travellers are still being sent to, can harm someone today.
 * - A silent crowd feed means travellers see Unknown instead of a reading, and
 *   a red override is an active crowd advisory someone must watch.
 * - A stale source is real but slower: the information may still be right.
 */
function tierFor(item: UrgentItem): number {
  switch (item.kind) {
    case 'incident':
      if (item.severity === 'critical') return 0;
      if (item.severity === 'high') return 1;
      if (item.severity === 'medium') return 3;
      return 5;
    case 'expired_verification':
      return 1;
    case 'failed_feed':
      return 2;
    case 'red_override':
      return 3;
    case 'stale_source':
      return 4;
    default:
      return 6;
  }
}

function labelFor(tier: number): RankedItem['tierLabel'] {
  if (tier <= 1) return 'Act now';
  if (tier <= 3) return 'Today';
  return 'This week';
}

/**
 * Orders items most urgent first. Within a tier, the one that has waited
 * longest comes first, so nothing sits at the bottom of a busy queue forever.
 */
export function rankUrgentItems(items: readonly UrgentItem[]): RankedItem[] {
  return items
    .map((item) => {
      const tier = tierFor(item);
      return { ...item, tier, tierLabel: labelFor(tier) };
    })
    .sort((a, b) => a.tier - b.tier || a.since.getTime() - b.since.getTime());
}

export type OverviewCounts = {
  openIncidents: number;
  criticalIncidents: number;
  expiredVerifications: number;
  expiringVerifications: number;
  staleSources: number;
  activeRedOverrides: number;
  failedFeeds: number;
};

/** A single sentence for the top of the screen, stating the most urgent fact. */
export function headline(counts: OverviewCounts): string {
  if (counts.criticalIncidents > 0) {
    return `${counts.criticalIncidents} critical incident${counts.criticalIncidents === 1 ? ' needs' : 's need'} a decision now.`;
  }
  if (counts.expiredVerifications > 0) {
    return `${counts.expiredVerifications} verification${counts.expiredVerifications === 1 ? ' has lapsed and needs' : 's have lapsed and need'} re-review.`;
  }
  if (counts.openIncidents > 0) {
    return `${counts.openIncidents} open incident${counts.openIncidents === 1 ? '' : 's'} to triage.`;
  }
  if (counts.failedFeeds > 0) {
    return `${counts.failedFeeds} crowd feed${counts.failedFeeds === 1 ? ' is' : 's are'} not reporting.`;
  }
  return 'Nothing urgent. Stale content and expiring verifications are listed below.';
}
