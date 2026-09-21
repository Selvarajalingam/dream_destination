-- PRD Part II §6.3 — Preference memory.
CREATE TABLE preference_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  crowd_tolerance TEXT,
  travel_pace TEXT,
  budget_style TEXT,
  preferred_transport TEXT[],
  interests TEXT[],
  dietary_preferences TEXT[],
  accessibility_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE preference_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key TEXT NOT NULL,
  memory_value JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user_set', 'inferred_pending', 'user_confirmed')),
  confidence NUMERIC(4,3),
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, memory_key)
);
