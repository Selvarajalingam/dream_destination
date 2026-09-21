-- PRD Part II §6.7 — Crowd intelligence.
CREATE TABLE crowd_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  band crowd_band NOT NULL,
  occupancy_ratio NUMERIC(5,4),
  source_id UUID REFERENCES source_records(id) ON DELETE SET NULL,
  sample_size INTEGER,
  confidence NUMERIC(4,3) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_aggregate BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX crowd_observation_lookup_idx
  ON crowd_observations(place_id, observed_at DESC);

CREATE TABLE crowd_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  band crowd_band NOT NULL,
  expected_occupancy_ratio NUMERIC(5,4),
  confidence NUMERIC(4,3) NOT NULL,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (place_id, starts_at, model_version)
);

CREATE TABLE crowd_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  band crowd_band NOT NULL,
  reason TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
