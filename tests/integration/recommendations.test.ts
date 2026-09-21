import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { recommendationsService } from '@/modules/recommendations/service';
import { DREAM_SCORE_ALGORITHM_VERSION } from '@/modules/recommendations/domain/dream-score';
import type { TripBrief } from '@/platform/ai/schemas';

/** The PRD's own validation prompt: a four-day family trip within ₹25,000. */
const BRIEF: TripBrief = {
  origin: { label: 'Coimbatore', coordinates: [76.9558, 11.0168] },
  dateFlexibility: '2026-12',
  durationDays: 4,
  party: { type: 'family', adults: 3, children: 1 },
  budget: { currency: 'INR', totalMinor: 2_500_000 },
  interests: ['nature', 'heritage'],
  crowdTolerance: 'low',
  pace: 'relaxed',
  constraints: { lowWalking: true, medicalAccessRequired: true },
};

beforeAll(async () => {
  await sql`DELETE FROM recommendation_scores`;
});

afterAll(async () => {
  await sql`DELETE FROM recommendation_scores`;
  await sql.end();
});

describe('recommendationsService.shortlist', () => {
  it('returns three realistic options', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    expect(shortlist).toHaveLength(3);
  });

  it('ranks by total score, highest first', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    const totals = shortlist.map((entry) => entry.score.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it('gives every option one advantage and one trade-off', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    for (const entry of shortlist) {
      expect(entry.advantage.length).toBeGreaterThan(5);
      expect(entry.tradeOff.length).toBeGreaterThan(5);
    }
  });

  it('never presents the score as a safety measure', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    const text = shortlist.flatMap((entry) => [...entry.score.reasons, entry.tradeOff]).join(' ');
    expect(text).not.toMatch(/\bsafe\b|\bsafety\b/i);
  });

  it('computes travel time from the declared origin', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false, limit: 10 });

    // Coimbatore City is the origin itself, so zero minutes is correct there.
    // Every destination away from the origin must carry real travel time.
    for (const entry of shortlist) {
      expect(entry.travelMinutes).toBeGreaterThanOrEqual(0);
    }

    const away = shortlist.filter((entry) => entry.destination.slug !== 'coimbatore-city');
    expect(away.length).toBeGreaterThan(0);
    for (const entry of away) {
      expect(entry.travelMinutes, entry.destination.slug).toBeGreaterThan(60);
    }
  });

  it('keeps every shortlisted option within reach of the declared budget', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    for (const entry of shortlist) {
      expect(entry.estimatedCostLowMinor).toBeLessThanOrEqual(2_500_000 * 1.5);
    }
  });

  it('drops destinations that need more days than the traveller has', async () => {
    const shortlist = await recommendationsService.shortlist(
      { ...BRIEF, durationDays: 1 },
      { persist: false, limit: 10 },
    );
    for (const entry of shortlist) {
      expect(entry.destination.minimumDays ?? 1).toBeLessThanOrEqual(1);
    }
  });

  it('reports a crowd band, using unknown rather than guessing', async () => {
    const shortlist = await recommendationsService.shortlist(BRIEF, { persist: false });
    for (const entry of shortlist) {
      expect(['comfortable', 'moderate', 'heavy', 'unknown']).toContain(entry.expectedCrowdBand);
    }
  });

  it('is deterministic for the same brief', async () => {
    const first = await recommendationsService.shortlist(BRIEF, { persist: false });
    const second = await recommendationsService.shortlist(BRIEF, { persist: false });
    expect(second.map((entry) => entry.destination.slug)).toEqual(
      first.map((entry) => entry.destination.slug),
    );
    expect(second.map((entry) => entry.score.total)).toEqual(first.map((entry) => entry.score.total));
  });

  it('changes the ranking when the traveller changes what matters', async () => {
    const balanced = await recommendationsService.shortlist(BRIEF, { persist: false });
    const crowdFirst = await recommendationsService.shortlist(BRIEF, {
      persist: false,
      weightOverrides: { crowdComfort: 0.8 },
    });
    expect(crowdFirst[0].score.total).not.toBe(balanced[0].score.total);
  });

  it('persists components, weights, version and input snapshot', async () => {
    await recommendationsService.shortlist(BRIEF, { persist: true });

    const rows = await sql<
      Array<{
        total_score: string;
        components: Record<string, number>;
        weights: Record<string, number>;
        algorithm_version: string;
        input_snapshot: Record<string, unknown>;
      }>
    >`SELECT total_score, components, weights, algorithm_version, input_snapshot FROM recommendation_scores`;

    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(Object.keys(row.components)).toHaveLength(7);
      expect(row.weights.interestMatch).toBe(0.25);
      expect(row.algorithm_version).toBe(DREAM_SCORE_ALGORITHM_VERSION);
      expect(row.input_snapshot).toHaveProperty('brief');
      expect(row.input_snapshot).toHaveProperty('expectedCrowdBand');
    }
  });

  it('still returns options when the brief carries almost nothing', async () => {
    const shortlist = await recommendationsService.shortlist({ durationDays: 3 }, { persist: false });
    expect(shortlist.length).toBeGreaterThan(0);
    // With no interests, budget or origin declared, confidence must not be high.
    expect(shortlist[0].score.confidence).not.toBe('high');
  });
});

describe('recommendationsService.scoreFor', () => {
  it('returns the score for one named destination', async () => {
    const entry = await recommendationsService.scoreFor('ooty-nilgiris', BRIEF);
    expect(entry).not.toBeNull();
    expect(entry!.destination.slug).toBe('ooty-nilgiris');
    expect(entry!.score.components.interestMatch).toBeGreaterThan(0);
  });

  it('returns null for a destination that does not exist', async () => {
    expect(await recommendationsService.scoreFor('no-such-place', BRIEF)).toBeNull();
  });
});
