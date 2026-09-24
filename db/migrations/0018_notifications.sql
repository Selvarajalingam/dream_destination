-- PRD Part I §11.4 and backlog E12-S06/S07 — push subscriptions, the
-- preferences that govern them, and what was actually sent.

CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- One switch per category. Safety and commercial are never one switch.
  categories JSONB NOT NULL DEFAULT '{"safety": true, "trip_reminder": true, "crowd": true, "local_offer": false}'::jsonb,
  -- Local clock times in India. Equal values mean no quiet hours.
  quiet_from TIME NOT NULL DEFAULT '21:30',
  quiet_until TIME NOT NULL DEFAULT '07:30',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What was queued, held, suppressed or sent. Also the in-app alert centre,
-- so a traveller who refused permission still sees what they would have been
-- told.
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('safety', 'trip_reminder', 'crowd', 'local_offer')),
  trigger_key TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  state TEXT NOT NULL CHECK (state IN ('queued', 'held', 'sent', 'suppressed', 'failed')),
  -- Why it was held or suppressed, in the words shown to the traveller.
  reason TEXT,
  deliver_after TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  -- Trip, trigger and time window together, per §11.4's deduplication rule.
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The deduplication rule itself, held by the database rather than by whoever
-- remembers to check first.
CREATE UNIQUE INDEX notification_dedupe_idx ON notification_deliveries(user_id, dedupe_key);
CREATE INDEX notification_user_idx ON notification_deliveries(user_id, created_at DESC);

-- Delivery failures, so a dead endpoint can be dropped (§11.4).
ALTER TABLE push_subscriptions
  ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_failure_at TIMESTAMPTZ,
  ADD COLUMN last_failure_status INTEGER;
