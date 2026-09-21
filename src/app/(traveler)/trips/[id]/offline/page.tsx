import { notFound } from 'next/navigation';
import { tripsRepository } from '@/modules/trips/repository';
import { buildOfflineManifest } from '@/modules/offline/domain/manifest';
import { getSession } from '@/server/session';
import { OfflinePack } from './OfflinePack';

/**
 * Screen T21 — Offline Trip Pack.
 *
 * The manifest is built server-side from the PRD Part II §11.2 shape and
 * handed to the client, which asks the service worker to fetch and store each
 * resource and reports per-resource progress.
 */

export const dynamic = 'force-dynamic';

export default async function OfflinePackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getSession();
  const trip = await tripsRepository.findById(id);

  if (trip === null || session === null || trip.ownerUserId !== session.userId) notFound();

  const manifest = buildOfflineManifest({ id: trip.id, version: trip.version }, new Date());

  return (
    <OfflinePack
      tripId={trip.id}
      tripTitle={trip.destinationName ?? trip.title}
      tripVersion={trip.version}
      manifest={manifest}
    />
  );
}
