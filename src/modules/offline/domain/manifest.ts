import { DAY_MS } from '@/shared/time';

/**
 * Offline trip pack manifest — PRD Part II §11.2.
 *
 * The shape is fixed by the PRD: tripId, generatedAt, expiresAt and a list of
 * resources each marked required or optional. Required resources are the ones
 * a traveller must have in hand with no signal: the plan itself, help numbers
 * and the rules that apply.
 */

export type OfflineResource = {
  url: string;
  required: boolean;
  /** Shown per-resource while the pack downloads (Screen T21). */
  label: string;
};

export type OfflineManifest = {
  tripId: string;
  generatedAt: string;
  expiresAt: string;
  version: number;
  resources: OfflineResource[];
};

/** A pack is refreshed daily, matching the PRD's example window. */
const PACK_TTL_MS = DAY_MS;

export type ManifestInput = {
  id: string;
  version: number;
};

export function buildOfflineManifest(trip: ManifestInput, now: Date): OfflineManifest {
  const base = `/api/v1/trips/${trip.id}`;

  return {
    tripId: trip.id,
    generatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PACK_TTL_MS).toISOString(),
    version: trip.version,
    resources: [
      { url: `${base}/offline-summary`, required: true, label: 'Itinerary, addresses and coordinates' },
      { url: `${base}/help`, required: true, label: 'Emergency numbers and nearby facilities' },
      { url: `${base}/rules`, required: true, label: 'Rules that apply on this trip' },
      { url: `${base}/stories`, required: false, label: 'Short stories for each place' },
      { url: `${base}/businesses`, required: false, label: 'Local business contact details' },
    ],
  };
}

/** True once the pack has passed its expiry and should be refreshed. */
export function isPackExpired(manifest: OfflineManifest, now: Date): boolean {
  return new Date(manifest.expiresAt).getTime() <= now.getTime();
}

/** True when the trip has changed since the pack was built (PRD §11.3). */
export function isPackOutdated(manifest: OfflineManifest, tripVersion: number): boolean {
  return tripVersion > manifest.version;
}
