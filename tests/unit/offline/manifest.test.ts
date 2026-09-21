import { describe, expect, it } from 'vitest';
import {
  buildOfflineManifest,
  isPackExpired,
  isPackOutdated,
} from '@/modules/offline/domain/manifest';

const trip = { id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', version: 4 };

describe('buildOfflineManifest', () => {
  it('matches the PRD manifest shape and window', () => {
    const manifest = buildOfflineManifest(trip, new Date('2026-09-21T09:00:00Z'));
    expect(manifest.tripId).toBe(trip.id);
    expect(manifest.generatedAt).toBe('2026-09-21T09:00:00.000Z');
    expect(manifest.expiresAt).toBe('2026-09-22T09:00:00.000Z');
  });

  it('always includes the summary, help and rules resources as required', () => {
    const manifest = buildOfflineManifest(trip, new Date());
    const required = manifest.resources.filter((resource) => resource.required).map((r) => r.url);

    expect(required).toEqual([
      `/api/v1/trips/${trip.id}/offline-summary`,
      `/api/v1/trips/${trip.id}/help`,
      `/api/v1/trips/${trip.id}/rules`,
    ]);
  });

  it('includes the default pack contents from T21', () => {
    const urls = buildOfflineManifest(trip, new Date())
      .resources.map((resource) => resource.url)
      .join(' ');

    for (const part of ['offline-summary', 'help', 'rules', 'stories', 'businesses']) {
      expect(urls).toContain(part);
    }
  });

  it('labels every resource so download progress is meaningful', () => {
    for (const resource of buildOfflineManifest(trip, new Date()).resources) {
      expect(resource.label.length).toBeGreaterThan(5);
    }
  });

  it('records the trip version so a changed trip can be detected', () => {
    expect(buildOfflineManifest(trip, new Date()).version).toBe(4);
  });
});

describe('pack freshness', () => {
  const manifest = buildOfflineManifest(trip, new Date('2026-09-21T09:00:00Z'));

  it('is not expired inside its window', () => {
    expect(isPackExpired(manifest, new Date('2026-09-21T20:00:00Z'))).toBe(false);
  });

  it('is expired once the window has passed', () => {
    expect(isPackExpired(manifest, new Date('2026-09-22T09:00:01Z'))).toBe(true);
  });

  it('is outdated when the trip has moved on', () => {
    expect(isPackOutdated(manifest, 5)).toBe(true);
    expect(isPackOutdated(manifest, 4)).toBe(false);
    expect(isPackOutdated(manifest, 3)).toBe(false);
  });
});
