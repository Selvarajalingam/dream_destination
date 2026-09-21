-- Tables the PRD implies but does not spell out.
--
-- sessions: PRD Part II §7.2 requires an HttpOnly session cookie and CSRF
-- protection; PRD Part I T01 requires a guest to generate one plan before
-- authentication.
--
-- offline_packs and trips.version: PRD Part II §7.1 requires version numbers
-- for concurrent itinerary edits, and §11.2/§11.3 require a versioned trip
-- pack manifest with conflict-aware synchronization.

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  is_guest BOOLEAN NOT NULL DEFAULT false,
  csrf_secret TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CHECK (is_guest OR user_id IS NOT NULL)
);

CREATE INDEX sessions_user_idx ON sessions(user_id, expires_at DESC);

CREATE TABLE offline_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  manifest JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (trip_id, version)
);

ALTER TABLE trips ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Idempotency keys for trip generation, verification decisions and booking
-- references. PRD Part II §7.1.
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Privacy-aware product and impact events. PRD Part I §13 forbids storing raw
-- chat, continuous precise location, medical information or document content.
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  screen TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX analytics_events_name_idx ON analytics_events(event_name, occurred_at DESC);
