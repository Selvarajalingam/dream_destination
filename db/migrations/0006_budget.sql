-- PRD Part II §6.6 — Budget. All currency in minor units (paise).
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  total_limit_minor BIGINT NOT NULL,
  reserve_minor BIGINT NOT NULL DEFAULT 0,
  expected_total_minor BIGINT NOT NULL DEFAULT 0,
  high_total_minor BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE budget_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  itinerary_item_id UUID REFERENCES itinerary_items(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  low_minor BIGINT,
  expected_minor BIGINT NOT NULL,
  high_minor BIGINT,
  price_state TEXT NOT NULL CHECK (price_state IN ('live', 'partner', 'historical', 'manual')),
  source_id UUID REFERENCES source_records(id) ON DELETE SET NULL,
  refreshed_at TIMESTAMPTZ,
  locked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX budget_items_budget_idx ON budget_line_items(budget_id, category);
