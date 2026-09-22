import { z } from 'zod';
import { sql } from '@/platform/db/client';
import { json, route } from '@/server/handler';

/**
 * PUT /api/v1/me/locale — the language the owner screens use (B01).
 *
 * English and Tamil are the pilot languages for Coimbatore and the Nilgiris.
 */

const BodySchema = z.object({ locale: z.enum(['en-IN', 'ta-IN']) }).strict();

export const PUT = route({ auth: 'session', body: BodySchema }, async ({ body, session }) => {
  await sql`UPDATE users SET preferred_locale = ${body.locale} WHERE id = ${session.userId!}`;
  return json({ locale: body.locale });
});
