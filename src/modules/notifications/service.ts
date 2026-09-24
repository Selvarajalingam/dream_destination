import { getPushSender, type PushSubscription } from '@/platform/push';
import { logger } from '@/platform/observability/logger';
import { recordAudit } from '@/server/authorize';
import { DomainError } from '@/shared/result';
import {
  DEFAULT_PREFERENCES,
  decideDelivery,
  dedupeKey,
  shouldRemoveSubscription,
  tripReminders,
  type Category,
  type Preferences,
} from './domain/policy';
import { notificationsRepository, type Delivery } from './repository';

/**
 * Notifications — PRD Part I §11.4, backlog E12-S06 and E12-S07.
 *
 * Everything a traveller would have been told is recorded, whether it was
 * sent, held for quiet hours, or dropped as a repeat. The alert centre shows
 * that record, so refusing permission costs information timing, not the
 * information itself.
 */

const refuse = (message: string, status = 400): DomainError => new DomainError('notifications.refused', message, status);

export type Notification = {
  tripId: string | null;
  category: Category;
  trigger: string;
  title: string;
  body: string;
  url?: string | null;
  /** How long the same trigger stays deduplicated. */
  windowMinutes?: number;
};

export const notificationsService = {
  async subscribe(userId: string, subscription: PushSubscription, userAgent: string | null, requestId?: string): Promise<void> {
    if (!/^https:\/\//.test(subscription.endpoint)) throw refuse('That is not a push endpoint.');
    if (subscription.keys?.p256dh === undefined || subscription.keys?.auth === undefined) {
      throw refuse('That subscription is missing its keys.');
    }

    await notificationsRepository.saveSubscription(userId, subscription, userAgent);
    await recordAudit({
      actorUserId: userId,
      action: 'notifications.subscribed',
      entityType: 'user',
      entityId: userId,
      // The endpoint itself is never written to the audit log.
      afterState: { endpointHost: new URL(subscription.endpoint).host },
      requestId,
    });
  },

  async unsubscribe(userId: string, endpoint: string, requestId?: string): Promise<void> {
    const revoked = await notificationsRepository.revokeSubscription(userId, endpoint);
    if (!revoked) return;
    await recordAudit({
      actorUserId: userId,
      action: 'notifications.unsubscribed',
      entityType: 'user',
      entityId: userId,
      requestId,
    });
  },

  preferences: (userId: string) => notificationsRepository.preferences(userId),

  async savePreferences(userId: string, preferences: Preferences): Promise<void> {
    const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!clock.test(preferences.quietFrom) || !clock.test(preferences.quietUntil)) {
      throw refuse('Quiet hours need two times, such as 21:30 and 07:30.');
    }
    await notificationsRepository.savePreferences(userId, {
      categories: { ...DEFAULT_PREFERENCES.categories, ...preferences.categories },
      quietFrom: preferences.quietFrom,
      quietUntil: preferences.quietUntil,
    });
  },

  /**
   * Runs one notification through the policy and records the outcome. The
   * return says what happened, in the words the traveller would see.
   */
  async notify(userId: string, notification: Notification, now = new Date()): Promise<Delivery | null> {
    const windowMinutes = notification.windowMinutes ?? 6 * 60;
    const preferences = await notificationsRepository.preferences(userId);
    const lastSentAt = await notificationsRepository.lastSentAt(userId, notification.tripId, notification.trigger);

    const decision = decideDelivery({
      category: notification.category,
      preferences,
      now,
      lastSentAt,
      dedupeWindowMinutes: windowMinutes,
    });

    const recorded = await notificationsRepository.record({
      userId,
      tripId: notification.tripId,
      category: notification.category,
      trigger: notification.trigger,
      title: notification.title,
      body: notification.body,
      url: notification.url ?? null,
      state: decision.action === 'send' ? 'queued' : decision.action === 'hold' ? 'held' : 'suppressed',
      reason: decision.action === 'send' ? null : decision.reason,
      deliverAfter: decision.action === 'hold' ? decision.deliverAfter : null,
      dedupeKey: dedupeKey({ tripId: notification.tripId, trigger: notification.trigger, at: now, windowMinutes }),
    });

    // Null means the same thing is already recorded for this window.
    if (recorded === null) return null;
    if (decision.action !== 'send') return recorded;

    return this.deliver(userId, recorded);
  },

  /** Pushes one recorded notification to every live subscription. */
  async deliver(userId: string, delivery: Delivery): Promise<Delivery> {
    const sender = getPushSender();
    const subscriptions = await notificationsRepository.activeSubscriptions(userId);

    let delivered = 0;
    for (const stored of subscriptions) {
      const result = await sender.send(stored.subscription, {
        title: delivery.title,
        body: delivery.body,
        url: delivery.url,
        tag: delivery.id,
      });

      if (result.ok) {
        delivered += 1;
        await notificationsRepository.recordSuccess(stored.id);
        continue;
      }

      const failureCount = await notificationsRepository.recordFailure(stored.id, result.status);
      if (shouldRemoveSubscription({ status: result.status, failureCount })) {
        // §11.4: a dead endpoint is dropped rather than retried forever.
        await notificationsRepository.removeSubscription(stored.id);
        logger.info('push.subscription_removed', { status: result.status, failureCount });
      }
    }

    const state = delivered > 0 ? 'sent' : subscriptions.length === 0 ? 'queued' : 'failed';
    const reason =
      delivered > 0
        ? null
        : subscriptions.length === 0
          ? 'Waiting for a device: you have not allowed notifications yet. It is here in the meantime.'
          : 'The push service would not take it. It is here instead.';

    await notificationsRepository.markState(delivery.id, state, reason);
    return { ...delivery, state, reason, sentAt: state === 'sent' ? new Date() : delivery.sentAt };
  },

  /** Sends anything whose quiet hours have now passed. */
  async releaseHeld(userId: string, now = new Date()): Promise<number> {
    const due = await notificationsRepository.dueHeld(userId, now);
    for (const delivery of due) await this.deliver(userId, delivery);
    return due.length;
  },

  /** E12-S07: the reminders a trip has earned by now. */
  async scheduleTripReminders(
    userId: string,
    trip: { id: string; title: string; startDate: Date | null; offlinePackSaved: boolean },
    now = new Date(),
  ): Promise<Delivery[]> {
    const out: Delivery[] = [];
    for (const reminder of tripReminders({
      tripId: trip.id,
      tripTitle: trip.title,
      startDate: trip.startDate,
      now,
      offlinePackSaved: trip.offlinePackSaved,
    })) {
      const delivery = await this.notify(
        userId,
        {
          tripId: trip.id,
          category: reminder.category,
          trigger: reminder.trigger,
          title: reminder.title,
          body: reminder.body,
          url: `/trips/${trip.id}`,
          windowMinutes: reminder.windowMinutes,
        },
        now,
      );
      if (delivery !== null) out.push(delivery);
    }
    return out;
  },

  alerts: (userId: string) => notificationsRepository.listForUser(userId),
  markRead: (userId: string) => notificationsRepository.markRead(userId),
  subscriptionCount: (userId: string) => notificationsRepository.countActive(userId),
};
