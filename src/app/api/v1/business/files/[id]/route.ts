import { getObjectStore } from '@/platform/storage';
import { ownerRepository } from '@/modules/businesses/owner-repository';
import { isAdmin, isUuid } from '@/server/authorize';
import { route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * GET /api/v1/business/files/{id} — one uploaded photo or evidence file.
 *
 * Evidence is readable only by the listing's owner and by reviewers, and is
 * always sent as a download. A photo becomes public once its listing is live.
 * Anyone else gets the same 404 as for a file that does not exist.
 */

export const GET = route({ auth: 'none' }, async ({ params, session }) => {
  if (!isUuid(params.id)) throw problems.notFound();

  const file = await ownerRepository.findFileForRead(params.id);
  if (file === null) throw problems.notFound();

  const privileged = isAdmin(session) || (session.userId !== null && session.userId === file.ownerUserId);
  const publicPhoto = file.purpose === 'photo' && file.listingStatus === 'active';
  if (!privileged && !publicPhoto) throw problems.notFound();

  const bytes = await getObjectStore().get(file.storageKey);
  if (bytes === null) throw problems.notFound();

  const disposition = file.purpose === 'evidence' ? 'attachment' : 'inline';

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      // The type found from the file's bytes at upload, never the declared one.
      'content-type': file.contentType,
      'content-length': String(bytes.byteLength),
      'content-disposition': `${disposition}; filename="${file.originalName.replace(/"/g, '')}"`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'cache-control': publicPhoto && !privileged ? 'public, max-age=300' : 'private, no-store',
    },
  });
});
