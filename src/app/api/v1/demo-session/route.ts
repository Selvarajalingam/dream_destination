import { z } from 'zod';
import { sql } from '@/platform/db/client';
import { createSession } from '@/server/session';
import { json, route } from '@/server/handler';
import { problems } from '@/server/problem';

/**
 * POST /api/v1/demo-session — sign in as a seeded demonstration account.
 *
 * The pilot authentication route is an open production decision (PRD Part II
 * §20), so the demonstration signs in by selecting a seeded role rather than
 * by password. This endpoint refuses to run outside a local or preview
 * environment, so it cannot become a way in anywhere real.
 */

const BodySchema = z.object({
  role: z.enum(['traveler', 'verifier', 'admin']),
});

const EMAILS: Record<string, string> = {
  traveler: 'traveller@demo.dreamdestination.invalid',
  verifier: 'verifier@demo.dreamdestination.invalid',
  admin: 'admin@demo.dreamdestination.invalid',
};

export const POST = route({ auth: 'none', body: BodySchema }, async ({ body, request }) => {
  const environment = process.env.APP_ENV ?? 'local';
  if (environment !== 'local' && environment !== 'preview') {
    throw problems.forbidden('Demonstration sign-in is not available in this environment.');
  }

  const [user] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${EMAILS[body.role]} LIMIT 1
  `;

  if (user === undefined) {
    throw problems.notFound('That demonstration account is not seeded. Run npm run db:seed.');
  }

  const session = await createSession({
    userId: user.id,
    userAgent: request.headers.get('user-agent'),
  });

  return json({ role: body.role, roles: session.roles });
});
