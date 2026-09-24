import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from '@/platform/db/client';
import { notificationsRepository } from '@/modules/notifications/repository';
import { notificationsService } from '@/modules/notifications/service';
import { DEFAULT_PREFERENCES } from '@/modules/notifications/domain/policy';
import { cleanupTestUsers, createTestUser } from './helpers';

let userId: string;

const subscription = (suffix: string) => ({
  endpoint: `https://push.example.com/send/${suffix}`,
  keys: { p256dh: randomBytes(65).toString('base64url'), auth: randomBytes(16).toString('base64url') },
});

beforeAll(async () => {
  ({ userId } = await createTestUser(['traveler']));
});

afterAll(async () => {
  await cleanupTestUsers();
  await sql.end();
});

describe('push subscriptions', () => {
  it('stores a subscription encrypted, addressed by a hash of its endpoint', async () => {
    const one = subscription('abc');
    await notificationsService.subscribe(userId, one, 'test-agent');

    const [row] = await sql<Array<{ sealed: Uint8Array; hash: string }>>`
      SELECT subscription_encrypted AS sealed, endpoint_hash AS hash FROM push_subscriptions WHERE user_id = ${userId}
    `;
    const stored = Buffer.from(row.sealed).toString('utf8');
    expect(stored).not.toContain('push.example.com');
    expect(stored).not.toContain(one.keys.auth);
    expect(row.hash).not.toContain('push.example.com');

    // It is still usable by the application that holds the key.
    const active = await notificationsRepository.activeSubscriptions(userId);
    expect(active.map((entry) => entry.subscription.endpoint)).toEqual([one.endpoint]);
  });

  it('resubscribing the same endpoint updates it rather than duplicating', async () => {
    await notificationsService.subscribe(userId, subscription('abc'), 'second-agent');
    expect(await notificationsRepository.countActive(userId)).toBe(1);
  });

  it('refuses something that is not a push endpoint', async () => {
    await expect(
      notificationsService.subscribe(userId, { ...subscription('x'), endpoint: 'http://insecure.example/send' }, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('revokes a subscription the traveller turns off', async () => {
    const two = subscription('def');
    await notificationsService.subscribe(userId, two, null);
    expect(await notificationsRepository.countActive(userId)).toBe(2);

    await notificationsService.unsubscribe(userId, two.endpoint);
    expect(await notificationsRepository.countActive(userId)).toBe(1);
  });

  it('drops an endpoint the push service says is gone', async () => {
    const [stored] = await notificationsRepository.activeSubscriptions(userId);
    const failures = await notificationsRepository.recordFailure(stored.id, 410);
    expect(failures).toBe(1);

    await notificationsRepository.removeSubscription(stored.id);
    expect(await notificationsRepository.countActive(userId)).toBe(0);
  });
});

describe('preferences', () => {
  it('starts with commercial suggestions off, and saves changes', async () => {
    expect(await notificationsService.preferences(userId)).toEqual(DEFAULT_PREFERENCES);

    await notificationsService.savePreferences(userId, {
      categories: { ...DEFAULT_PREFERENCES.categories, crowd: false, local_offer: true },
      quietFrom: '22:00',
      quietUntil: '06:00',
    });

    const saved = await notificationsService.preferences(userId);
    expect(saved).toEqual({
      categories: { safety: true, trip_reminder: true, crowd: false, local_offer: true },
      quietFrom: '22:00',
      quietUntil: '06:00',
    });
  });

  it('refuses a malformed quiet hour', async () => {
    await expect(
      notificationsService.savePreferences(userId, { ...DEFAULT_PREFERENCES, quietFrom: '9pm' }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('notify', () => {
  // 22:30 IST is inside the saved quiet hours.
  const night = new Date('2026-09-23T17:00:00Z');
  const midday = new Date('2026-09-23T06:30:00Z');

  it('sends a safety alert at night, and keeps it in the alert centre', async () => {
    const delivery = await notificationsService.notify(
      userId,
      { tripId: null, category: 'safety', trigger: 'test_safety', title: 'A stop is closed', body: 'Path collapsed.' },
      night,
    );

    // No device is subscribed, so it waits for one rather than claiming to have been sent.
    expect(delivery).toMatchObject({ state: 'queued', reason: expect.stringMatching(/not allowed notifications/) });
    const alerts = await notificationsService.alerts(userId);
    expect(alerts.some((alert) => alert.title === 'A stop is closed')).toBe(true);
  });

  it('holds a reminder until quiet hours end', async () => {
    const delivery = await notificationsService.notify(
      userId,
      { tripId: null, category: 'trip_reminder', trigger: 'test_reminder', title: 'Trip soon', body: 'Pack the offline pack.' },
      night,
    );
    expect(delivery).toMatchObject({ state: 'held', reason: expect.stringMatching(/quiet hours/) });
    expect(delivery!.deliverAfter!.getTime()).toBeGreaterThan(night.getTime());
  });

  it('drops a category that is turned off, saying why', async () => {
    const delivery = await notificationsService.notify(
      userId,
      { tripId: null, category: 'crowd', trigger: 'test_crowd', title: 'Busy', body: 'Heavy crowd expected.' },
      midday,
    );
    expect(delivery).toMatchObject({ state: 'suppressed', reason: expect.stringMatching(/turned off/) });
  });

  it('records the same trigger once per window', async () => {
    const first = await notificationsService.notify(
      userId,
      { tripId: null, category: 'safety', trigger: 'repeat', title: 'Once', body: 'Only once.', windowMinutes: 360 },
      midday,
    );
    const second = await notificationsService.notify(
      userId,
      { tripId: null, category: 'safety', trigger: 'repeat', title: 'Twice', body: 'Should not appear.', windowMinutes: 360 },
      midday,
    );

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const alerts = await notificationsService.alerts(userId);
    expect(alerts.filter((alert) => alert.title === 'Twice')).toHaveLength(0);
  });

  it('releases held notifications once quiet hours are over', async () => {
    const morning = new Date('2026-09-24T03:00:00Z');
    const released = await notificationsService.releaseHeld(userId, morning);
    expect(released).toBeGreaterThanOrEqual(1);

    const alerts = await notificationsService.alerts(userId);
    expect(alerts.find((alert) => alert.title === 'Trip soon')?.state).not.toBe('held');
  });
});
