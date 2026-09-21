-- PRD Part II §6.5 — Trips and itinerary.
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'upcoming', 'active', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  origin_text TEXT,
  origin_point GEOGRAPHY(POINT, 4326),
  party JSONB NOT NULL DEFAULT '{}'::jsonb,
  trip_brief JSONB NOT NULL,
  total_budget_inr INTEGER,
  active_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trips_owner_idx ON trips(owner_user_id, status, start_date);

CREATE TABLE itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  day_number SMALLINT NOT NULL,
  date DATE,
  title TEXT,
  UNIQUE (trip_id, day_number)
);

CREATE TABLE itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE SET NULL,
  local_business_id UUID,
  item_type TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  sort_order INTEGER NOT NULL,
  locked_by_user BOOLEAN NOT NULL DEFAULT false,
  travel_from_previous JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
  booking_state TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (itinerary_day_id, sort_order)
);
