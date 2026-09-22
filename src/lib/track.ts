'use client';

import type { EventName, EventProperties } from '@/modules/analytics/domain/events';

/**
 * Sends one analytics event from the browser.
 *
 * Fire and forget: `keepalive` lets the request finish if the traveller is
 * navigating away, and every failure is swallowed, because an analytics
 * outage must never become something a traveller notices. The event name and
 * properties are typed against the same catalogue the server validates with.
 */
export function track<Name extends EventName>(name: Name, properties: EventProperties<Name>): void {
  try {
    const match = /(?:^|;\s*)dd_csrf=([^;]+)/.exec(document.cookie);
    if (match === null) return;

    void fetch('/api/v1/events', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json', 'x-csrf-token': decodeURIComponent(match[1]) },
      body: JSON.stringify({ events: [{ name, properties }] }),
    }).catch(() => undefined);
  } catch {
    // Nothing to do: analytics is never allowed to throw into the page.
  }
}
