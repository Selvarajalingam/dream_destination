import { MAX_UPLOAD_BYTES } from '@/modules/businesses/domain/files';
import { ownerService } from '@/modules/businesses/owner-service';
import { isUuid } from '@/server/authorize';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/business/listings/{id}/files — B02 photos and B03 evidence.
 *
 * Multipart, one file per request. An oversized request is refused from its
 * declared length before the body is read; the service then checks the
 * actual bytes, including the real file type, before anything is stored.
 */

// The file plus a little multipart framing.
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;

export const POST = route(
  { auth: 'session', rateLimit: { key: 'business-upload', perMinute: 20 } },
  async ({ params, request, session, requestId }) => {
    if (!isUuid(params.id)) throw problems.notFound();

    const declared = Number(request.headers.get('content-length') ?? 'NaN');
    if (!Number.isFinite(declared)) throw problems.validation('The upload must declare its size.');
    if (declared > MAX_REQUEST_BYTES) throw problems.validation('Files can be at most 5 MB.');

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw problems.validation('The upload could not be read. Choose the file again.');
    }

    const file = form.get('file');
    const purpose = form.get('purpose');
    const evidenceKind = form.get('evidenceKind');

    if (!(file instanceof File)) throw problems.validation('Choose a file to upload.');
    if (purpose !== 'photo' && purpose !== 'evidence') throw problems.validation('Say what the file is for.');

    const stored = await ownerService.upload(
      params.id,
      { purpose, evidenceKind: typeof evidenceKind === 'string' && evidenceKind !== '' ? evidenceKind : null, file },
      { userId: session.userId!, requestId },
    );

    return json({ file: stored }, { status: 201 });
  },
);
