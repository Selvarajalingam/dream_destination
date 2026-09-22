'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, Chip } from '@/components/ui/primitives';
import { CrowdStatusBadge, type CrowdStatusView } from '@/components/patterns/CrowdStatusBadge';
import { DreamScoreSummary, type DreamScoreView } from '@/components/patterns/DreamScore';
import { EmptyState, ErrorState, LoadingState } from '@/components/states/states';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { formatInrRange } from '@/shared/money';
import type { TripBriefView } from '../dream-ai/TripSummaryPanel';

/**
 * Screen T04 — the shortlist.
 *
 * Every option carries one clear advantage and one clear trade-off, the score
 * is labelled "Trip match", and estimated figures say so.
 */

type Option = {
  destination: {
    id: string;
    slug: string;
    name: string;
    district: string | null;
    summary: string;
    themes: string[];
  };
  tripMatch: number;
  components: Record<string, number>;
  weights: Record<string, number>;
  missingDimensions: string[];
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  advantage: string;
  tradeOff: string;
  algorithmVersion: string;
  estimatedCost: { lowMinor: number; highMinor: number; state: string };
  travel: { minutes: number; isEstimate: boolean };
  expectedCrowdBand: CrowdStatusView['band'];
  localExperienceCount: number;
};

type SortKey = 'match' | 'cost' | 'travel' | 'quiet';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'match', label: 'Best match' },
  { key: 'cost', label: 'Lower cost' },
  { key: 'travel', label: 'Shorter travel' },
  { key: 'quiet', label: 'Quieter' },
];

const CROWD_LABEL: Record<CrowdStatusView['band'], string> = {
  comfortable: 'Comfortable',
  moderate: 'Moderate',
  heavy: 'Heavy crowd',
  unknown: 'Unknown',
};

const CROWD_RANK: Record<CrowdStatusView['band'], number> = {
  comfortable: 0,
  moderate: 1,
  unknown: 2,
  heavy: 3,
};

function formatTravel(minutes: number): string {
  if (minutes === 0) return 'You are here';
  if (minutes < 60) return `${minutes} min away`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `about ${hours} ${hours === 1 ? 'hour' : 'hours'} away`;
}

