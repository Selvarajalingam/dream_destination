import { z } from 'zod';
import { safeNext } from '@/modules/identity/domain/portals';
import { json, route } from '@/server/handler';
import { signIn } from '@/server/login';

/**
 * POST /api/v1/auth/login — email and password sign-in for one portal.
 *
 * Rate limited per session on top of the per-account lockout, and CSRF
 * protected like every other state-changing route, so a sign-in cannot be
 * forced from another site.
 */

const BodySchema = z
  .object({
    portal: z.enum(['traveller', 'business', 'staff']),
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(200),
    next: z.string().max(500).optional(),
  })
  .strict();

export const POST = route(
  { auth: 'none', body: BodySchema, rateLimit: { key: 'auth-login', perMinute: 10 } },
  async ({ body, session, request, requestId }) => {
    const signedIn = await signIn({
      portal: body.portal,
      email: body.email,
      password: body.password,
      userAgent: request.headers.get('user-agent'),
      previous: session,
      requestId,
    });

    return json({ roles: signedIn.roles, next: safeNext(body.next, body.portal) });
  },
);
