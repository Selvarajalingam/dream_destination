import { describe, expect, it } from 'vitest';
import { TripBriefSchema } from '@/platform/ai/schemas';

describe('TripBriefSchema', () => {
  it('accepts the PRD example brief verbatim', () => {
    const example = {
      origin: { label: 'Coimbatore', coordinates: [76.9558, 11.0168] },
      dateFlexibility: '2026-12',
      durationDays: 4,
      party: { type: 'family', adults: 3, children: 1 },
      budget: { currency: 'INR', totalMinor: 2500000 },
      interests: ['nature', 'heritage', 'local_food'],
      crowdTolerance: 'low',
      pace: 'relaxed',
      constraints: { lowWalking: true, medicalAccessRequired: true },
    };
    const result = TripBriefSchema.safeParse(example);
    expect(result.success).toBe(true);
  });

  it('accepts a partial brief, since extraction is incremental', () => {
    expect(TripBriefSchema.safeParse({ durationDays: 3 }).success).toBe(true);
    expect(TripBriefSchema.safeParse({}).success).toBe(true);
  });

  it('rejects a negative or zero duration', () => {
    expect(TripBriefSchema.safeParse({ durationDays: -1 }).success).toBe(false);
    expect(TripBriefSchema.safeParse({ durationDays: 0 }).success).toBe(false);
  });

  it('rejects an unreasonably long trip', () => {
    expect(TripBriefSchema.safeParse({ durationDays: 400 }).success).toBe(false);
  });

  it('rejects a non-integer budget in minor units', () => {
    expect(TripBriefSchema.safeParse({ budget: { currency: 'INR', totalMinor: 2500.5 } }).success).toBe(false);
  });

  it('rejects a negative budget', () => {
    expect(TripBriefSchema.safeParse({ budget: { currency: 'INR', totalMinor: -100 } }).success).toBe(false);
  });

  it('rejects coordinates outside valid ranges', () => {
    expect(TripBriefSchema.safeParse({ origin: { label: 'X', coordinates: [200, 100] } }).success).toBe(false);
    expect(TripBriefSchema.safeParse({ origin: { label: 'X', coordinates: [76.9, 95] } }).success).toBe(false);
  });

  it('rejects an unknown crowd tolerance or pace', () => {
    expect(TripBriefSchema.safeParse({ crowdTolerance: 'none' }).success).toBe(false);
    expect(TripBriefSchema.safeParse({ pace: 'frantic' }).success).toBe(false);
  });

  it('rejects a party with negative travellers', () => {
    expect(TripBriefSchema.safeParse({ party: { type: 'family', adults: -1, children: 0 } }).success).toBe(false);
  });
});
