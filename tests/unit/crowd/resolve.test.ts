import { describe, expect, it } from 'vitest';
import { resolveCrowdStatus } from '@/modules/crowd/domain/resolve';

const now = new Date('2026-12-20T10:00:00Z');
const future = new Date('2026-12-20T14:00:00Z');
const past = new Date('2026-12-20T09:00:00Z');

describe('resolveCrowdStatus', () => {
  it('returns unknown when there is no signal at all', () => {
    const status = resolveCrowdStatus({ override: null, observations: [], forecast: null }, now);
    expect(status.band).toBe('unknown');
    expect(status.label).toBe('Unknown');
    expect(status.source).toBe('none');
  });

  it('prefers an active administrator override over every other source', () => {
    const status = resolveCrowdStatus(
      {
        override: { band: 'heavy', reason: 'Festival procession', startsAt: past, expiresAt: future },
        observations: [
          {
            band: 'comfortable',
            observedAt: now,
            expiresAt: future,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 200,
          },
        ],
        forecast: { band: 'comfortable', confidence: 0.8, startsAt: past, endsAt: future, expiresAt: future },
      },
      now,
    );
    expect(status.band).toBe('heavy');
    expect(status.source).toBe('override');
    expect(status.explanation).toContain('Festival procession');
  });

  it('ignores an override that has expired', () => {
    const status = resolveCrowdStatus(
      {
        override: { band: 'heavy', reason: 'Old event', startsAt: past, expiresAt: past },
        observations: [],
        forecast: { band: 'moderate', confidence: 0.7, startsAt: past, endsAt: future, expiresAt: future },
      },
      now,
    );
    expect(status.source).toBe('forecast');
    expect(status.band).toBe('moderate');
  });

  it('ignores an override that has not started yet', () => {
    const status = resolveCrowdStatus(
      {
        override: {
          band: 'heavy',
          reason: 'Tomorrow',
          startsAt: new Date('2026-12-21T00:00:00Z'),
          expiresAt: new Date('2026-12-21T12:00:00Z'),
        },
        observations: [],
        forecast: { band: 'comfortable', confidence: 0.7, startsAt: past, endsAt: future, expiresAt: future },
      },
      now,
    );
    expect(status.source).toBe('forecast');
    expect(status.band).toBe('comfortable');
  });

  it('returns unknown when every observation and forecast has expired', () => {
    const status = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'heavy',
            observedAt: past,
            expiresAt: past,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 100,
          },
        ],
        forecast: { band: 'heavy', confidence: 0.6, startsAt: past, endsAt: past, expiresAt: past },
      },
      now,
    );
    expect(status.band).toBe('unknown');
    expect(status.source).toBe('none');
  });

  it('prefers a fresh sensor feed over aggregated check-ins', () => {
    const status = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'moderate',
            observedAt: now,
            expiresAt: future,
            confidence: 0.5,
            sourceKind: 'aggregated_checkin',
            sampleSize: 40,
          },
          {
            band: 'heavy',
            observedAt: now,
            expiresAt: future,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 500,
          },
        ],
        forecast: null,
      },
      now,
    );
    expect(status.source).toBe('sensor');
    expect(status.band).toBe('heavy');
  });

  it('suppresses aggregated check-ins below the privacy threshold', () => {
    const status = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'heavy',
            observedAt: now,
            expiresAt: future,
            confidence: 0.8,
            sourceKind: 'aggregated_checkin',
            sampleSize: 3,
          },
        ],
        forecast: null,
      },
      now,
    );
    expect(status.source).not.toBe('aggregated_checkin');
    expect(status.band).toBe('unknown');
  });

  it('marks a forecast-only status as lower confidence than a sensor status', () => {
    const forecastOnly = resolveCrowdStatus(
      {
        override: null,
        observations: [],
        forecast: { band: 'moderate', confidence: 0.6, startsAt: past, endsAt: future, expiresAt: future },
      },
      now,
    );
    const sensor = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'moderate',
            observedAt: now,
            expiresAt: future,
            confidence: 0.95,
            sourceKind: 'sensor',
            sampleSize: 400,
          },
        ],
        forecast: null,
      },
      now,
    );
    expect(forecastOnly.confidence).toBeLessThan(sensor.confidence);
  });

  it('decays confidence as an observation ages', () => {
    const fresh = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'moderate',
            observedAt: now,
            expiresAt: future,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 400,
          },
        ],
        forecast: null,
      },
      now,
    );
    const aged = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'moderate',
            observedAt: past,
            expiresAt: future,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 400,
          },
        ],
        forecast: null,
      },
      now,
    );
    expect(aged.confidence).toBeLessThan(fresh.confidence);
  });

  it('never labels any status as live', () => {
    const status = resolveCrowdStatus(
      {
        override: null,
        observations: [
          {
            band: 'moderate',
            observedAt: now,
            expiresAt: future,
            confidence: 0.9,
            sourceKind: 'sensor',
            sampleSize: 200,
          },
        ],
        forecast: null,
      },
      now,
    );
    expect(status.explanation).not.toMatch(/\blive\b/i);
    expect(status.label).not.toMatch(/\blive\b/i);
  });

  it('gives every band a text label so colour is never the only signal', () => {
    const labels = new Set<string>();
    for (const band of ['comfortable', 'moderate', 'heavy'] as const) {
      const status = resolveCrowdStatus(
        {
          override: { band, reason: 'test', startsAt: past, expiresAt: future },
          observations: [],
          forecast: null,
        },
        now,
      );
      labels.add(status.label);
    }
    expect(labels).toEqual(new Set(['Comfortable', 'Moderate', 'Heavy crowd']));
  });
});
