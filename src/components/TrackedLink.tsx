'use client';

import type { AnchorHTMLAttributes } from 'react';
import { track } from '@/lib/track';
import type { EventName, EventProperties } from '@/modules/analytics/domain/events';

/**
 * An ordinary link that records one analytics event when followed. Used for
 * outbound actions — calling a business, opening directions — that leave the
 * app and so can only be counted at the moment of the tap.
 */
export function TrackedLink<Name extends EventName>({
  event,
  properties,
  onClick,
  ...anchor
}: AnchorHTMLAttributes<HTMLAnchorElement> & { event: Name; properties: EventProperties<Name> }) {
  return (
    <a
      {...anchor}
      onClick={(clickEvent) => {
        track(event, properties);
        onClick?.(clickEvent);
      }}
    />
  );
}
