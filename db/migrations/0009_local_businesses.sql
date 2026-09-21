-- PRD Part II §6.9 — Local businesses.
CREATE TABLE local_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  operating_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_band SMALLINT CHECK (price_band BETWEEN 1 AND 4),
  accessibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_methods TEXT[],
  status record_status NOT NULL DEFAULT 'pending',
  sponsored BOOLEAN NOT NULL DEFAULT false,
  last_owner_update_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX local_business_geo_idx ON local_businesses USING GIST(location);
CREATE INDEX local_business_category_idx ON local_businesses(category, status);

ALTER TABLE itinerary_items
  ADD CONSTRAINT itinerary_items_local_business_fk
  FOREIGN KEY (local_business_id) REFERENCES local_businesses(id) ON DELETE SET NULL;

CREATE TABLE business_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES local_businesses(id) ON DELETE CASCADE,
  status verification_status NOT NULL,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewer_user_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
