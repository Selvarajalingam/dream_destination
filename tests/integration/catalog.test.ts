import { afterAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { catalogRepository } from '@/modules/catalog/repository';

afterAll(async () => {
  await sql.end();
});

const COIMBATORE = { lat: 11.0168, lng: 76.9558 };

describe('catalogRepository.searchDestinations', () => {
  it('finds destinations within a radius of Coimbatore', async () => {
    const results = await catalogRepository.searchDestinations({
      nearPoint: COIMBATORE,
      radiusMeters: 120_000,
    });
    expect(results.map((d) => d.slug)).toContain('ooty-nilgiris');
  });

  it('excludes destinations outside the radius', async () => {
    const results = await catalogRepository.searchDestinations({
      nearPoint: COIMBATORE,
      radiusMeters: 5_000,
    });
    expect(results.map((d) => d.slug)).not.toContain('ooty-nilgiris');
  });

  it('returns a distance when a point is supplied', async () => {
    const [nearest] = await catalogRepository.searchDestinations({
      nearPoint: COIMBATORE,
      radiusMeters: 200_000,
    });
    expect(nearest.distanceMeters).toBeGreaterThanOrEqual(0);
  });

  it('orders by distance when a point is supplied', async () => {
    const results = await catalogRepository.searchDestinations({
      nearPoint: COIMBATORE,
      radiusMeters: 200_000,
    });
    const distances = results.map((d) => d.distanceMeters ?? 0);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('filters by theme', async () => {
    const results = await catalogRepository.searchDestinations({ themes: ['wildlife'] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) => d.themes.includes('wildlife'))).toBe(true);
  });

  it('matches any of several themes rather than all of them', async () => {
    const results = await catalogRepository.searchDestinations({ themes: ['wildlife', 'temples'] });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('excludes destinations that need more days than the traveller has', async () => {
    const results = await catalogRepository.searchDestinations({ durationDays: 1 });
    expect(results.every((d) => (d.minimumDays ?? 1) <= 1)).toBe(true);
  });

  it('excludes destinations whose low estimate is over the budget', async () => {
    const results = await catalogRepository.searchDestinations({ maxCostMinor: 600_000 });
    expect(results.every((d) => (d.baseCostLowInr ?? 0) <= 6_000)).toBe(true);
  });

  it('returns only published destinations', async () => {
    const results = await catalogRepository.searchDestinations({});
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((d) => d.status === 'active')).toBe(true);
  });
});

describe('catalogRepository place reads', () => {
  it('returns places for a destination with parsed coordinates and hours', async () => {
    const destination = await catalogRepository.findDestinationBySlug('ooty-nilgiris');
    const places = await catalogRepository.listPlacesForDestination(destination!.id);

    expect(places.length).toBeGreaterThanOrEqual(5);
    const garden = places.find((p) => p.slug === 'ooty-botanical-garden');
    expect(garden).toBeDefined();
    expect(garden!.lat).toBeCloseTo(11.4155, 3);
    expect(garden!.lng).toBeCloseTo(76.7076, 3);
    expect(garden!.operatingHours.mon).toEqual(['07:00', '18:30']);
  });

  it('finds places near a point, ordered by distance', async () => {
    const places = await catalogRepository.findPlacesNear({ lat: 11.41, lng: 76.7 }, 10_000);
    expect(places.length).toBeGreaterThan(0);
    const distances = places.map((p) => p.distanceMeters ?? 0);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('returns the sources backing a place', async () => {
    const place = await catalogRepository.findPlaceBySlug('ooty-botanical-garden');
    const sources = await catalogRepository.findSourcesForPlace(place!.id);

    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources[0].issuingAuthority).toBeTruthy();
    expect(sources[0].verifiedAt).toBeInstanceOf(Date);
    expect(sources.map((s) => s.fieldScope)).toEqual(expect.arrayContaining(['hours', 'price', 'access']));
  });

  it('returns null rather than throwing for an unknown slug', async () => {
    expect(await catalogRepository.findPlaceBySlug('no-such-place')).toBeNull();
    expect(await catalogRepository.findDestinationBySlug('no-such-destination')).toBeNull();
  });
});

describe('catalogRepository Dream Score inputs', () => {
  it('counts verified hidden gems and nearby businesses as local experiences', async () => {
    const destination = await catalogRepository.findDestinationBySlug('ooty-nilgiris');
    const count = await catalogRepository.countLocalExperiences(destination!.id);
    expect(count).toBeGreaterThan(0);
  });

  it('summarises accessibility as a step-free share and a distance to medical care', async () => {
    const destination = await catalogRepository.findDestinationBySlug('coimbatore-city');
    const summary = await catalogRepository.accessibilitySummary(destination!.id);

    expect(summary).not.toBeNull();
    expect(summary!.stepFreeShare).toBeGreaterThanOrEqual(0);
    expect(summary!.stepFreeShare).toBeLessThanOrEqual(1);
    expect(summary!.medicalAccessKm).toBeGreaterThan(0);
  });
});
