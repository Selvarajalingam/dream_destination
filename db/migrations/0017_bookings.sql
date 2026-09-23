-- PRD Part I T13, backlog E13 — booking handoff.
--
-- What the traveller chose to pursue, in which state, and the offer as it
-- stood when they left for the provider. No payment details are stored, and
-- the reference column is checked to stay short so a card number cannot be
-- pasted into it even if the application layer were bypassed.
CREATE TABLE trip_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stay', 'transport')),
  state TEXT NOT NULL CHECK (
    state IN ('estimated', 'available_when_checked', 'handoff_initiated', 'reference_added', 'confirmed_by_provider')
  ),
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  -- The offer exactly as shown when the traveller acted on it, so the screen
  -- can say what they saw rather than what the provider says now.
  offer_snapshot JSONB NOT NULL,
  handoff_at TIMESTAMPTZ,
  reference TEXT CHECK (reference IS NULL OR char_length(reference) BETWEEN 3 AND 60),
  reference_added_at TIMESTAMPTZ,
  -- Who says it is confirmed: the provider, or the traveller.
  confirmation_evidence TEXT CHECK (confirmation_evidence IN ('provider_callback', 'traveller_attested')),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state = 'confirmed_by_provider') = (confirmed_at IS NOT NULL)),
  CHECK (confirmed_at IS NULL OR (reference IS NOT NULL AND confirmation_evidence IS NOT NULL))
);

CREATE INDEX trip_bookings_trip_idx ON trip_bookings(trip_id, kind);
