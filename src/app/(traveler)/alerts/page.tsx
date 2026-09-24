import Link from 'next/link';
import { notificationsService } from '@/modules/notifications/service';
import { CATEGORIES, type Category } from '@/modules/notifications/domain/policy';
import { Card } from '@/components/ui/primitives';
import { EmptyState } from '@/components/states/states';
import { EnablePush, NotificationPreferences } from '@/components/patterns/PushControls';
import { getSession } from '@/server/session';
import { formatSourceDate } from '@/shared/time';

/**
 * The alert centre — PRD backlog E12-S05, with the notification preferences
 * E12-S06 requires.
 *
 * Everything the product would have told the traveller is here, including
 * what was held for quiet hours and what was dropped as a repeat, so turning
 * notifications down costs timing rather than information.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Alerts' };

const STATE_LABEL: Record<string, string> = {
  sent: 'Sent to your devices',
  queued: 'Waiting for a device',
  held: 'Held until quiet hours end',
  suppressed: 'Not sent',
  failed: 'Could not be sent',
};

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((entry) => [entry.key, entry.label])) as Record<Category, string>;

export default async function AlertsPage() {
  const session = await getSession();
  const signedIn = session !== null && !session.isGuest && session.userId !== null;

  if (!signedIn) {
    return (
      <div>
        <h1 className="text-[26px] lg:text-[32px]">Alerts</h1>
        <div className="mt-5">
          <EmptyState
            title="Sign in to see your alerts"
            reason="Alerts are about your own trips, so they belong to your account."
            action={
              <Link
                href="/login?next=/alerts"
                data-touch-target
                className="inline-flex min-h-[44px] items-center rounded-xl bg-brand-primary px-4 text-[14px] font-[650] text-white"
              >
                Sign in
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  // Anything whose quiet hours have passed goes out as the page is opened.
  await notificationsService.releaseHeld(session.userId!);
  const [alerts, preferences] = await Promise.all([
    notificationsService.alerts(session.userId!),
    notificationsService.preferences(session.userId!),
  ]);
  await notificationsService.markRead(session.userId!);

  return (
    <div>
      <h1 className="text-[26px] lg:text-[32px]">Alerts</h1>
      <p className="mt-2 text-[16px] text-text-secondary">
        Everything we would tell you about your trips, whether or not it reached your device.
      </p>

      <Card className="mt-4 p-4">
        <h2 className="text-[18px] font-[650]">Notifications on this device</h2>
        <div className="mt-2">
          <EnablePush />
        </div>
      </Card>

      <section className="mt-6" aria-labelledby="alerts-heading">
        <h2 id="alerts-heading" className="text-[21px]">
          Recent
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-2 text-[16px] text-text-secondary">Nothing yet. Plan a trip and we will keep an eye on it.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Card className="p-4" data-testid="alert" data-state={alert.state} data-category={alert.category}>
                  <p className="text-[13px] font-[650] uppercase tracking-wide text-text-secondary">
                    {CATEGORY_LABEL[alert.category]} · {formatSourceDate(alert.createdAt)}
                  </p>
                  <p className="mt-1 text-[16px] font-[650]">{alert.title}</p>
                  <p className="mt-1 text-[16px]">{alert.body}</p>
                  <p className="mt-2 text-[14px] text-text-secondary">
                    {STATE_LABEL[alert.state] ?? alert.state}
                    {alert.reason !== null && ` — ${alert.reason}`}
                  </p>
                  {alert.url !== null && (
                    <Link href={alert.url} className="mt-2 inline-block text-[14px] font-[650] text-brand-primary underline underline-offset-2">
                      Open
                    </Link>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="preferences-heading">
        <h2 id="preferences-heading" className="text-[21px]">
          What you want to hear about
        </h2>
        <Card className="mt-3 p-4">
          <NotificationPreferences initial={preferences} />
        </Card>
      </section>
    </div>
  );
}
