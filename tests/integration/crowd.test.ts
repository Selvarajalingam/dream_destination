import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { catalogRepository } from '@/modules/catalog/repository';
import { crowdService } from '@/modules/crowd/service';

afterAll(async () => {
  await sql.end();
});

const placeIdFor = async (slug: string): Promise<string> => {
  const place = await catalogRepository.findPlaceBySlug(slug);
  if (place === null) throw new Error(`seed is missing ${slug}`);
  return place.id;
};

describe('crowdService.getStatus', () => {
  it('honours the seeded administrator override above every other signal', async () => {
    const placeId = await placeIdFor('ooty-botanical-garden');
    const status = await crowdService.getStatus(placeId);

    expect(status.source).toBe('override');
    expect(status.band).toBe('heavy');
    expect(status.label).toBe('Heavy crowd');
    expect(status.explanation).toMatch(/festival procession/i);
  });

  it('returns unknown for a place with no crowd data at all', async () => {
    const placeId = await placeIdFor('st-stephens-church');
    const status = await crowdService.getStatus(placeId);

    expect(status.band).toBe('unknown');
    expect(status.label).toBe('Unknown');
    expect(status.source).toBe('none');
  });

  it('uses the sensor stream when there is no override', async () => {
    const placeId = await placeIdFor('doddabetta-peak');
    const status = await crowdService.getStatus(placeId);

    expect(['sensor', 'forecast']).toContain(status.source);
    expect(status.band).not.toBe('unknown');
    expect(status.observedAt).toBeInstanceOf(Date);
  });

  it('returns unknown for any place once its data has expired', async () => {
    const placeId = await placeIdFor('doddabetta-peak');
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const status = await crowdService.getStatus(placeId, farFuture);

    expect(status.band).toBe('unknown');
    expect(status.source).toBe('none');
  });

  it('never describes a status as live', async () => {
    const placeId = await placeIdFor('ooty-botanical-garden');
    const status = await crowdService.getStatus(placeId);
    expect(status.explanation).not.toMatch(/\blive\b/i);
  });

  it('carries a confidence label alongside the numeric confidence', async () => {
    const placeId = await placeIdFor('doddabetta-peak');
    const status = await crowdService.getStatus(placeId);
    expect(status.confidenceLabel).toMatch(/^(High|Medium|Low) confidence$/);
    expect(status.confidence).toBeGreaterThanOrEqual(0);
    expect(status.confidence).toBeLessThanOrEqual(1);
  });
});

describe('crowdService.getStatusForPlaces', () => {
  it('returns a status for every requested place', async () => {
    const ids = await Promise.all(
      ['ooty-botanical-garden', 'doddabetta-peak', 'st-stephens-church'].map(placeIdFor),
    );
    const statuses = await crowdService.getStatusForPlaces(ids);

    expect(statuses.size).toBe(3);
    for (const id of ids) expect(statuses.has(id)).toBe(true);
  });

  it('returns an empty map for no places', async () => {
    expect((await crowdService.getStatusForPlaces([])).size).toBe(0);
  });
});

describe('crowdService.findQuieterTime', () => {
  it('suggests the quietest upcoming hour from the forecast', async () => {
    const placeId = await placeIdFor('ooty-lake');

    // Forecasts are seeded hourly between 06:00 and 19:00 local, so ask from
    // the small hours of tomorrow rather than from "this time tomorrow",
    // which could fall after the last slot of the day.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const beforeDawn = new Date(tomorrow);
    beforeDawn.setHours(1, 0, 0, 0);

    const quieter = await crowdService.findQuieterTime(placeId, tomorrow, beforeDawn);

    expect(quieter).not.toBeNull();
    expect(quieter!.startsAt.getTime()).toBeGreaterThan(beforeDawn.getTime());
    expect(quieter!.band).not.toBe('unknown');
  });

  it('prefers a comfortable slot over a busy one', async () => {
    const placeId = await placeIdFor('ooty-lake');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const beforeDawn = new Date(tomorrow);
    beforeDawn.setHours(1, 0, 0, 0);

    const quieter = await crowdService.findQuieterTime(placeId, tomorrow, beforeDawn);
    expect(['comfortable', 'moderate']).toContain(quieter!.band);
  });

  it('returns null when there is no forecast for that place', async () => {
    const placeId = await placeIdFor('st-stephens-church');
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(await crowdService.findQuieterTime(placeId, tomorrow, tomorrow)).toBeNull();
  });
});

describe('crowdService.sourceHealth', () => {
  it('reports observation recency and forecast availability for the admin screen', async () => {
    const placeId = await placeIdFor('doddabetta-peak');
    const health = await crowdService.sourceHealth(placeId);

    expect(health.lastObservationAt).toBeInstanceOf(Date);
    expect(health.observationCount24h).toBeGreaterThan(0);
    expect(health.hasForecast).toBe(true);
  });
});
