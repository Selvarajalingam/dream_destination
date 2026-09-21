-- PRD Part II §9.3 — Dream Score persistence. Components, weights, algorithm
-- version and the input snapshot are stored so any score can be re-explained.
CREATE TABLE recommendation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  destination_id UUID NOT NULL REFERENCES destinations(id),
  total_score NUMERIC(5,2) NOT NULL,
  components JSONB NOT NULL,
  weights JSONB NOT NULL,
  algorithm_version TEXT NOT NULL,
  input_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX recommendation_scores_trip_idx
  ON recommendation_scores(trip_id, total_score DESC);