export function Shortlist() {
  const router = useRouter();

  const [brief, setBrief] = useState<TripBriefView | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [sort, setSort] = useState<SortKey>('match');
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('dd.brief');
    const parsed: TripBriefView = stored === null ? {} : (JSON.parse(stored) as TripBriefView);
    setBrief(parsed);

    void (async () => {
      try {
        await ensureSession();
        const result = await api.post<{ options: Option[] }>(
          '/api/v1/recommendations/destinations',
          { brief: parsed },
        );
        setOptions(result.options);
      } catch (caught) {
        setError(
          caught instanceof ApiProblemError
            ? caught.problem.detail ?? caught.problem.title
            : 'We could not load destinations.',
        );
      }
    })();
  }, []);

  const buildTrip = async (option: Option): Promise<void> => {
    setBuilding(option.destination.slug);
    try {
      const result = await api.post<{ trip: { id: string } }>('/api/v1/trips', {
        brief: brief ?? {},
        destinationSlug: option.destination.slug,
      });
      router.push(`/trips/${result.trip.id}?generate=1`);
    } catch (caught) {
      setError(
        caught instanceof ApiProblemError
          ? caught.problem.detail ?? caught.problem.title
          : 'We could not start this trip.',
      );
      setBuilding(null);
    }
  };

  if (error !== null) {
    return (
      <div className="mt-4">
        <ErrorState
          title="Destinations could not be loaded"
          whatFailed={error}
          stillAvailable="Your trip details have been kept. You can browse the catalog instead."
          action={
            <a
              href="/explore"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-border-subtle px-4 text-[14px] font-[650]"
            >
              Browse destinations
            </a>
          }
        />
      </div>
    );
  }

  if (options === null) {
    return (
      <div className="mt-4">
        <LoadingState label="Finding destinations that match your trip" rows={3} />
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState
          title="Nothing matched this brief"
          reason="No destination in the pilot region fits these dates, budget and trip length together. Widening the budget or the number of days usually helps."
          action={
            <a
              href="/dream-ai"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
            >
              Change the trip details
            </a>
          }
        />
      </div>
    );
  }

  const sorted = [...options].sort((a, b) => {
    if (sort === 'cost') return a.estimatedCost.lowMinor - b.estimatedCost.lowMinor;
    if (sort === 'travel') return a.travel.minutes - b.travel.minutes;
    if (sort === 'quiet') return CROWD_RANK[a.expectedCrowdBand] - CROWD_RANK[b.expectedCrowdBand];
    return b.tripMatch - a.tripMatch;
  });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] text-text-secondary">Sort by</span>
        {SORTS.map((option) => (
          <Chip key={option.key} selected={sort === option.key} onClick={() => setSort(option.key)}>
            {option.label}
          </Chip>
        ))}
      </div>

      <ul className="mt-4 space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
        {sorted.map((option) => (
          <li key={option.destination.id}>
            <Card data-testid="shortlist-option" className="flex h-full flex-col p-4">
              <h2 className="text-[21px]">{option.destination.name}</h2>
              {option.destination.district !== null && (
                <p className="text-[14px] text-text-secondary">{option.destination.district}</p>
              )}

              <div className="mt-3">
                <DreamScoreSummary
                  destinationId={option.destination.id}
                  score={
                    {
                      tripMatch: option.tripMatch,
                      components: option.components,
                      weights: option.weights,
                      missingDimensions: option.missingDimensions,
                      confidence: option.confidence,
                      reasons: option.reasons,
                      tradeOff: option.tradeOff,
                      algorithmVersion: option.algorithmVersion,
                    } satisfies DreamScoreView
                  }
                />
              </div>

              <dl className="mt-4 space-y-2 text-[14px]">
                <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                  <dt className="text-text-secondary">Expected trip cost</dt>
                  <dd className="text-right font-[650]">
                    {formatInrRange(option.estimatedCost.lowMinor, option.estimatedCost.highMinor)}
                    <span className="block text-[13px] font-normal text-text-secondary">
                      estimated, not a quote
                    </span>
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                  <dt className="text-text-secondary">Travel from your origin</dt>
                  <dd className="text-right font-[650]">
                    {formatTravel(option.travel.minutes)}
                    {option.travel.isEstimate && (
                      <span className="block text-[13px] font-normal text-text-secondary">
                        estimated
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                  <dt className="text-text-secondary">Local experiences</dt>
                  <dd className="font-[650]">{option.localExperienceCount}</dd>
                </div>
              </dl>

              <div className="mt-3">
                <CrowdStatusBadge
                  compact
                  status={{
                    band: option.expectedCrowdBand,
                    label: CROWD_LABEL[option.expectedCrowdBand],
                    source: 'forecast',
                    confidence: 0.6,
                    confidenceLabel: 'Medium confidence',
                    observedAt: null,
                    isStale: false,
                    explanation:
                      option.expectedCrowdBand === 'unknown'
                        ? 'We do not have enough recent information for the main places here.'
                        : 'Based on how busy the main places at this destination usually are.',
                  }}
                />
              </div>

              <p data-testid="advantage" className="mt-4 text-[14px]">
                <span className="font-[650] text-status-good-text">Suits you: </span>
                {option.advantage}
              </p>
              <p data-testid="trade-off" className="mt-1 text-[14px]">
                <span className="font-[650] text-status-warn-text">Trade-off: </span>
                {option.tradeOff}
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <Button
                  onClick={() => void buildTrip(option)}
                  disabled={building !== null}
                >
                  {building === option.destination.slug ? 'Building your trip…' : 'Build my trip'}
                </Button>
                <a
                  href={`/destinations/${option.destination.slug}`}
                  data-touch-target
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border-subtle text-[14px] font-[650]"
                >
                  View destination
                </a>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
