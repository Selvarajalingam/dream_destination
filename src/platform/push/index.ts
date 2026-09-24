import { logger } from '@/platform/observability/logger';
import { withTimeout } from '@/platform/resilience/with-timeout';
import { encryptPayload, vapidFromEnvironment, vapidHeaders, type PushSubscription } from './encryption';

/**
 * Push delivery — PRD Part I §11.4, backlog E12-S06.
 *
 * With VAPID keys configured, messages go to the browser's push service,
 * encrypted to its own key. Without them there is no push service to talk
 * to, so delivery is recorded rather than faked: the traveller still sees
 * every notification in the in-app alert centre, and the screen says push is
 * not configured instead of implying a message was sent.
 */

export type PushMessage = {
  title: string;
  body: string;
  url: string | null;
  /** Used by the service worker to replace an earlier notification. */
  tag: string;
};

export type PushResult = { ok: true } | { ok: false; status: number | null; reason: string };

export interface PushSender {
  readonly name: string;
  /** True when messages actually reach a browser. */
  readonly delivers: boolean;
  send(subscription: PushSubscription, message: PushMessage): Promise<PushResult>;
}

/** Used when no VAPID keys are configured. Records, never pretends. */
export class RecordingPushSender implements PushSender {
  readonly name = 'recording';
  readonly delivers = false;

  async send(subscription: PushSubscription, message: PushMessage): Promise<PushResult> {
    logger.info('push.recorded', { endpointHost: new URL(subscription.endpoint).host, tag: message.tag });
    return { ok: true };
  }
}

export class WebPushSender implements PushSender {
  readonly name = 'web-push';
  readonly delivers = true;

  constructor(private readonly keys: NonNullable<ReturnType<typeof vapidFromEnvironment>>) {}

  async send(subscription: PushSubscription, message: PushMessage): Promise<PushResult> {
    try {
      const body = encryptPayload(subscription, JSON.stringify(message));
      const response = await withTimeout(
        fetch(subscription.endpoint, {
          method: 'POST',
          headers: { ...vapidHeaders(subscription.endpoint, this.keys), ttl: '86400' },
          body: new Uint8Array(body),
        }),
        5_000,
        'web-push',
      );

      if (response.ok) return { ok: true };
      return { ok: false, status: response.status, reason: `The push service answered ${response.status}.` };
    } catch (error) {
      return { ok: false, status: null, reason: error instanceof Error ? error.message : 'The push service could not be reached.' };
    }
  }
}

let cached: PushSender | null = null;

export function getPushSender(): PushSender {
  if (cached !== null) return cached;
  const keys = vapidFromEnvironment();
  cached = keys === null ? new RecordingPushSender() : new WebPushSender(keys);
  return cached;
}

export function resetPushSender(): void {
  cached = null;
}

export type { PushSubscription } from './encryption';
