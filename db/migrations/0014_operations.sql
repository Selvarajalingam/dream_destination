-- Operations support for the remaining admin screens: A01, A05, A06, A07, A08.

-- A06 Incident Triage: the PRD asks the screen to show the owner's response
-- alongside the report. The action log itself lives in audit_logs.
ALTER TABLE incident_reports
  ADD COLUMN owner_response TEXT,
  ADD COLUMN owner_responded_at TIMESTAMPTZ,
  ADD COLUMN suspended_entity BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX incident_reports_open_idx
  ON incident_reports(status, severity, created_at DESC);

-- A05 Content Freshness: assignment and reminders for stale records. There is
-- deliberately no "approved" column here. PRD E11-S07: bulk approval is not
-- available, so a record only becomes fresh again when someone re-verifies
-- it at its source.
CREATE TABLE freshness_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('rule', 'help_facility', 'place', 'business', 'source')),
  entity_id UUID NOT NULL,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  last_reminded_at TIMESTAMPTZ,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

-- A07 Local Business Review: sponsored placement is approved separately from
-- listing verification (PRD Part I A07), so it carries its own request and
-- decision rather than being a flag flipped during onboarding.
ALTER TABLE local_businesses
  ADD COLUMN sponsorship_requested_at TIMESTAMPTZ,
  ADD COLUMN sponsorship_decided_at TIMESTAMPTZ,
  ADD COLUMN sponsorship_decision_reason TEXT;

-- A08 Impact Analytics: PRD E14-S01 requires a versioned event schema, and
-- E14-S04 requires simulated demo events to be separable from pilot
-- behaviour. Both are columns rather than conventions inside the JSON.
ALTER TABLE analytics_events
  ADD COLUMN schema_version TEXT NOT NULL DEFAULT '1',
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN entity_type TEXT,
  ADD COLUMN entity_id UUID;

CREATE INDEX analytics_events_entity_idx
  ON analytics_events(entity_type, entity_id, event_name);
CREATE INDEX analytics_events_demo_idx
  ON analytics_events(is_demo, occurred_at DESC);
