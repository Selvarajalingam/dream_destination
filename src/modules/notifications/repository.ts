import { createHash } from 'node:crypto';
import { sql } from '@/platform/db/client';
import type { PushSubscription } from '@/platform/push';
import { open, seal } from '@/server/secret-box';
import { DEFAULT_PREFERENCES, type Category, type Preferences } from './domain/policy';

/**
 * Push subscriptions, preferences and what was sent.
 *
 * A subscription is stored encrypted and addressed by a hash of its endpoint,
 * so a database read gives neither the endpoint nor the keys needed to push
 * to it (PRD Part II §12.1: stolen push subscription endpoints).
 */

export type StoredSubscription = { id: string; subscription: PushSubscription; failureCount: number };

export type Delivery = {
  id: string;
  category: Category;
  title: string;
  body: string;
  url: string | null;
  state: 'queued' | 'held' | 'sent' | 'suppressed' | 'failed';
  reason: string | null;
  deliverAfter: Date | null;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

const endpointHash = (endpoint: string): string => createHash('sha256').update(endpoint).digest('hex');

export const notificationsRepository = {
  async saveSubscription(userId: string, subscription: PushSubscription, userAgent: string | null): Promise<string> {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO push_subscriptions (user_id, endpoint_hash, subscription_encrypted, user_agent)
      VALUES (
        ${userId}, ${endpointHash(subscription.endpoint)}, ${seal(JSON.stringify(subscription))}, ${userAgent}
      )
      ON CONFLICT (endpoint_hash) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            subscription_encrypted = EXCLUDED.subscription_encrypted,
            user_agent = EXCLUDED.user_agent,
            revoked_at = NULL,
            failure_count = 0,
            last_failure_at = NULL,
            last_failure_status = NULL
      RETURNING id
    `;
    return row.id;
  },

  async revokeSubscription(userId: string, endpoint: string): Promise<boolean> {
    const rows = await sql`
      UPDATE push_subscriptions SET revoked_at = now()
      WHERE user_id = ${userId} AND endpoint_hash = ${endpointHash(endpoint)} AND revoked_at IS NULL
      RETURNING id
    `;
    return rows.length === 1;
  },

  async activeSubscriptions(userId: string): Promise<StoredSubscription[]> {
    const rows = await sql<Array<{ id: string; sealed: Uint8Array; failureCount: number }>>`
      SELECT id, subscription_encrypted AS sealed, failure_count AS "failureCount"
      FROM push_subscriptions WHERE user_id = ${userId} AND revoked_at IS NULL
    `;

    const subscriptions: StoredSubscription[] = [];
    for (const row of rows) {
      const plain = open(row.sealed);
      // Unreadable means the key changed; the browser will resubscribe.
      if (plain === null) continue;
      subscriptions.push({ id: row.id, subscription: JSON.parse(plain) as PushSubscription, failureCount: row.failureCount });
    }
    return subscriptions;
  },

  async countActive(userId: string): Promise<number> {
    const [row] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM push_subscriptions WHERE user_id = ${userId} AND revoked_at IS NULL
    `;
    return row.count;
  },

  async recordFailure(subscriptionId: string, status: number | null): Promise<number> {
    const [row] = await sql<{ failureCount: number }[]>`
      UPDATE push_subscriptions
      SET failure_count = failure_count + 1, last_failure_at = now(), last_failure_status = ${status}
      WHERE id = ${subscriptionId}
      RETURNING failure_count AS "failureCount"
    `;
    return row?.failureCount ?? 0;
  },

  async recordSuccess(subscriptionId: string): Promise<void> {
    await sql`
      UPDATE push_subscriptions SET last_success_at = now(), failure_count = 0 WHERE id = ${subscriptionId}
    `;
  },

  async removeSubscription(subscriptionId: string): Promise<void> {
    await sql`DELETE FROM push_subscriptions WHERE id = ${subscriptionId}`;
  },

  // --- Preferences --------------------------------------------------------

  async preferences(userId: string): Promise<Preferences> {
    const [row] = await sql<Array<{ categories: Record<string, boolean>; quietFrom: string; quietUntil: string }>>`
      SELECT categories, to_char(quiet_from, 'HH24:MI') AS "quietFrom", to_char(quiet_until, 'HH24:MI') AS "quietUntil"
      FROM notification_preferences WHERE user_id = ${userId}
    `;
    if (row === undefined) return DEFAULT_PREFERENCES;

    return {
      categories: { ...DEFAULT_PREFERENCES.categories, ...row.categories } as Preferences['categories'],
      quietFrom: row.quietFrom,
      quietUntil: row.quietUntil,
    };
  },

  async savePreferences(userId: string, preferences: Preferences): Promise<void> {
    await sql`
      INSERT INTO notification_preferences (user_id, categories, quiet_from, quiet_until)
      VALUES (${userId}, ${sql.json(preferences.categories)}, ${preferences.quietFrom}, ${preferences.quietUntil})
      ON CONFLICT (user_id) DO UPDATE
        SET categories = EXCLUDED.categories,
            quiet_from = EXCLUDED.quiet_from,
            quiet_until = EXCLUDED.quiet_until,
            updated_at = now()
    `;
  },

  // --- Deliveries ---------------------------------------------------------

  /** When this trigger last reached the traveller, for deduplication. */
  async lastSentAt(userId: string, tripId: string | null, trigger: string): Promise<Date | null> {
    const [row] = await sql<{ sentAt: Date }[]>`
      SELECT sent_at AS "sentAt" FROM notification_deliveries
      WHERE user_id = ${userId} AND trigger_key = ${trigger}
        AND trip_id IS NOT DISTINCT FROM ${tripId} AND sent_at IS NOT NULL
      ORDER BY sent_at DESC LIMIT 1
    `;
    return row?.sentAt ?? null;
  },

  /** Returns null when the same key is already recorded, which is the dedupe. */
  async record(input: {
    userId: string;
    tripId: string | null;
    category: Category;
    trigger: string;
    title: string;
    body: string;
    url: string | null;
    state: Delivery['state'];
    reason: string | null;
    deliverAfter: Date | null;
    dedupeKey: string;
  }): Promise<Delivery | null> {
    const [row] = await sql<Delivery[]>`
      INSERT INTO notification_deliveries (
        user_id, trip_id, category, trigger_key, title, body, url, state, reason, deliver_after, dedupe_key, sent_at
      ) VALUES (
        ${input.userId}, ${input.tripId}, ${input.category}, ${input.trigger}, ${input.title}, ${input.body},
        ${input.url}, ${input.state}, ${input.reason}, ${input.deliverAfter}, ${input.dedupeKey},
        ${input.state === 'sent' ? sql`now()` : null}
      )
      ON CONFLICT (user_id, dedupe_key) DO NOTHING
      RETURNING id, category, title, body, url, state, reason,
                deliver_after AS "deliverAfter", sent_at AS "sentAt", read_at AS "readAt", created_at AS "createdAt"
    `;
    return row ?? null;
  },

  async markState(deliveryId: string, state: Delivery['state'], reason: string | null): Promise<void> {
    await sql`
      UPDATE notification_deliveries
      SET state = ${state}, reason = ${reason}, sent_at = ${state === 'sent' ? sql`now()` : sql`sent_at`}
      WHERE id = ${deliveryId}
    `;
  },

  /** The in-app alert centre: everything, including what was held or dropped. */
  async listForUser(userId: string, limit = 30): Promise<Delivery[]> {
    return sql<Delivery[]>`
      SELECT id, category, title, body, url, state, reason,
             deliver_after AS "deliverAfter", sent_at AS "sentAt", read_at AS "readAt", created_at AS "createdAt"
      FROM notification_deliveries WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  },

  /** Held notifications whose quiet hours have passed. */
  async dueHeld(userId: string, now: Date): Promise<Delivery[]> {
    return sql<Delivery[]>`
      SELECT id, category, title, body, url, state, reason,
             deliver_after AS "deliverAfter", sent_at AS "sentAt", read_at AS "readAt", created_at AS "createdAt"
      FROM notification_deliveries
      WHERE user_id = ${userId} AND state = 'held' AND deliver_after <= ${now}
      ORDER BY created_at
    `;
  },

  async markRead(userId: string): Promise<void> {
    await sql`UPDATE notification_deliveries SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL`;
  },
};
