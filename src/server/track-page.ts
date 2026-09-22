import { analyticsService } from '@/modules/analytics/service';
import type { EventName, EventProperties } from '@/modules/analytics/domain/events';
import { getSession } from './session';

/**
 * Records an analytics event from a server-rendered page.
 *
 * Used for events that are defined by a page being shown — a hidden gem
 * viewed, a business listing opened — so they are counted whether or not the
 * browser runs any script. Never throws: a page render must not fail because
 * analytics did.
 */
export async function trackPage<Name extends EventName>(
  name: Name,
  properties: EventProperties<Name>,
): Promise<void> {
  try {
    const session = await getSession();
    await analyticsService.track(name, properties, { sessionId: session?.id ?? null });
  } catch {
    // Deliberately silent; analyticsService already logs insert failures.
  }
}
