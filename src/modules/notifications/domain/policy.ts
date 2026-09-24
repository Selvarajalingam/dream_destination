/**
 * Notification policy — PRD Part I §11.4, backlog E12-S06 and E12-S07.
 *
 * "Respect category settings and quiet hours. Deduplicate by trip, trigger,
 * and time window. Separate safety alerts from commercial recommendations.
 * Remove subscriptions after repeated permanent delivery errors."
 *
 * Safety and commercial are never the same switch, and quiet hours silence
 * everything except safety, which is the one category a traveller would not
 * thank us for holding until morning.
 */

export type Category = 'safety' | 'trip_reminder' | 'crowd' | 'local_offer';

export const CATEGORIES: ReadonlyArray<{
  key: Category;
  label: string;
  detail: string;
  /** Commercial categories are off unless the traveller turns them on. */
  commercial: boolean;
  /** Safety is not held for quiet hours. */
  urgent: boolean;
}> = [
  {
    key: 'safety',
    label: 'Safety alerts',
    detail: 'A place on your trip is closed or reported unsafe. Sent even during quiet hours.',
    commercial: false,
    urgent: true,
  },
  {
    key: 'trip_reminder',
    label: 'Trip reminders',
    detail: 'Your trip is approaching, and what to do before you leave.',
    commercial: false,
    urgent: false,
  },
  {
    key: 'crowd',
    label: 'Crowd warnings',
    detail: 'A stop on your plan is expected to be heavily crowded.',
    commercial: false,
    urgent: false,
  },
  {
    key: 'local_offer',
    label: 'Local business suggestions',
    detail: 'Nearby verified businesses on your route. Off unless you turn it on.',
    commercial: true,
    urgent: false,
  },
];

export const DEFAULT_CATEGORIES: Record<Category, boolean> = {
  safety: true,
  trip_reminder: true,
  crowd: true,
  local_offer: false,
};

export type Preferences = {
  categories: Record<Category, boolean>;
  /** "21:30" and "07:30" in India. Equal values mean no quiet hours. */
  quietFrom: string;
  quietUntil: string;
};

export const DEFAULT_PREFERENCES: Preferences = {
  categories: DEFAULT_CATEGORIES,
  quietFrom: '21:30',
  quietUntil: '07:30',
};

const IST_OFFSET_MINUTES = 330;

const toMinutes = (clock: string): number => {
  const [hour, minute] = clock.split(':').map(Number);
  return hour * 60 + minute;
};

/** Minutes past midnight in India. India has no daylight saving. */
export function indiaMinutes(at: Date): number {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function inQuietHours(at: Date, preferences: Preferences): boolean {
  const from = toMinutes(preferences.quietFrom);
  const until = toMinutes(preferences.quietUntil);
  if (from === until) return false;

  const now = indiaMinutes(at);
  // Quiet hours usually wrap midnight, so the two cases are different.
  return from < until ? now >= from && now < until : now >= from || now < until;
}

/** The moment quiet hours end, as an instant. */
export function quietHoursEnd(at: Date, preferences: Preferences): Date {
  const until = toMinutes(preferences.quietUntil);
  const now = indiaMinutes(at);
  const minutesAway = until > now ? until - now : 24 * 60 - now + until;
  return new Date(at.getTime() + minutesAway * 60_000);
}

export type Decision =
  | { action: 'send' }
  | { action: 'hold'; deliverAfter: Date; reason: string }
  | { action: 'suppress'; reason: string };

/**
 * Whether one notification goes out now, waits, or is dropped. `lastSentAt`
 * is when the same trigger last reached this traveller.
 */
export function decideDelivery(input: {
  category: Category;
  preferences: Preferences;
  now: Date;
  lastSentAt: Date | null;
  dedupeWindowMinutes: number;
}): Decision {
  if (input.preferences.categories[input.category] !== true) {
    return { action: 'suppress', reason: 'You have this kind of notification turned off.' };
  }

  if (
    input.lastSentAt !== null &&
    input.now.getTime() - input.lastSentAt.getTime() < input.dedupeWindowMinutes * 60_000
  ) {
    return { action: 'suppress', reason: 'You were already told this recently.' };
  }

  const urgent = CATEGORIES.find((entry) => entry.key === input.category)?.urgent === true;
  if (!urgent && inQuietHours(input.now, input.preferences)) {
    return {
      action: 'hold',
      deliverAfter: quietHoursEnd(input.now, input.preferences),
      reason: 'Held until your quiet hours end.',
    };
  }

  return { action: 'send' };
}

/** Trip, trigger and window together, so the same thing is not sent twice. */
export function dedupeKey(input: { tripId: string | null; trigger: string; at: Date; windowMinutes: number }): string {
  const window = Math.floor(input.at.getTime() / (input.windowMinutes * 60_000));
  return `${input.tripId ?? 'none'}:${input.trigger}:${window}`;
}

/**
 * E12-S06: "Permission request appears only after trip save/Trip Mode
 * activation." Nothing asks on a first visit.
 */
export function mayAskForPermission(state: { hasSavedTrip: boolean; tripModeActive: boolean; alreadyAsked: boolean }): boolean {
  if (state.alreadyAsked) return false;
  return state.hasSavedTrip || state.tripModeActive;
}

/** HTTP statuses a push service uses to say an endpoint is gone for good. */
const PERMANENT_STATUSES = new Set([404, 410]);

export function shouldRemoveSubscription(input: { status: number | null; failureCount: number }): boolean {
  if (input.status !== null && PERMANENT_STATUSES.has(input.status)) return true;
  return input.failureCount >= 5;
}

// --- Scheduled reminders (E12-S07) ----------------------------------------

export type Reminder = {
  category: Category;
  trigger: string;
  title: string;
  body: string;
  /** When it should reach the traveller. */
  at: Date;
  windowMinutes: number;
};

const DAY_MS = 86_400_000;

/**
 * The reminders a trip earns: a countdown, and the checklist items that are
 * still outstanding. Pure, so the schedule can be tested against a clock.
 */
export function tripReminders(input: {
  tripId: string;
  tripTitle: string;
  startDate: Date | null;
  now: Date;
  offlinePackSaved: boolean;
}): Reminder[] {
  if (input.startDate === null) return [];

  const daysAway = Math.ceil((input.startDate.getTime() - input.now.getTime()) / DAY_MS);
  const reminders: Reminder[] = [];

  const countdowns: Array<{ days: number; trigger: string; body: string }> = [
    { days: 7, trigger: 'countdown_7', body: 'A week to go. Check the opening hours and rules for your first day.' },
    { days: 1, trigger: 'countdown_1', body: 'You travel tomorrow. Save your offline pack before you leave.' },
  ];

  for (const countdown of countdowns) {
    if (daysAway === countdown.days) {
      reminders.push({
        category: 'trip_reminder',
        trigger: countdown.trigger,
        title: input.tripTitle,
        body: countdown.body,
        at: input.now,
        // One a day at most for a countdown.
        windowMinutes: 24 * 60,
      });
    }
  }

  if (!input.offlinePackSaved && daysAway <= 2 && daysAway >= 0) {
    reminders.push({
      category: 'trip_reminder',
      trigger: 'offline_pack',
      title: input.tripTitle,
      body: 'Signal is unreliable on parts of this trip. Save the offline pack while you have a connection.',
      at: input.now,
      windowMinutes: 24 * 60,
    });
  }

  return reminders;
}
