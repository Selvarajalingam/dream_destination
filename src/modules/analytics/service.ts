import { logger } from '@/platform/observability/logger';
import { BUSINESS_ACTIONS, FUNNEL, validateEvent, type EventName, type EventProperties } from './domain/events';
import { concentration, funnelConversion } from './domain/fairness';
import { analyticsRepository } from './repository';

/**
 * Analytics — event capture and the A08 dashboard.
 *
 * Tracking is best-effort by design. A failed insert is logged and dropped;
 * it must never turn a traveller's successful request into an error. A
 * rejected event, on the other hand, is a bug in the caller and is logged
 * loudly so it gets fixed rather than silently thinning the data.
 */

const FUNNEL_LABELS: Record<string, string> = {
  brief_started: 'Started a trip brief',
  brief_completed: 'Completed the brief',
  shortlist_viewed: 'Saw a shortlist',
  itinerary_generated: 'Got an itinerary',
  offline_pack_saved: 'Saved for offline',
  trip_mode_started: 'Started Trip Mode',
};

const BUSINESS_LABELS: Record<string, string> = {
  business_impression: 'Impressions',
  business_detail_viewed: 'Detail views',
  business_directions: 'Directions',
  business_contact: 'Contacts',
  business_itinerary_add: 'Added to itinerary',
};

export const analyticsService = {
  async track<Name extends EventName>(
    name: Name,
    properties: EventProperties<Name>,
    context: { sessionId: string | null; isDemo?: boolean },
  ): Promise<void> {
    await this.trackUnchecked(name, properties, context);
  },

  /** For events arriving from the browser, whose shape is not yet known. */
  async trackUnchecked(
    name: string,
    properties: unknown,
    context: { sessionId: string | null; isDemo?: boolean },
  ): Promise<boolean> {
    const result = validateEvent(name, properties);
    if (!result.ok) {
      logger.warn('analytics.rejected', { event: name, reason: result.reason });
      return false;
    }

    try {
      await analyticsRepository.insert(result.event, context.sessionId, context.isDemo ?? false);
      return true;
    } catch (error) {
      logger.warn('analytics.insert_failed', {
        event: name,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      return false;
    }
  },

  async dashboard(demo: boolean) {
    const [funnelSessions, businessCounts, actions, byCategory, gems, crowd, latest, total, eligible] =
      await Promise.all([
        analyticsRepository.sessionsPerEvent(FUNNEL, demo),
        analyticsRepository.countsPerEvent(BUSINESS_ACTIONS, demo),
        analyticsRepository.businessActionCounts(demo),
        analyticsRepository.businessByCategory(demo),
        analyticsRepository.topHiddenGems(demo),
        analyticsRepository.countsPerEvent(
          ['crowd_alternative_offered', 'crowd_alternative_accepted', 'hidden_gem_viewed', 'dream_score_opened'],
          demo,
        ),
        analyticsRepository.latestEventAt(demo),
        analyticsRepository.totalEvents(demo),
        analyticsRepository.eligibleBusinessCount(),
      ]);

    const offered = crowd.get('crowd_alternative_offered') ?? 0;
    const accepted = crowd.get('crowd_alternative_accepted') ?? 0;

    return {
      demo,
      totalEvents: total,
      latestEventAt: latest,
      // "Qualified trips": sessions that reached a usable itinerary.
      qualifiedTrips: funnelSessions.get('itinerary_generated') ?? 0,
      funnel: funnelConversion(
        FUNNEL.map((name) => ({ name: FUNNEL_LABELS[name] ?? name, count: funnelSessions.get(name) ?? 0 })),
      ),
      offPeak: {
        offered,
        accepted,
        acceptanceRate: offered === 0 ? null : Math.round((accepted / offered) * 1000) / 1000,
      },
      hiddenGemViews: crowd.get('hidden_gem_viewed') ?? 0,
      dreamScoreOpens: crowd.get('dream_score_opened') ?? 0,
      topHiddenGems: gems,
      business: {
        totals: BUSINESS_ACTIONS.map((name) => ({ label: BUSINESS_LABELS[name] ?? name, count: businessCounts.get(name) ?? 0 })),
        byCategory,
        topBusinesses: actions.slice(0, 5),
        fairness: concentration(
          actions.map((row) => row.actions),
          eligible,
        ),
      },
    };
  },
};

export type Dashboard = Awaited<ReturnType<typeof analyticsService.dashboard>>;
