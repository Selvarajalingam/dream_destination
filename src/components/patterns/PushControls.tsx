'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { ApiProblemError, api, ensureSession } from '@/lib/api-client';
import { CATEGORIES, type Preferences } from '@/modules/notifications/domain/policy';

/**
 * Permission and preferences for push notifications — PRD backlog E12-S06.
 *
 * Nothing asks for permission on arrival. The prompt only appears where the
 * traveller has already saved a trip or started Trip Mode, and it says what
 * would be sent before it asks.
 */

type Status = {
  pushConfigured: boolean;
  publicKey: string | null;
  subscriptions: number;
};

const describe = (caught: unknown, fallback: string): string =>
  caught instanceof ApiProblemError ? caught.problem.detail ?? caught.problem.title : fallback;

/** base64url VAPID key to the byte array the browser wants. */
function toApplicationServerKey(publicKey: string): ArrayBuffer {
  const padded = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer;
}

export function EnablePush({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    setPermission(supported ? Notification.permission : 'unsupported');
    void api
      .get<Status>('/api/v1/notifications')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const enable = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // Asked here, inside a click, and never on page load.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted') {
        setMessage('No notifications will be sent. You can still read everything in the alert centre.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKey(status!.publicKey!),
      });

      await ensureSession();
      await api.post('/api/v1/notifications/subscribe', subscription.toJSON());
      setStatus((previous) => (previous === null ? previous : { ...previous, subscriptions: previous.subscriptions + 1 }));
      setMessage('This device will receive safety alerts and trip reminders.');
    } catch (caught) {
      setError(describe(caught, 'Notifications could not be turned on for this device.'));
    } finally {
      setBusy(false);
    }
  }, [status]);

  if (status === null) return null;

  if (!status.pushConfigured) {
    return (
      <p data-testid="push-unconfigured" className={`text-[14px] text-text-secondary ${compact ? '' : 'mt-2'}`}>
        Push notifications are not configured in this environment, so nothing is sent to your device. Everything that
        would have been sent is in the alert centre.
      </p>
    );
  }

  if (status.subscriptions > 0 && permission === 'granted') {
    return (
      <p data-testid="push-enabled" className="text-[14px] text-status-good-text">
        Notifications are on for this device.
      </p>
    );
  }

  if (permission === 'denied' || permission === 'unsupported') {
    return (
      <p data-testid="push-denied" className="text-[14px] text-text-secondary">
        {permission === 'denied'
          ? 'Your browser is blocking notifications for this site. The alert centre still has everything.'
          : 'This browser cannot show notifications. The alert centre still has everything.'}
      </p>
    );
  }

  return (
    <div data-testid="push-prompt">
      {!compact && (
        <p className="text-[14px] text-text-secondary">
          We can tell you if a place on your trip closes or is reported unsafe, and remind you before you travel.
          Local business suggestions stay off unless you turn them on.
        </p>
      )}
      <Button className="mt-2" size={compact ? 'small' : 'medium'} disabled={busy} onClick={() => void enable()}>
        {busy ? 'Asking…' : 'Turn on notifications'}
      </Button>
      <p role="status" aria-live="polite" className="mt-1 text-[14px]">
        {message}
      </p>
      {error !== null && (
        <p role="alert" className="mt-1 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function NotificationPreferences({ initial }: { initial: Preferences }) {
  const [preferences, setPreferences] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: Preferences): Promise<void> => {
    setPreferences(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put('/api/v1/notifications/preferences', next);
      setSaved(true);
    } catch (caught) {
      setError(describe(caught, 'Your preferences could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="notification-preferences">
      <fieldset disabled={busy}>
        <legend className="text-[16px] font-[650]">What we may send</legend>
        <ul className="mt-2 space-y-2">
          {CATEGORIES.map((category) => (
            <li key={category.key} className="border-t border-border-subtle pt-2">
              <label className="flex min-h-[44px] items-start gap-3 text-[14px]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={preferences.categories[category.key]}
                  onChange={(event) =>
                    void save({
                      ...preferences,
                      categories: { ...preferences.categories, [category.key]: event.target.checked },
                    })
                  }
                />
                <span>
                  <span className="block font-[650]">
                    {category.label}
                    {category.commercial && <span className="ml-2 rounded-full bg-surface-subtle px-2 py-0.5 text-[13px] font-[650]">Commercial</span>}
                  </span>
                  <span className="block text-text-secondary">{category.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset disabled={busy} className="mt-4">
        <legend className="text-[16px] font-[650]">Quiet hours</legend>
        <p className="text-[14px] text-text-secondary">
          Nothing but safety alerts is sent between these times. The rest waits until quiet hours end.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="text-[14px]">
            <span className="block font-[650]">From</span>
            <input
              type="time"
              value={preferences.quietFrom}
              onChange={(event) => void save({ ...preferences, quietFrom: event.target.value })}
              className="mt-1 min-h-[44px] rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]"
            />
          </label>
          <label className="text-[14px]">
            <span className="block font-[650]">Until</span>
            <input
              type="time"
              value={preferences.quietUntil}
              onChange={(event) => void save({ ...preferences, quietUntil: event.target.value })}
              className="mt-1 min-h-[44px] rounded-xl border border-text-secondary/60 bg-surface-base px-3 text-[16px]"
            />
          </label>
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="mt-2 text-[14px] text-text-secondary">
        {busy ? 'Saving…' : saved ? 'Saved.' : ''}
      </p>
      {error !== null && (
        <p role="alert" className="mt-1 text-[14px] font-[650] text-status-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Asks the server which reminders this trip has earned, and releases anything
 * held over quiet hours. Runs where a trip is open, which is also the only
 * place the PRD allows a permission prompt.
 */
export function TripReminderCheck({ tripId }: { tripId: string }) {
  useEffect(() => {
    void ensureSession()
      .then(() => api.post(`/api/v1/trips/${tripId}/reminders`, {}))
      .catch(() => undefined);
  }, [tripId]);

  return null;
}
