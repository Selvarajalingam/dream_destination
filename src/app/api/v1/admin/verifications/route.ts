import { verificationRepository } from '@/modules/verification/repository';
import { json, route } from '@/server/handler';

/**
 * GET /api/v1/admin/verifications — the review queue for Screen A02.
 *
 * Restricted to reviewing roles; a traveller receives a forbidden problem
 * rather than an empty list, so the boundary is explicit.
 */
export const GET = route(
  { auth: 'role', roles: ['verifier', 'tourism_admin', 'platform_admin'] },
  async () => {
    const queue = await verificationRepository.listQueue();
    return json({ queue, expiringSoon: await verificationRepository.expiringSoonCount() });
  },
);
