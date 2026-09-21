-- PRD Part II §6.4 — Sources and catalog.
CREATE TABLE source_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type source_type NOT NULL,
  source_url TEXT,
  issuing_authority TEXT,
  geography_scope TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state_code TEXT NOT NULL,
  district TEXT,
  summary TEXT NOT NULL,
  center GEOGRAPHY(POINT, 4326) NOT NULL,
  themes TEXT[] NOT NULL DEFAULT '{}',
  minimum_days SMALLINT,
  maximum_days SMALLINT,
  base_cost_low_inr INTEGER,
  base_cost_high_inr INTEGER,
  status record_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX destinations_geo_idx ON destinations USING GIST(center);
CREATE INDEX destinations_themes_idx ON destinations USING GIN(themes);

CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_visit_minutes INTEGER,
  price_low_inr INTEGER,
  price_high_inr INTEGER,
  accessibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_hidden_gem BOOLEAN NOT NULL DEFAULT false,
  status record_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX places_geo_idx ON places USING GIST(location);
CREATE INDEX places_destination_idx ON places(destination_id, status);

CREATE TABLE place_sources (
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES source_records(id) ON DELETE RESTRICT,
  field_scope TEXT NOT NULL,
  PRIMARY KEY (place_id, source_id, field_scope)
);
